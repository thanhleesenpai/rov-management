# Backend — Module ROV / Project / Trip: Giải thích chi tiết mã nguồn

> Tài liệu này giải thích từng file mã nguồn thuộc 3 module lõi của hệ thống: `rovs`, `projects`, `trips` (bao gồm `batch.controller.js` — pipeline upload ZIP hàng loạt từ ROV). Mục tiêu: chuẩn bị trả lời hội đồng phản biện đồ án tốt nghiệp.

---

## Tổng quan quan hệ dữ liệu ROV → Project → Trip → (Sensor/DVL/Sonar/Media/Snapshot)

### Nomenclature quan trọng (đã đổi tên so với code cũ)

| Tên mới (hiện tại) | Tên cũ | Ý nghĩa thực tế |
|---|---|---|
| **Project** | Trip | Chuyến khảo sát lớn — container ngoài cùng, gom nhiều Trip. Có ROV được gán, có thời gian bắt đầu/kết thúc, trạng thái, vị trí khảo sát, và AI Summary. |
| **Trip** | Dive | Một lần lặn/recording session cụ thể bên trong 1 Project. Đây là nơi gắn sensor data, DVL, sonar, media, snapshot. |

MongoDB collections tương ứng: **`projects`** và **`trips`** (đã đổi tên khỏi `trips`/`dives` cũ). Điều này quan trọng vì trong code, biến `Trip` (model) trỏ tới collection `trips`, và biến `Project` trỏ tới collection `projects` — dễ nhầm với tên gọi cũ nếu đọc code cũ hoặc tài liệu cũ.

### Sơ đồ quan hệ 1-nhiều

```
ROV (rovs)
  │  1
  │
  │  N  (rov: ObjectId ref ROV, required)
  ▼
Project (projects)                     ← "chuyến khảo sát lớn"
  - name, description, location, gpsLocation, locationName
  - startTime, endTime, status (planned/ongoing/completed/cancelled)
  - createdBy: ref User
  - aiSummary: { vi, en, generatedAt, status }
  │  1
  │
  │  N  (project: ObjectId ref Project, required)
  ▼
Trip (trips)                           ← "1 lần lặn / recording session"
  - title, description, status (pending/running/done/failed)
  - sensorCount, dvlCount, sonarCount   (đếm nhanh, cache trong doc)
  - gpsLocation, locationName           (GPS của LẦN LẶN CỤ THỂ, không phải cả Project)
  - createdBy: ref User
  │
  │  N (trip: ObjectId ref Trip) — mỗi loại data con dưới đây độc lập, không lồng nhau
  │
  ├──▶ SensorData (sensordatas)   — nhiều reading theo timestamp, có sourceFile (multi-file, TASK 6d)
  ├──▶ DVLData (dvldatas)         — trajectory points, có sourceFile
  ├──▶ SonarFile (sonarfiles)     — file sonar nhị phân lưu S3, nhiều file/trip
  ├──▶ Media (media)              — video/ảnh lưu S3 (qua presigned URL)
  └──▶ Snapshot (snapshots)       — evidence: photo capture hoặc video clip đánh dấu, có thể có aiLabels (YOLO)
```

### Sự khác biệt cốt lõi Project vs Trip

- **Project** = đơn vị quản lý cấp cao: 1 chuyến ra khơi/khảo sát có thể kéo dài nhiều ngày, dùng 1 ROV cụ thể, có thể sinh ra **nhiều Trip** (nhiều lần lặn khác nhau trong cùng chuyến khảo sát). Project có AI Summary tổng hợp toàn bộ các Trip bên trong.
- **Trip** = đơn vị dữ liệu thô cấp thấp: ứng với đúng 1 lần ROV lặn xuống nước và ghi lại dữ liệu (sensor, DVL, sonar, video, ảnh). GPS lưu ở Trip (không phải Project) vì mỗi lần lặn có thể ở vị trí khác nhau trong cùng 1 chuyến khảo sát.
- Quan hệ: `Trip.project` là bắt buộc (`required`), một Project không có Trip nào vẫn tồn tại được (ví dụ Project vừa tạo, status = `planned`).
- Route lồng nhau thể hiện đúng quan hệ này: `POST /api/v1/projects/:projectId/trips` (tạo Trip trong Project) — implement bằng `router.use('/:projectId/trips', tripRoutes)` trong `project.routes.js`, còn `trip.routes.js` dùng `express.Router({ mergeParams: true })` để nhận được `projectId` từ router cha.

---

## Tổng quan cơ chế Batch Upload (ZIP folder từ ROV)

**File chính:** `backend/src/modules/trips/batch.controller.js`, endpoint `POST /api/v1/trips/:id/data/upload-batch` (đã mount qua `trip.routes.js`).

### Bối cảnh thực tế

ROV khi lặn xong sinh ra một thư mục chứa nhiều loại file (sensor log CSV, DVL JSON, sonar binary, video, ảnh, và optional file manifest `trip.json`). Operator, sau khi về bờ (không có wifi ngoài khơi), nén cả thư mục thành 1 file ZIP và upload lên qua web UI. Backend phải:

1. Nhận ZIP (hoặc nhiều file rời — cả 2 đều được hỗ trợ qua `multer.any()`).
2. Giải nén trong bộ nhớ (không ghi ra disk).
3. Phân loại từng file theo **tên file** (không dựa vào extension đơn thuần, mà theo prefix quy ước: `log_*.csv`, `dvl_*.json`, `*.sonar`, video/ảnh theo extension).
4. Với file sensor CSV: tự động detect delimiter (`;`/`,`/tab) và decimal separator (dấu phẩy kiểu châu Âu hay dấu chấm), map header linh hoạt theo `COLUMN_MAP`, parse timestamp (ghép ngày từ tên file + giờ trong cột `Time`, theo giờ Việt Nam UTC+7), rồi lưu vào MongoDB (`SensorData`), có logic "append + trim overlap" thay vì overwrite toàn bộ.
5. Với file DVL: dùng lại parser `parseDvlBuffer` từ module DVL (không triển khai lại) để parse JSON, chỉ giữ point có `status === 0` (hợp lệ).
6. Với file sonar: dùng lại `parseSonarMeta`/`recordedAtFromFilename` từ module Sonar, upload buffer lên S3, lưu metadata (frameCount, durationMs) vào `SonarFile`.
7. Với file `trip.json` (manifest — xem TASK 9 trong CLAUDE.md, nơi gọi tên file là `trip_master.json` nhưng **code thực tế check tên `trip.json`** — xem mục "Điểm đáng chú ý" bên dưới): parse JSON, trích xuất danh sách "video suggestions" (tên file video/ảnh + thời điểm ghi hình suy ra từ `session_id` + `start_ms`) để trả về cho frontend gợi ý nhập `recordedAt` khi upload media riêng — **không lưu media thật**, chỉ trả gợi ý.
8. Với file video/ảnh: **không xử lý** — chỉ ghi nhận vào `results.video`/`results.image` kèm ghi chú "Use media upload for video/image files" (vì upload media đi qua luồng presigned-URL S3 riêng của module `media`, không qua batch này).
9. File không nhận diện được → đưa vào `results.unknown`.
10. Trả về JSON tổng hợp `results` cho tất cả loại file đã xử lý, kèm số lượng, warning (overlap, lỗi parse...), lỗi riêng từng file (không để 1 file lỗi làm hỏng toàn bộ batch — mỗi file có try/catch riêng).

### Điểm mấu chốt kỹ thuật đáng chú ý

- **Không dùng multipart streaming ra disk** — toàn bộ xử lý bằng buffer trong RAM (`multer.memoryStorage()`, giới hạn 500MB/file trong `trip.routes.js`). Phù hợp cho đồ án (không cần scale lớn) nhưng cần lưu ý nếu ZIP quá lớn có thể tốn RAM server.
- **Xử lý tuần tự (sequential `for...of` với `await`)**, không dùng `Promise.all` — comment trong code giải thích rõ: *"Process each file sequentially so append/overlap logic is race-condition-free"*. Vì logic overlap-trim của sensor phụ thuộc vào truy vấn `max(timestamp)` hiện có trong DB, nếu chạy song song 2 file cùng lúc có thể đọc sai giá trị max cũ → dữ liệu sai.
- **Multi-file support (TASK 6d)**: sensor/DVL/sonar đều có field `sourceFile` lưu tên file gốc, cho phép nhiều file cùng loại tồn tại song song trong 1 Trip (khác với thiết kế cũ vốn overwrite toàn bộ theo `deleteMany({trip})`).

---

## Chi tiết từng file

---

### `backend/src/modules/rovs/rov.model.js`

- **Chức năng chính:** Định nghĩa Mongoose schema cho thiết bị ROV (thiết bị lặn vật lý) — đây là entity gốc của toàn hệ thống.
- **Các trường:**
  - `name` (String, required) — tên gọi ROV.
  - `model` (String, required) — model/dòng thiết bị.
  - `serialNumber` (String, required, **unique**) — số serial, dùng để tránh trùng thiết bị.
  - `status` (enum: `active` / `maintenance` / `retired`, default `active`) — trạng thái vận hành.
  - `specs` (Mixed, default `{}`) — thông số kỹ thuật tự do (không ràng buộc schema cứng, linh hoạt cho nhiều loại ROV khác nhau).
  - `notes` (String) — ghi chú tự do.
  - `timestamps: true` → tự động có `createdAt`, `updatedAt`.
- **Luồng dữ liệu:** Được `rov.service.js` import và thao tác CRUD; được `project.model.js` tham chiếu qua field `rov` (mỗi Project bắt buộc gắn với 1 ROV).
- **Điểm đáng chú ý:** `serialNumber: unique: true` → MongoDB tự tạo unique index, nghĩa là insert trùng serial sẽ ném lỗi duplicate key (E11000) — lỗi này không được bắt riêng trong `rov.service.create`, sẽ rơi xuống middleware lỗi chung (`error.middleware.js`) xử lý generic.

---

### `backend/src/modules/rovs/rov.routes.js`

- **Chức năng chính:** Khai báo REST route cho tài nguyên ROV, gắn middleware xác thực và phân quyền.
- **Route:**
  - `router.use(authenticate)` — mọi route dưới đây yêu cầu đăng nhập (JWT hợp lệ).
  - `GET /` → `getAll` — không giới hạn role (mọi role đã login đều xem được danh sách).
  - `GET /:id` → `getOne` — tương tự, không giới hạn role.
  - `POST /` → `create`, giới hạn `authorize('admin', 'operator')`.
  - `PATCH /:id` → `update`, giới hạn `authorize('admin', 'operator')`.
  - `DELETE /:id` → `remove`, giới hạn **chỉ `admin`**.
- **Luồng dữ liệu:** Được mount trong `app.js` (không đọc trực tiếp trong task này nhưng có thể suy ra từ cấu trúc module chuẩn) dưới path `/api/v1/rovs`.
- **Điểm đáng chú ý:** Khớp đúng với bảng phân quyền trong CLAUDE.md — `viewer` chỉ đọc, `operator` được tạo/sửa nhưng không được xóa, `admin` toàn quyền.

---

### `backend/src/modules/rovs/rov.controller.js`

- **Chức năng chính:** Tầng controller — nhận request HTTP, gọi service, trả response chuẩn (`success`/`error`), ghi audit log.
- **Các hàm:**
  - `getAll(req, res, next)`: gọi `rovService.getAll(req.query)` → trả `success(res, result)`. `result` có cấu trúc phân trang `{ data, total, page, totalPages }`.
  - `getOne`: gọi `rovService.getById(req.params.id)`; nếu không tìm thấy → `error(res, 'ROV not found', 404)`.
  - `create`: gọi `rovService.create(req.body)`; sau khi tạo thành công gọi `audit.log(req.user._id, 'create', 'ROV', rov._id, { name: rov.name })` để ghi log kiểm toán (TASK 4 — Audit Log); trả status 201.
  - `update`: tương tự, có kiểm tra tồn tại trước khi audit log.
  - `remove`: gọi `rovService.remove(req.params.id)` (có thể throw lỗi nếu ROV đang được dùng — xem service); audit log hành động `delete`.
- **Luồng dữ liệu:** Được `rov.routes.js` gọi trực tiếp. Phụ thuộc `rov.service.js` cho business logic và `audit.service.js` (module `audit`, không thuộc phạm vi tài liệu này) để ghi log.
- **Điểm đáng chú ý:** Controller **không chứa business logic** — đúng theo quy ước ghi trong CLAUDE.md ("Controller không chứa business logic — chuyển hết sang service"). Không có validate ObjectId thủ công ở tầng controller — dựa vào Mongoose tự ném lỗi CastError khi `id` không hợp lệ, lỗi này được `next(err)` đẩy xuống `error.middleware.js` xử lý.

---

### `backend/src/modules/rovs/rov.service.js`

- **Chức năng chính:** Business logic CRUD cho ROV, bao gồm ràng buộc nghiệp vụ quan trọng: không cho xóa ROV đang được Project sử dụng.
- **Các hàm:**
  - `getAll({ page, limit, search, status })`: xây `query` MongoDB động —
    - `search` → `$or` regex case-insensitive (`new RegExp(search, 'i')`) trên 3 trường `name`, `model`, `serialNumber`.
    - `status` → lọc chính xác theo enum.
    - Phân trang: `skip = (page-1)*limit`, dùng `Promise.all` chạy song song `ROV.find(...)` và `ROV.countDocuments(...)`, sort theo `createdAt: -1` (mới nhất trước).
    - Trả về đúng format chuẩn dự án: `{ data, total, page, totalPages }`.
  - `getById(id)`: `ROV.findById(id)` — không populate gì thêm (ROV không có ref ra ngoài).
  - `create(data)`: `ROV.create(data)` — validate qua Mongoose schema (required fields, unique serialNumber).
  - `update(id, data)`: `findByIdAndUpdate` với `{ new: true, runValidators: true }` — đảm bảo validate lại khi update (ví dụ không cho set `status` ngoài enum).
  - `remove(id)`:
    1. Tìm ROV, nếu không có → `throw { statusCode: 404, message: 'ROV not found' }`.
    2. **Kiểm tra ràng buộc nghiệp vụ**: `Project.countDocuments({ rov: id })` — nếu > 0, throw lỗi 400 với message rõ ràng, gợi ý chuyển status sang `maintenance`/`retired` thay vì xóa.
    3. Chỉ xóa thật (`findByIdAndDelete`) nếu không có Project nào tham chiếu.
- **Luồng dữ liệu:** Import `Project` model để đếm ràng buộc — đây là điểm kết nối duy nhất giữa module `rovs` và module `projects` ở tầng service.
- **Điểm đáng chú ý:**
  - Đây là dạng "soft guard" khác với cascade delete — ROV **không bao giờ cascade xóa Project** liên quan, ngược lại **chặn xóa** nếu còn tham chiếu. Thiết kế hợp lý vì ROV là tài sản vật lý, không nên mất dữ liệu lịch sử sử dụng khi xóa.
  - Không có transaction (MongoDB session) bọc quanh check-rồi-xóa — về lý thuyết có race condition nhỏ (giữa lúc đếm và lúc xóa, có thể có Project mới được tạo dùng ROV này), nhưng với quy mô đồ án, rủi ro này chấp nhận được.

---

### `backend/src/modules/projects/project.model.js`

- **Chức năng chính:** Schema Mongoose cho Project — "chuyến khảo sát lớn", chứa metadata tổng quan và kết quả AI Summary.
- **Các trường:**
  - `name` (String, required), `description` (String).
  - `rov` (ObjectId, ref `ROV`, **required**) — quan hệ N-1 tới ROV.
  - `location` (String) — tên địa điểm dạng text tự do (có thể là chuỗi tọa độ nhập tay, sẽ được service tự động geocode — xem `project.service.js`).
  - `startTime`, `endTime` (Date, default null).
  - `status` (enum: `planned` / `ongoing` / `completed` / `cancelled`, default `planned`).
  - `createdBy` (ObjectId, ref `User`, required) — người tạo, dùng để notify khi status đổi.
  - `aiSummary`: object con gồm `vi` (tóm tắt tiếng Việt), `en` (tiếng Anh), `generatedAt` (Date), `status` (enum `idle`/`pending`/`done`/`failed`) — hỗ trợ TASK 3 (AI Project Summary qua Gemini + Bull Queue).
  - `gpsLocation: { lat, lng }` — tọa độ số, được điền tự động khi `location` là chuỗi tọa độ.
  - `locationName` (String) — tên địa danh đọc được từ reverse geocoding (Nominatim).
- **Index:** `{ status: 1, createdAt: -1 }`, `{ rov: 1 }`, `{ createdBy: 1 }` — tối ưu cho các query lọc phổ biến (theo status, theo ROV, theo người tạo).
- **Luồng dữ liệu:** Được `project.service.js` thao tác; `Trip.project` tham chiếu ngược lại Project này; `trip.controller.js` populate `project` khi trả Trip.
- **Điểm đáng chú ý:** `aiSummary` có 2 ngôn ngữ (`vi`/`en`) — khác với mô tả đơn giản trong CLAUDE.md phần TASK 3 (`content: String`) — cho thấy code đã được nâng cấp so với kế hoạch ban đầu để hỗ trợ song ngữ.

---

### `backend/src/modules/projects/project.routes.js`

- **Chức năng chính:** Khai báo route cho Project, và **mount route lồng nhau (nested)** cho Trip.
- **Route:**
  - `router.use(authenticate)`.
  - `GET /` → `getAll` (mọi role).
  - `GET /:id` → `getOne`.
  - `POST /` → `create`, `authorize('admin', 'operator')`.
  - `PATCH /:id` → `update`, `authorize('admin', 'operator')`.
  - `DELETE /:id` → `remove`, **chỉ `admin`**.
  - `POST /:id/ai-summary` → `generateAISummary`, `authorize('admin', 'operator')` — endpoint enqueue Bull job sinh tóm tắt AI.
  - `router.use('/:projectId/trips', tripRoutes)` — **đây là điểm nối quan trọng**: mọi route trong `trip.routes.js` sẽ được prefix bằng `/api/v1/projects/:projectId/trips/...`, và nhờ `mergeParams: true` trong `trip.routes.js`, `req.params.projectId` được truyền xuyên suốt.
- **Luồng dữ liệu:** File này là điểm giao giữa 2 module `projects` và `trips` ở tầng routing — thể hiện đúng quan hệ phân cấp Project (cha) chứa Trip (con).
- **Điểm đáng chú ý:** Thứ tự route quan trọng — route cụ thể (`/:id/ai-summary`) đặt trước phần `router.use('/:projectId/trips', ...)` không gây xung đột vì Express match theo path pattern đầy đủ, nhưng cần chú ý route catch-all `/:id` không được đặt sau nested router kẻo "nuốt" nhầm path `/xyz/trips`.

---

### `backend/src/modules/projects/project.controller.js`

- **Chức năng chính:** Xử lý HTTP request cho Project CRUD, tích hợp thông báo (notification) khi Project chuyển sang `completed`, và kích hoạt sinh AI Summary bất đồng bộ qua Bull Queue.
- **Các hàm:**
  - `getAll`, `getOne`: tương tự pattern chuẩn, gọi `projectService`.
  - `create(req, res, next)`: gọi `projectService.create({ ...req.body, createdBy: req.user._id })` — tự động gán người tạo từ token đăng nhập (không tin tưởng client gửi `createdBy`). Audit log hành động `create`.
  - `update(req, res, next)`:
    1. Lấy `prev = await projectService.getById(req.params.id)` **trước khi update** — để so sánh status cũ/mới.
    2. Gọi `projectService.update(...)`.
    3. Nếu `req.body.status === 'completed'` và `prev.status !== 'completed'` (tức là **vừa mới chuyển** sang completed, tránh gửi lại thông báo nếu update field khác mà status vẫn completed) → gọi `notifService.create(...)` gửi thông báo in-app (SSE + lưu DB) tới người tạo Project (`project.createdBy`), kèm link điều hướng `/projects/:id`. Lỗi gửi thông báo được `.catch(() => {})` nuốt để không làm fail toàn bộ request update.
    4. Audit log hành động `update` kèm `status` mới.
  - `remove`: gọi `projectService.remove(id)` (cascade — xem phần service), audit log `delete`.
  - `generateAISummary(req, res, next)`:
    1. Lấy Project, kiểm tra tồn tại.
    2. **Validate nghiệp vụ quan trọng**: chỉ cho generate khi `project.status === 'completed'` — nếu không, trả lỗi 400 "Project must be completed to generate summary".
    3. Set `aiSummary.status = 'pending'` ngay lập tức (để frontend biết poll).
    4. `aiSummaryQueue.add({ projectId, userId })` — đẩy job vào Bull Queue (Redis-backed), xử lý bất đồng bộ ở worker riêng (không thuộc phạm vi các file đọc trong task này).
    5. Audit log hành động `generate_summary`.
    6. Trả **HTTP 202 Accepted** (không phải 200) — đúng convention REST cho tác vụ async chưa hoàn tất ngay.
- **Luồng dữ liệu:** Phụ thuộc `project.service.js`, `Project` model (import trực tiếp để update `aiSummary.status`), `notification.service.js` (module `notifications`, không thuộc phạm vi tài liệu này), `config/queue.js` (Bull), `audit.service.js`.
- **Điểm đáng chú ý:**
  - Dòng `return res.status(202).json({ success: true, message: '...' })` **không dùng `success()` util** như quy ước dự án ("LUÔN dùng `return success(res, data)`") — đây là **sai lệch nhỏ so với convention**, có thể là điểm đáng lưu ý khi hội đồng hỏi về tính nhất quán code, dù không phải lỗi chức năng (response vẫn đúng format JSON tương tự).
  - Không có `data` field trong response 202 — nếu frontend expect `result.data` sẽ nhận `undefined`, cần kiểm tra frontend có xử lý đúng case này không (nằm ngoài phạm vi file backend đang xét).

---

### `backend/src/modules/projects/project.service.js`

- **Chức năng chính:** Business logic Project CRUD, tự động geocode khi `location` là chuỗi tọa độ, và cascade delete toàn bộ Trip + dữ liệu con khi xóa Project.
- **Các hàm:**
  - `enrichLocation(data)` (hàm nội bộ, không export):
    1. Nếu không có `data.location` → trả nguyên `data`.
    2. Gọi `parseCoordString(data.location)` (từ `utils/geocode.util.js`, không thuộc phạm vi tài liệu) — thử parse chuỗi dạng "lat, lng".
    3. Nếu không phải định dạng tọa độ (plain text) → giữ nguyên, không đổi.
    4. Nếu là tọa độ → gọi `reverseGeocode(lat, lng)` (gọi API Nominatim OpenStreetMap) lấy tên địa danh, rồi **ghi đè `location`** bằng tên địa danh đọc được (hoặc giữ chuỗi gốc nếu geocode thất bại), đồng thời lưu `gpsLocation` và `locationName`.
  - `getAll(params)`:
    - Nhận `{ page, limit, search, status, rovId, fromDate, toDate }`.
    - Filter nâng cao:
      - `search` → `$or` regex trên `name` và `location`.
      - `status` → lọc chính xác.
      - `rovId` → lọc theo `query.rov = rovId`.
      - `fromDate`/`toDate` → khoảng `startTime`: `$gte fromDate`, `$lte toDate + 'T23:59:59'` (cộng thêm giờ cuối ngày để bao trọn ngày `toDate`, tránh bug thiếu record đúng ngày cuối).
    - Query kèm `.populate('rov', 'name model status')` và `.populate('createdBy', 'fullName email')` — chỉ lấy field cần thiết (projection), tránh over-fetching.
    - Phân trang chuẩn, `Promise.all` song song `find` + `countDocuments`.
  - `getById(id)`: populate đầy đủ hơn (`rov` thêm `serialNumber`).
  - `create(data)`: `Project.create(await enrichLocation(data))` — luôn qua bước enrich trước khi lưu.
  - `update(id, data)`: tương tự, enrich rồi `findByIdAndUpdate` với `runValidators: true`, populate lại kết quả trả về.
  - `remove(id)`:
    1. Tìm Project, throw 404 nếu không có.
    2. Lấy tất cả `Trip.find({ project: id })` (chỉ lấy `_id`, dùng `.lean()` để tối ưu — không cần Mongoose document đầy đủ).
    3. **Cascade**: gọi `tripService.remove(d._id)` cho **từng Trip** qua `Promise.all` — tái sử dụng logic cascade delete đã viết sẵn trong `trip.service.js` (bao gồm xóa SensorData/DVL/Sonar/Media/Snapshot + file S3 liên quan của từng Trip) thay vì viết lại logic riêng.
    4. Xóa Project doc.
    5. Trả về `{ projectDeleted: true, tripsDeleted: trips.length }` — thông tin hữu ích để hiển thị kết quả xóa hàng loạt.
- **Luồng dữ liệu:** Import `Trip` model trực tiếp (để tìm danh sách Trip con), và `require('../trips/trip.service')` **bên trong hàm `remove`** (lazy require, tránh circular dependency vì `trip.service.js` không import ngược lại `project.service.js`). Đây là điểm cascade delete cấp Project → Trip → (Sensor/DVL/Sonar/Media/Snapshot).
- **Điểm đáng chú ý — ĐÃ CASCADE ĐẦY ĐỦ:**
  - Đúng như checklist "Phần 6d-0" trong CLAUDE.md yêu cầu, `project.service.js` **hàm `remove` đã được fix cascade đúng** — không còn dùng `Trip.deleteMany({project:id})` trực tiếp (cách cũ, không cascade), mà loop gọi `tripService.remove()` từng Trip để tận dụng cascade sâu hơn. Đây là điểm cộng quan trọng, khác với mô tả "BUG LỚN" nêu trong CLAUDE.md — **bug này đã được fix trong code hiện tại**.
  - Không dùng MongoDB transaction — nếu 1 trong các `tripService.remove()` fail giữa chừng (ví dụ lỗi S3), `Promise.all` sẽ reject toàn bộ và Project **không bị xóa** (vì `Project.findByIdAndDelete(id)` nằm sau `await Promise.all`) — an toàn ở mức chấp nhận được cho quy mô đồ án, nhưng có thể để lại một số Trip đã xóa dở dang (partial cascade) nếu 1 trip lỗi còn các trip khác đã xóa xong trước đó trong cùng `Promise.all` (vì `Promise.all` không rollback các promise đã resolve).

---

### `backend/src/modules/trips/trip.model.js`

- **Chức năng chính:** Schema Mongoose cho Trip — "1 lần lặn cụ thể", chứa các bộ đếm nhanh (`sensorCount`, `dvlCount`, `sonarCount`) và GPS riêng của lần lặn đó.
- **Các trường:**
  - `title` (String, required), `description` (String).
  - `project` (ObjectId, ref `Project`, **required**) — quan hệ N-1 tới Project.
  - `status` (enum: `pending` / `running` / `done` / `failed`, default `pending`).
  - `sensorCount`, `dvlCount`, `sonarCount` (Number, default 0) — cache số lượng bản ghi/file, cập nhật mỗi lần upload thành công (xem `batch.controller.js` / `sensor.controller.js`), tránh phải `countDocuments` mỗi lần hiển thị badge trên UI.
  - `gpsLocation: { lat, lng }` — tọa độ của **lần lặn cụ thể này** (khác Project — vì các Trip trong cùng Project có thể lặn ở vị trí khác nhau).
  - `locationName` (String) — tên địa danh (Nominatim reverse geocode).
  - `gcsData.raw` (Mixed, default null) — trường dữ liệu thô dự phòng (tên gợi ý liên quan tới "GCS" — Ground Control Station — nhưng CLAUDE.md khẳng định "Không có GCS tự động", nên trường này có thể là legacy/dự phòng cho tương lai, không thấy hàm nào trong các file đã đọc ghi vào field này).
  - `createdBy` (ObjectId, ref `User`, required).
- **Index:** `{ project: 1, createdAt: -1 }`, `{ status: 1 }`, `{ createdAt: -1 }`.
- **Luồng dữ liệu:** Tham chiếu tới bởi `SensorData.trip`, `DVLData.trip`, `SonarFile.trip`, `Media.trip`, `Snapshot.trip` (foreign key ngược — các module đó có field `trip` trỏ về đây, nhưng bản thân `trip.model.js` không có mảng ref thuận tới chúng — quan hệ 1-N thuần theo kiểu "con giữ khóa ngoại", không dùng populate ngược tự động).
- **Điểm đáng chú ý:** Không có trường `sourceFile`-level tracking ở Trip; việc quản lý multi-file (nhiều file CSV/DVL/sonar cho 1 Trip — TASK 6d) nằm ở tầng document con (`SensorData.sourceFile`, `DVLData.sourceFile`, `SonarFile.filename`), Trip chỉ giữ số đếm tổng.

---

### `backend/src/modules/trips/trip.routes.js`

- **Chức năng chính:** Khai báo toàn bộ route liên quan đến Trip **và** các loại dữ liệu con gắn trực tiếp vào Trip (sensor, DVL, sonar, batch upload) — file này là "cửa ngõ" API cho tất cả dữ liệu ROV.
- **Cấu trúc route:**
  - `express.Router({ mergeParams: true })` — bắt buộc để nhận `req.params.projectId` khi được mount lồng trong `project.routes.js`.
  - `multer({ storage: memoryStorage(), limits: { fileSize: 500MB } })` (`memUpload`) — dùng cho upload file DVL, sonar, batch (giữ buffer trong RAM, không ghi disk).
  - `router.use(authenticate)`.
  - **Trip CRUD:**
    - `GET /` (thực chất path đầy đủ `/api/v1/projects/:projectId/trips`) → `ctrl.getAllByProject`.
    - `POST /` → `ctrl.create`, `authorize('admin','operator')`.
    - `GET /:id` (path đầy đủ `/api/v1/trips/:id` — vì trip.routes.js **cũng được mount trực tiếp** ở path gốc `/api/v1/trips` ngoài việc mount lồng — suy luận từ cách `getOne`, `update`, `remove` dùng path tuyệt đối `/api/v1/trips/:id` không có projectId) → `ctrl.getOne`.
    - `PATCH /:id`, `DELETE /:id` — update/remove, phân quyền tương ứng.
  - **Sensor data:** `GET /:id/sensor-data` (không giới hạn role — mọi người xem được), `POST /:id/sensor-data/upload` (operator/admin), `DELETE /:id/sensor-data` (operator/admin) — xử lý bởi `sensorCtrl` (module `sensor`, ngoài phạm vi giải thích sâu).
  - **Data-files tổng hợp:** `GET /:id/data-files` → `sensorCtrl.getDataFiles` — API tổng hợp trả danh sách file sensor/DVL/sonar (TASK 6d).
  - **DVL:** `GET /:id/dvl` (getPath), `POST /:id/dvl/upload` (memUpload single file), `DELETE /:id/dvl`.
  - **Sonar:** `GET /:id/sonar` (list), `POST /:id/sonar/upload`, `GET /:id/sonar/:sonarId/url` (lấy presigned URL để phát/tải), `DELETE /:id/sonar/:sonarId`.
  - **Batch upload:** `POST /:id/data/upload-batch` → `batchCtrl.uploadBatch`, dùng `memUpload.any()` (chấp nhận nhiều field file bất kỳ tên) — endpoint chính cho ZIP folder từ ROV.
- **Luồng dữ liệu:** File này là điểm hội tụ giữa module `trips` và các module con `sensor`, `dvl`, `sonar` — import trực tiếp controller của các module đó (`sensorCtrl`, `dvlCtrl`, `sonarCtrl`) thay vì qua service layer, vì đây là routing, không phải business logic.
- **Điểm đáng chú ý:**
  - `GET /:id/sensor-data`, `GET /:id/dvl`, `GET /:id/sonar`, `GET /:id/data-files` **không có `authorize()`** — đúng với RBAC "mọi role xem được dữ liệu", chỉ upload/xóa mới giới hạn `operator`/`admin`.
  - `router.delete('/:id', authorize('admin'), ctrl.remove)` — xóa Trip chỉ dành cho `admin`, **chặt hơn** xóa sensor-data/dvl/sonar riêng lẻ (chỉ cần `operator`) — hợp lý vì xóa cả Trip là hành động phá hủy lớn hơn (cascade toàn bộ).

---

### `backend/src/modules/trips/trip.controller.js`

- **Chức năng chính:** Xử lý HTTP request Trip CRUD, gửi thông báo khi Trip chuyển trạng thái `done`/`failed`.
- **Các hàm:**
  - `getAll(req, res, next)`: gọi `tripService.getAll(req.query)` — dùng cho trang danh sách Trip toàn cục (không lồng theo Project), có phân trang.
  - `getAllByProject(req, res, next)`: **hàm "lai" (dual-purpose)** —
    - Nếu có `req.params.projectId` (tức route được gọi qua nested `/projects/:projectId/trips`) → gọi `tripService.getAllByProject(projectId)` (không phân trang — trả toàn bộ Trip của Project đó, dùng cho `ProjectDetailPage`).
    - Nếu không có `projectId` (gọi trực tiếp `/api/v1/trips` — theo route standalone) → fallback gọi `tripService.getAll(req.query)` (có phân trang, dùng cho `TripsPage` độc lập).
  - `getOne`: lấy Trip theo id, 404 nếu không có.
  - `create(req, res, next)`:
    1. **Validate Project tồn tại trước khi tạo Trip** — `const project = await Project.findById(req.params.projectId).lean(); if (!project) return error(res, 'Project not found', 404);`. Đây chính là fix bug được ghi trong CLAUDE.md phần Testing Plan: *"POST /projects/:id/trips với projectId không tồn tại trả 201 thay vì 404 — đã fix bằng cách thêm kiểm tra project tồn tại"*.
    2. Gọi `tripService.create({ ...req.body, project: projectId, createdBy: req.user._id })`.
    3. Audit log `create`.
  - `update(req, res, next)`:
    1. Lấy `prev` trước khi update (so sánh status).
    2. Gọi `tripService.update`.
    3. Nếu `req.body.status` thay đổi và giá trị mới là `done` hoặc `failed` → gửi notification tới `trip.createdBy`, tiêu đề dạng `Trip "..." completed/failed`, link tới `/projects/:project` (điều hướng về Project cha, không phải trang Trip riêng).
    4. Audit log `update` kèm status mới.
  - `remove`: gọi `tripService.remove` (cascade), audit log `delete`.
- **Luồng dữ liệu:** Import `Project` model **cục bộ trong hàm `create`** (`const Project = require('../projects/project.model')` — đặt bên trong hàm, không import đầu file) — cách làm này tránh phụ thuộc vòng (circular require) ở cấp module-load-time giữa `trips` và `projects` (2 module tham chiếu lẫn nhau: `project.service.remove` gọi `trip.service`, còn `trip.controller.create` gọi `project.model`).
- **Điểm đáng chú ý:**
  - Label thông báo dùng biến `label = status === 'done' ? 'completed' : 'failed'` nhưng title vẫn dùng `req.body.status` (giá trị enum thô `done`/`failed`) cho `type` field của notification (`trip_${req.body.status}`) — nhất quán để frontend phân loại icon.
  - Không kiểm tra `req.user` có quyền sở hữu Trip trước khi update/xóa (dựa hoàn toàn vào RBAC role-based ở route, không có ownership-based check) — nghĩa là bất kỳ `operator` nào cũng sửa được Trip do `operator` khác tạo, đúng với mô hình RBAC đơn giản của dự án (không có concept "chỉ sửa được của mình").

---

### `backend/src/modules/trips/trip.service.js`

- **Chức năng chính:** Business logic Trip CRUD, và đặc biệt là **cascade delete đầy đủ** khi xóa 1 Trip — xóa toàn bộ dữ liệu con liên quan (SensorData, DVLData, SonarFile, Media, Snapshot) cả trên MongoDB lẫn S3.
- **Các hàm:**
  - `getAll({ page, limit, search, status, projectId, fromDate, toDate })`:
    - `search` → regex trên `title`.
    - `status`, `projectId` → lọc chính xác.
    - `fromDate`/`toDate` → khoảng theo `createdAt` (khác Project dùng `startTime` — vì Trip không có trường `startTime` riêng, dùng luôn thời điểm tạo record).
    - Populate `project` (chỉ `name status`) và `createdBy` (`fullName email`).
    - Phân trang chuẩn.
  - `getAllByProject(projectId)`: không phân trang, trả toàn bộ Trip thuộc 1 Project, sort `createdAt: -1`, chỉ populate `createdBy` (không cần populate lại `project` vì đã biết là project nào).
  - `getById(id)`: populate cả `project` và `createdBy`.
  - `create(data)`: `Trip.create(data)` — không enrich gì thêm (khác Project không cần geocode ở bước tạo vì GPS Trip được set qua upload sensor, không nhập tay location string).
  - `update(id, data)`: `findByIdAndUpdate` + `runValidators`, populate `createdBy`.
  - `remove(id)` — **hàm cascade delete quan trọng nhất module**:
    1. `Promise.all` lấy song song 3 collection liên quan tới `s3Key`:
       - `SonarFile.find({trip:id}).select('s3Key').lean()`.
       - `Media.find({trip:id}).select('s3Key meta').lean()`.
       - `Snapshot.find({trip:id}).select('imageS3Key thumbnailS3Key').lean()`.
    2. Gộp toàn bộ key S3 cần xóa vào mảng `s3Keys` — bao gồm cả `m.meta?.thumbnailKey` (thumbnail phụ của Media, nếu có) và cả `imageS3Key`/`thumbnailS3Key` của Snapshot — dùng `.filter(Boolean)` loại bỏ giá trị null/undefined.
    3. Nếu có key → `Promise.allSettled` xóa từng object trên S3 qua `DeleteObjectCommand` — dùng `allSettled` (không phải `all`) để **1 lần xóa S3 lỗi không làm hỏng toàn bộ quá trình xóa DB** (best-effort cleanup).
    4. `Promise.all` xóa đồng thời toàn bộ document liên quan trong MongoDB: `SensorData.deleteMany`, `DVLData.deleteMany`, `SonarFile.deleteMany`, `Media.deleteMany`, `Snapshot.deleteMany` — tất cả filter theo `{trip: id}`.
    5. Cuối cùng `Trip.findByIdAndDelete(id)`.
- **Luồng dữ liệu:** Đây là điểm kết nối trực tiếp và sâu nhất với 4 module dữ liệu con: `sensor` (`SensorData`), `dvl` (`DVLData`), `sonar` (`SonarFile`), `media` (`Media`), và `snapshots` (`Snapshot`) — mỗi module này có model/controller/service riêng (không thuộc phạm vi giải thích sâu ở đây), nhưng `trip.service.js` là nơi orchestrate việc dọn dẹp toàn bộ khi Trip bị xóa. Được `project.service.js` gọi lại (`tripService.remove`) để cascade cấp cao hơn khi xóa Project.
- **Điểm đáng chú ý — ĐÃ CASCADE ĐẦY ĐỦ (khác với cảnh báo "CHƯA cascade" nêu trong CLAUDE.md phần kế hoạch cũ):**
  - Đối chiếu với mục "B. Cascade delete THIẾU — BUG LỚN" trong CLAUDE.md (mô tả code cũ chỉ `Trip.findByIdAndDelete(id)` mà không xóa gì khác) — **code hiện tại đã fix đầy đủ đúng theo spec đề xuất trong CLAUDE.md**, bao gồm cả xóa S3 lẫn xóa 5 collection con. Đây không còn là bug trong codebase hiện tại.
  - Thứ tự thao tác đúng: **lấy danh sách S3 key TRƯỚC khi xóa DB** — nếu làm ngược lại (xóa DB trước) sẽ mất thông tin `s3Key` cần thiết để dọn S3, gây ra rác vĩnh viễn trên S3 (orphaned files tốn phí lưu trữ). Code đã tránh đúng lỗi này.
  - Không xóa Notification liên quan tới Trip (ví dụ thông báo "Trip completed" đã tạo trước đó) — nhưng đây là thiết kế hợp lý vì Notification là lịch sử hoạt động của User, không nhất thiết phải mất khi Trip bị xóa.
  - Không dùng MongoDB transaction (session) — nếu server crash giữa bước xóa S3 và xóa DB, có thể để lại state không nhất quán (ví dụ DB đã xóa nhưng S3 chưa, hoặc ngược lại), nhưng với `allSettled` cho S3, khả năng cao nhất là "S3 xóa thiếu, DB xóa đủ" (rác S3 không được dọn hết) — chấp nhận được cho đồ án, không phải lỗi nghiêm trọng.

---

### `backend/src/modules/trips/batch.controller.js`

- **Chức năng chính:** Xử lý upload hàng loạt (ZIP hoặc nhiều file rời) từ thư mục ROV — tự động phân loại, parse, và lưu vào đúng collection tương ứng (SensorData, DVLData, SonarFile), đồng thời parse file manifest `trip.json` để gợi ý thời điểm quay video. Đây là file phức tạp nhất trong 3 module được giao.

#### A. Nhóm hàm CSV Parser linh hoạt (flexible, chịu được nhiều định dạng khác nhau từ các đời firmware ROV khác nhau)

**`COLUMN_MAP`** (object hằng số): bảng ánh xạ tên cột CSV (chữ thường, đã bỏ ký tự không phải chữ cái) sang tên field chuẩn hóa nội bộ. Ví dụ:
- `time`/`timestamp`/`datetime` → `timestamp`.
- `depth`/`depth_m`/`profondeur` (tiếng Pháp!) → `depth`.
- `watertemperature`/`water_temp` → `temp` (nhiệt độ **nước**) — ưu tiên hơn `temperature`/`temp` (nhiệt độ **board/ambient**) → field `temperature` khác.
- `tempambient`/`ambient_temp` → `temperature` (nhiệt độ linh kiện, khác nước).
- `pressure`/`pression` → `pressure`.
- `roll`/`pitch`/`yaw`/`heading` → tương ứng field góc.
- `voltage`, `battery_percent`/`battery`/`batt`, `humidity`/`hum` → các field hệ thống.
- `lat`/`latitude`, `lng`/`lon`/`longitude` → GPS.
- `holddepth`, `holdheading`, `manual`, `cameratilt`, `lightlevel`, `powerlevel` → các field điều khiển rời rạc từ GCS console (dùng cho tab "System"/"Navigation" trên frontend).

**`detectDelimiter(header)`**: thử 3 ứng viên `;`, `,`, `\t`; đếm số lần xuất hiện mỗi ký tự trong dòng header; chọn ký tự xuất hiện **nhiều nhất** làm delimiter. Xử lý được cả file dấu phẩy kiểu Mỹ lẫn dấu chấm phẩy kiểu châu Âu (dữ liệu mẫu thực tế trong CLAUDE.md dùng `;`).

**`detectDecimalSep(rows, colCount)`**: lấy mẫu 5 dòng dữ liệu đầu, kiểm tra từng ô có khớp regex `^-?\d+,\d+$` (số dạng "12,34") hay không — nếu có → decimal separator là dấu phẩy (kiểu châu Âu); mặc định trả `.`.

**`mapHeaders(headers, delimiter)`**:
1. Sắp xếp lại mảng header sao cho cột `WaterTemperature` luôn được xử lý **trước** cột `Temperature` (dùng hàm so sánh custom, không phải sort alphabet thường) — đảm bảo khi cả 2 cột cùng tồn tại, `WaterTemperature` "thắng" và được map vào field `temp`, còn `Temperature` map vào field `temperature` khác (tránh 2 cột đè lên nhau nếu duyệt theo thứ tự file gốc).
2. Với mỗi header, chuẩn hóa key (lowercase, bỏ ký tự không phải `a-z_`), tra `COLUMN_MAP`; nếu tìm thấy field và **field đó chưa được dùng** (`usedFields` Set, tránh 2 cột khác nhau cùng map vào 1 field) → gán vào `mapping[origIdx] = field`.
3. Trả về object `{ originalColumnIndex: fieldName }`.

**`baseDateFromFilename(filename)`**: regex `(\d{8})_(\d{6})` trích ngày từ tên file kiểu `log_20260604_162515.csv` → trả `"2026-06-04"`. Dùng làm "ngày nền" để ghép với cột `Time` chỉ có giờ:phút:giây (không có ngày) trong file CSV.

**`parseTimeToDate(timeStr, baseDate)`**: ghép `baseDate` + `timeStr` thành chuỗi ISO có suffix `+07:00` (giờ Việt Nam) rồi `new Date(...)` — comment trong code nói rõ: *"Filenames/readings are recorded in UTC+7 (Vietnam local time), not UTC"*. Đây là điểm rất quan trọng: nếu thiếu offset `+07:00`, JS sẽ hiểu nhầm là UTC hoặc local timezone của máy chủ, gây lệch giờ 7 tiếng khi hiển thị trên chart.

**`parseCsvBuffer(buffer, filename)`** — hàm chính, orchestrate toàn bộ pipeline parse 1 file CSV:
1. Decode buffer → UTF-8 text, tách dòng theo `\r?\n`, loại dòng rỗng.
2. Nếu < 2 dòng (không có data) → trả rỗng kèm warning.
3. `detectDelimiter` trên dòng header đầu tiên.
4. Tách header thành mảng, tách các dòng data thành mảng 2 chiều (`dataRows`).
5. `detectDecimalSep` trên mẫu data rows.
6. `mapHeaders` → `colMapping`.
7. `baseDateFromFilename(filename)` lấy ngày nền.
8. Với mỗi dòng dữ liệu:
   - Build object `obj` theo `colMapping`, convert dấu phẩy thập phân → dấu chấm nếu cần (`val.replace(',', '.')`).
   - Build timestamp: nếu `obj.timestamp` khớp `HH:MM:SS` → `parseTimeToDate`; nếu không (đã là ISO datetime đầy đủ) → `new Date(obj.timestamp)` trực tiếp.
   - **Bỏ dòng** (tăng biến đếm `skipped`) nếu timestamp không hợp lệ hoặc thiếu `depth` (2 trường bắt buộc tối thiểu theo spec CSV trong CLAUDE.md).
   - Convert riêng field `manual`: chuỗi `"Manual"` → `1`, `"Auto"`/`"0"` → `0` (chuẩn hóa từ text sang số nhị phân).
   - Build reading object đầy đủ (`optNum` — helper chuyển string → Number hoặc `null` nếu rỗng) gồm: `timestamp, depth, temp, temperature, pressure, yaw, pitch, roll, voltage, battery_percent, humidity, holdDepth, holdHeading, manual, cameraTilt, lightLevel, powerLevel, lat, lng`.
9. Nếu có dòng bị skip → thêm warning số lượng.
10. Build `mappingPreview` (human-readable: `{"WaterTemperature": "temp", ...}`) để hiển thị cho operator xem trước khi confirm (transparency về việc hệ thống hiểu cột nào là gì).
11. Trả `{ readings, columnMapping, warnings }`.

#### B. Hàm phụ trợ manifest

**`parseSessionId(sessionId)`**: regex `session_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})` trích ngày giờ từ `session_id` trong manifest (ví dụ `"session_20260623_112414"`), ghép thành ISO string với suffix `+07:00` → trả `Date` object là thời điểm bắt đầu session theo giờ Việt Nam quy đổi ra UTC.

#### C. `classifyFile(filename)` — bộ phân loại file theo tên

Logic theo thứ tự ưu tiên (if/else if):
1. `base === 'trip.json'` (chuyển tên file về lowercase, strip prefix thư mục bằng `.split('/').pop()`) → `'manifest'`.
2. `base.match(/^dvl_.*\.json$/)` (prefix `dvl_`, đuôi `.json`) → `'dvl'`.
3. `lower.endsWith('.sonar')` → `'sonar'`.
4. `base.match(/^log_.*\.csv$/)` **hoặc bất kỳ file `.csv` nào khác** (`base.match(/^.*\.csv$/)`) → `'sensor'` — nghĩa là **mọi file CSV đều được coi là sensor**, không bắt buộc phải có prefix `log_`.
5. Đuôi video (`mp4/webm/mov/avi/mkv`) → `'video'`.
6. Đuôi ảnh (`jpg/jpeg/png/webp`) → `'image'`.
7. Không khớp gì → `'unknown'`.

#### D. Hàm xử lý theo từng loại (per-type processors)

**`processSensor(tripId, buffer, filename)`**:
1. Gọi `parseCsvBuffer` lấy `readings`.
2. Nếu rỗng → trả lỗi "No valid readings found".
3. Build `docs` — loại bỏ `lat`/`lng` khỏi từng document trước khi lưu vào `SensorData` (vì `lat`/`lng` chỉ dùng để xác định GPS cố định của Trip, không lưu lặp lại trong từng reading — dùng destructuring `({ lat, lng, ...r }) => ({ trip, sourceFile: filename, ...r })`).
4. Song song kiểm tra: `existingCount` = đã có sourceFile này trong DB chưa, và lấy `tripDoc.gpsLocation` hiện tại.
5. **Logic append/overlap (multi-file, TASK 6d):**
   - Nếu `existingCount > 0` (file cùng tên upload lại — re-upload) → **xóa sạch data cũ của đúng file đó** (`deleteMany({trip, sourceFile: filename})`), rồi insert toàn bộ docs mới (không cần trim overlap vì đây coi như thay thế hoàn toàn).
   - Nếu là file mới (chưa từng có) → lấy `maxTs` = timestamp lớn nhất hiện có trong toàn Trip (không phân biệt sourceFile khác) → **trim các dòng có timestamp <= maxTs** (logic "first-in-first-keep": dữ liệu đã có được ưu tiên giữ, file mới chỉ được thêm phần "tương lai" so với dữ liệu cũ) → nếu có dòng bị drop, thêm warning `"${dropped} overlapping rows trimmed"` → nếu **toàn bộ bị trim hết** (file mới hoàn toàn nằm trong quá khứ so với data đã có) → cập nhật lại `sensorCount` rồi trả về sớm với `warning: 'file_skipped'`, không insert gì.
6. `SensorData.insertMany(insertDocs, { ordered: false })` — `ordered: false` cho phép tiếp tục insert các document còn lại ngay cả khi 1 document lỗi (ví dụ validation fail), tăng độ bền của batch insert.
7. Trích `lat`/`lng` từ **dòng đầu tiên** của `readings` gốc (biến `first`) — parse `parseFloat`, kiểm tra hợp lệ bằng `!isNaN`.
8. Cập nhật GPS cho Trip: **chỉ ghi đè `gpsLocation`/`locationName` nếu** (file này đang re-upload/thay thế — `existingCount > 0`) **hoặc** (Trip chưa có `gpsLocation.lat` nào trước đó) — nghĩa là **GPS của lần upload đầu tiên "thắng"** và không bị các file upload sau (file mới, không phải re-upload) ghi đè, trừ khi đang replace đúng file đã set GPS đó. Gọi `reverseGeocode(lat, lng)` (Nominatim OpenStreetMap) lấy `locationName`.
9. Cập nhật `Trip.sensorCount` = tổng số document hiện có (đếm lại bằng `countDocuments`, không cộng dồn thủ công — tránh sai lệch nếu có xóa/thay thế trước đó).
10. Trả `{ ok: true, count, columnMapping, warnings }`.

**`processDvl(tripId, buffer, filename)`**:
1. Gọi `parseDvlBuffer(buffer)` — hàm **import từ `dvl.controller.js`** (module DVL, không viết lại logic parse ở đây — tái sử dụng code).
2. Lọc chỉ giữ point có `status === 0` (DVL convention: 0 = tín hiệu hợp lệ, khác 0 = lost lock/error).
3. Nếu không còn point hợp lệ nào → lỗi.
4. Build docs kèm `sourceFile`.
5. Cùng pattern re-upload: nếu file trùng tên đã tồn tại → xóa data cũ của đúng file đó trước khi insert lại. **Không có logic trim-overlap theo thời gian** như sensor (comment trong code: *"DVL không cần overlap check — GPS track không có khái niệm overwrite theo time"* — vì DVL là trajectory điểm rời rạc, không có khái niệm "ghi đè theo mốc thời gian" như sensor).
6. Insert, đếm lại tổng, cập nhật `Trip.dvlCount`.

**`processSonar(tripId, buffer, filename)`**:
1. `parseSonarMeta(buffer)` (import từ `sonar.controller.js`) — parse metadata file binary sonar (frameCount, durationMs), bọc try/catch riêng vì đây là parse binary dễ lỗi.
2. Kiểm tra file cùng tên đã tồn tại (`SonarFile.findOne({trip, filename})`) → nếu có, **xóa S3 object cũ** (bọc try/catch nuốt lỗi — best effort) và xóa document DB cũ trước khi upload lại (khác sensor/DVL — sonar lưu cả file nhị phân trên S3, không chỉ record DB).
3. Upload buffer lên S3 với key `sonar/{tripId}/{uuid}-{filename}` (namespaced theo Trip, có UUID để tránh trùng key dù trùng tên file).
4. Tạo `SonarFile` document mới: `filename, s3Key, frameCount, durationMs, fileSizeBytes, recordedAt` (recordedAt suy ra từ tên file qua `recordedAtFromFilename`, hàm import từ module sonar).
5. Đếm lại tổng, cập nhật `Trip.sonarCount`.

#### E. `uploadBatch(req, res, next)` — controller chính, orchestrate toàn bộ pipeline

1. Lấy `tripId` từ `req.params.id`, tìm Trip — 404 nếu không có.
2. Kiểm tra `req.files` không rỗng — 400 nếu không có file nào (`multer.any()` đã parse sẵn ở route).
3. **Giải nén / chuẩn hóa danh sách file:**
   - Nếu chỉ có **đúng 1 file** và tên file kết thúc bằng `.zip` (case-insensitive) → dùng `AdmZip` giải nén trong RAM (`new AdmZip(req.files[0].buffer)`), lặp `zip.getEntries()`, bỏ qua entry là thư mục, lấy `entry.entryName.split('/').pop()` (strip toàn bộ path thư mục con, chỉ giữ basename) + `entry.getData()` (buffer nội dung).
   - Ngược lại (nhiều file rời, hoặc 1 file không phải zip) → dùng thẳng `req.files` map sang `{ filename: originalname, buffer }`.
4. Khởi tạo object `results` rỗng theo từng loại: `sensor, dvl, sonar, video: [], image: [], manifest, unknown: [], errors: []`.
5. **Parse manifest riêng trước vòng lặp chính:** tìm file tên đúng `trip.json` trong danh sách `files` đã giải nén → nếu có:
   - `JSON.parse` nội dung buffer.
   - Duyệt `manifest.sessions[]`, với mỗi session tính `sessionStart = parseSessionId(session.session_id)`.
   - Duyệt `session.assets[]`, chỉ lấy asset có `type === 'video'` hoặc `'photo'` **và** `sessionStart` hợp lệ → build `videoSuggestions` gồm `{ filename (basename), recordedAt (ISO string = sessionStart + start_ms), type, status }`.
   - Gán `results.manifest = { detected: true, videoSuggestions }`.
   - Nếu parse lỗi (JSON invalid) → `results.manifest = { detected: false, error: 'Failed to parse trip.json' }` (không throw, không làm hỏng toàn bộ batch).
6. **Vòng lặp xử lý tuần tự từng file** (`for...of`, có `await` bên trong — chạy lần lượt, không song song, lý do đã giải thích ở phần tổng quan: tránh race condition trong logic overlap-trim của sensor):
   - `classifyFile(filename)` xác định loại.
   - `sensor`: gọi `processSensor`, gộp kết quả vào `results.sensor` (khởi tạo `{ ok: true, count: 0, files: [] }` nếu chưa có) — cộng dồn `count`, đẩy chi tiết từng file (kèm `warning` nếu có) vào mảng `files`; nếu file đó lỗi → đánh dấu `results.sensor.ok = false` và ghi lỗi vào `files`.
   - `dvl`: tương tự, gộp vào `results.dvl`.
   - `sonar`: tương tự, gộp vào `results.sonar` — nhưng field lưu là `filename`/`frameCount`/`durationMs` (không có `count` như sensor/dvl vì đơn vị là "file" chứ không phải "số bản ghi").
   - `video`/`image`: chỉ đẩy `{ filename, note: 'Use media upload for video/image files' }` vào `results.video`/`results.image` — **không xử lý gì thêm**, vì luồng video/ảnh thật sự đi qua module `media` (presigned URL S3) riêng biệt, không qua batch này.
   - `manifest`: đã xử lý ở bước 5, bỏ qua (comment "Already parsed above — skip processing").
   - `unknown`: đẩy tên file vào `results.unknown`.
   - Toàn bộ nằm trong `try/catch` riêng cho từng file — nếu 1 file gây lỗi (ví dụ parse CSV throw exception ngoài dự kiến), lỗi được ghi vào `results.errors` kèm tên file, **không làm dừng xử lý các file còn lại** trong batch.
7. `success(res, results, 'Batch upload complete')` — trả kết quả tổng hợp toàn bộ.
- **Luồng dữ liệu:** Import trực tiếp `DVLData`, `SonarFile`, `SensorData` model (viết thẳng, không qua service layer riêng của module đó — batch controller đóng vai trò "service" cho chính nó), và `Trip` model để update counters. Tái sử dụng hàm `parseDvlBuffer` (từ `dvl.controller.js`) và `parseSonarMeta`, `recordedAtFromFilename` (từ `sonar.controller.js`) — tránh duplicate logic parse binary/JSON giữa 2 luồng upload (upload đơn lẻ qua `dvl.routes`/`sonar.routes` vs batch upload).
- **Kết nối với `geocode.util.js`:** dùng `reverseGeocode` (Nominatim OpenStreetMap) để set `locationName` cho Trip khi sensor CSV có cột GPS ở dòng đầu.

#### Điểm đáng chú ý / khác biệt so với mô tả trong CLAUDE.md

1. **Tên file manifest thực tế trong code là `trip.json`, KHÔNG PHẢI `trip_master.json`** như mô tả trong TASK 9 của CLAUDE.md. Cả `classifyFile` (`if (base === 'trip.json') return 'manifest';`) và đoạn tìm manifest trong `uploadBatch` (`files.find(f => f.filename === 'trip.json')`) đều check đúng tên `trip.json`. Đây là **sai lệch giữa tài liệu kế hoạch (CLAUDE.md) và code thực tế** — nếu ROV thực sự xuất file tên `trip_master.json` như spec mô tả, code hiện tại **sẽ không nhận diện được** (rơi vào `results.unknown` thay vì `results.manifest`). Đây là điểm quan trọng cần làm rõ khi bị hội đồng hỏi, hoặc cần fix nếu file thật từ ROV đúng là `trip_master.json`.
2. **`classifyFile` cho DVL dùng regex lowercase `^dvl_.*\.json$`** — khớp với tên file `dvl_xxx.json` (chữ thường), trong khi ví dụ trong CLAUDE.md TASK 9 dùng tên `DVL_20260623_112414.json` (chữ hoa `DVL_`). Vì `base = filename.split('/').pop().toLowerCase()` đã lowercase toàn bộ trước khi test regex, nên **cả 2 case (`DVL_` hoa hoặc `dvl_` thường) đều khớp đúng** — không phải bug, chỉ cần lưu ý rằng biến `base` đã được lowercase trước khi so khớp.
3. **Mọi file `.csv` đều bị coi là `sensor`** (dòng `base.match(/^.*\.csv$/)` là catch-all sau khi test `^log_.*\.csv$`) — nghĩa là dù file không có prefix `log_`, miễn đuôi `.csv` sẽ luôn được xử lý như sensor data. Nếu ROV có loại file CSV khác (không phải sensor) trong tương lai, sẽ bị parse sai (có thể trả về "No valid readings found" nếu không khớp cột nào, nhưng không bị coi là `unknown`).
4. **Batch upload không cascade / không dọn dẹp gì khi xảy ra lỗi giữa chừng** — ví dụ nếu file thứ 5 trong ZIP gây lỗi, 4 file trước đó **đã được lưu vào DB thành công và không bị rollback** — thiết kế "best-effort, partial success" phù hợp với ngữ cảnh thực tế (dữ liệu ROV quý giá, thà lưu được phần nào hơn mất hết), nhưng cần lưu ý đây không phải giao dịch atomic.
5. **Không có validate ObjectId tường minh cho `tripId`** trong `uploadBatch` — dựa vào `Trip.findById(tripId)` tự động ném `CastError` nếu `tripId` sai định dạng, được `next(err)` xử lý ở tầng middleware lỗi.
6. **Giới hạn kích thước file**: `multer` cấu hình `limits: { fileSize: 500 * 1024 * 1024 }` (500MB) áp dụng **cho từng file riêng lẻ** trong request (bao gồm cả file ZIP tổng) — không giới hạn tổng dung lượng toàn bộ file trong 1 request multipart.
7. **Video/ảnh trong ZIP không được tự động upload lên S3** — chỉ dừng ở mức ghi nhận tên file, đẩy trách nhiệm upload thật cho operator qua luồng Media riêng (presigned URL). Đây là thiết kế có chủ đích để tách trách nhiệm rõ ràng: `batch.controller.js` chỉ lo dữ liệu "cấu trúc" (CSV/JSON/binary nhỏ), còn media nặng (video/ảnh) đi qua pipeline S3 tối ưu hơn (presigned URL, không phải qua Node.js buffer trung gian).

---

## Tổng kết bảng liên kết module

| File | Import model/service module khác | Vai trò kết nối |
|---|---|---|
| `rov.service.js` | `Project` model | Chặn xóa ROV nếu còn Project tham chiếu |
| `project.service.js` | `Trip` model, `trip.service.js` (lazy require) | Cascade xóa toàn bộ Trip con khi xóa Project |
| `project.controller.js` | `notification.service.js`, `config/queue.js` (Bull), `audit.service.js` | Thông báo khi Project completed; enqueue AI summary job |
| `trip.controller.js` | `Project` model (lazy require trong `create`) | Validate Project tồn tại trước khi tạo Trip |
| `trip.service.js` | `SensorData`, `DVLData`, `SonarFile`, `Media`, `Snapshot` models, `s3` config | Cascade xóa toàn bộ dữ liệu con + S3 khi xóa Trip |
| `trip.routes.js` | `sensorCtrl`, `dvlCtrl`, `sonarCtrl`, `batchCtrl` | Cửa ngõ API cho toàn bộ dữ liệu ROV gắn theo Trip |
| `batch.controller.js` | `DVLData`, `SonarFile`, `SensorData`, `Trip` models; tái dùng `parseDvlBuffer` (dvl), `parseSonarMeta`/`recordedAtFromFilename` (sonar); `geocode.util.js` | Pipeline xử lý ZIP upload hàng loạt, ghi trực tiếp vào 3 collection dữ liệu con |

---