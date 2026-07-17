# Giải thích chi tiết mã nguồn — Media, Sensor, DVL, Sonar, Snapshot (Evidence)

> Tài liệu này giải thích chi tiết các module backend xử lý dữ liệu lõi của hệ thống ROV Management: upload media lên AWS S3 + phân tích YOLOv8, upload/hiển thị sensor data + anomaly detection, DVL trajectory, Sonar file, và Evidence System (photo/clip snapshot). Đây là phần quan trọng nhất của đồ án vì thể hiện toàn bộ pipeline xử lý dữ liệu thực địa từ ROV.

---

## Tổng quan luồng Media Upload → S3 → YOLO Analysis

```
[Frontend]                          [Backend]                              [AWS S3]            [YOLO service]
    │                                   │                                       │                     │
    │  POST /media/presigned-url       │                                       │                     │
    │  {tripId, fileName, mimeType,    │                                       │                     │
    │   size, recordedAt?}             │                                       │                     │
    ├──────────────────────────────────▶ media.controller.getUploadUrl         │                     │
    │                                   │  - validate size ≤ 500MB, mimeType   │                     │
    │                                   │    trong whitelist                   │                     │
    │                                   │  - suy ra projectId từ Trip nếu      │                     │
    │                                   │    client không gửi                  │                     │
    │                                   │  media.service.createPresignedUploadUrl│                   │
    │                                   │  - tạo s3Key = trips/{tripId}/{uuid}.ext│                  │
    │                                   │  - PutObjectCommand + getSignedUrl   │                     │
    │                                   │    (expiresIn 300s)                  │                     │
    │                                   │  - tạo Media doc status='pending'    │                     │
    │  ◀── {uploadUrl, media}          │                                       │                     │
    │                                   │                                       │                     │
    │  PUT uploadUrl (raw file bytes) ─────────────────────────────────────────▶ Lưu file trực tiếp  │
    │                                   │                                       │  (client upload    │
    │                                   │                                       │   thẳng, backend    │
    │                                   │                                       │   không qua tay)   │
    │                                   │                                       │                     │
    │  PATCH /media/:id/confirm        │                                       │                     │
    ├──────────────────────────────────▶ media.controller.confirmUpload        │                     │
    │                                   │  media.service.confirmUpload:        │                     │
    │                                   │  - status = 'ready', analysisStatus  │                     │
    │                                   │    = 'idle'  (KHÔNG auto phân tích)  │                     │
    │                                   │  - nếu recordedAt chưa có → thử parse│                     │
    │                                   │    từ originalName (parseTimestamp   │                     │
    │                                   │    FromFilename)                     │                     │
    │  ◀── media (status=ready)        │                                       │                     │
    │                                   │                                       │                     │
    │  === Operator chủ động bấm "Run Analysis" (AIAnalyzePopover) ===        │                     │
    │  POST /media/:id/analyze         │                                       │                     │
    │  {model, confidence}             │                                       │                     │
    ├──────────────────────────────────▶ media.controller.analyze              │                     │
    │                                   │  media.service.enqueueAnalysis:      │                     │
    │                                   │  - validate model regex, confidence  │                     │
    │                                   │    0.1–0.9                           │                     │
    │                                   │  - set analysisStatus='pending'      │                     │
    │                                   │  - Bull: mediaAnalysisQueue.add(...) │                     │
    │  ◀── 202 Accepted                │                                       │                     │
    │                                   │                                       │                     │
    │                                   │  [Bull worker - media.worker.js]     │                     │
    │                                   │  - lấy media từ DB, tạo presigned    │                     │
    │                                   │    GET URL (expiresIn 600s)          │                     │
    │                                   │  - POST YOLO_SERVICE_URL/detect ─────────────────────────▶│
    │                                   │    {mediaUrl, mediaType, model,      │                     │  chạy YOLOv8:
    │                                   │     confidence}                      │                     │  - ảnh: predict()
    │                                   │                                       │                     │  - video: track()
    │                                   │  ◀── labels[] (name, confidence,     │                     │    (ByteTrack)
    │                                   │      frameTime, trackId, bbox) ──────────────────────────── │
    │                                   │  - lưu Media.labels + analysisStatus │                     │
    │                                   │    = 'done'                          │                     │
    │                                   │  - notifService.create(...) → SSE    │                     │
    │                                   │    push đến uploader                 │                     │
    │  ◀══ SSE: media_analysis_done ═══│                                       │                     │
    │  (frontend invalidate query       │                                       │                     │
    │   ['media'] → labels tự hiện)     │                                       │                     │
```

**Điểm mấu chốt (khác với thiết kế cũ):** Upload xong KHÔNG tự động chạy YOLO nữa. `POST /media/:id/analyze` là điểm kích hoạt duy nhất — operator chọn model + confidence qua popover rồi bấm "Run Analysis". Điều này tránh tốn tài nguyên CPU (video dài chạy YOLO có thể mất nhiều phút) khi không cần thiết.

---

## Tổng quan luồng Sensor Data Upload → Anomaly Detection

```
Operator (sau khi ROV về bờ)
    │  Parse file CSV/JSON phía client (frontend) → mảng readings[]
    ▼
POST /trips/:id/sensor-data/upload  { readings: [...], sourceFile: "log_xxx.csv" }
    │
    ▼
sensor.controller.upload
    ├─ Validate: readings phải là array không rỗng
    ├─ Validate từng dòng: timestamp hợp lệ, depth bắt buộc; các field khác optional
    ├─ Build docs[] (SensorData) gán trip, sourceFile, timestamp + toàn bộ optional metrics
    ├─ Logic ghi đè / append (multi-file, TASK 6d):
    │   • Không có sourceFile (legacy) → xóa HẾT sensor data cũ của trip, insert mới (overwrite)
    │   • sourceFile đã tồn tại trong trip → xóa riêng data của file đó, insert lại (re-upload)
    │   • sourceFile MỚI → kiểm tra overlap: lấy timestamp lớn nhất hiện có (maxTs)
    │       - nếu file mới có dòng timestamp ≤ maxTs → cắt bỏ (droppedCount)
    │       - toàn bộ bị cắt → warning 'file_skipped'
    │       - cắt một phần → warning 'overlap_trimmed'
    ├─ insertMany(insertDocs, {ordered:false})
    ├─ Đọc lat/lng ở DÒNG ĐẦU TIÊN của readings[]
    │   - nếu hợp lệ VÀ trip chưa có gpsLocation (first-GPS-wins)
    │     → reverseGeocode(lat,lng) (Nominatim) → Trip.locationName
    │     → Trip.gpsLocation = {lat, lng}
    ├─ Cập nhật Trip.sensorCount = tổng số readings hiện có
    └─ Trả { count, total, warning?, droppedCount? }
    ▼
Frontend: SensorChart.jsx / TripDetailPage BottomChart hiển thị AreaChart
    │
    ▼
GET /trips/:id/sensor-data
    ├─ Query toàn bộ SensorData của trip, sort theo timestamp asc
    ├─ Tính stats: min/max/avg cho từng metric (depth, temp, temperature, pressure,
    │   voltage, battery_percent, humidity, powerLevel, lightLevel, cameraTilt)
    ├─ Tính anomalies bằng Z-Score cho 7 metric: |z| > 2.5 → đánh dấu bất thường
    │   z = |giá trị - mean| / std ; cần ≥ 4 điểm dữ liệu hợp lệ, std ≠ 0
    └─ Trả { data[], stats, anomalies[] } — data có sourceFile để frontend vẽ gap
    ▼
Chart highlight điểm đỏ tại các anomaly, Panel "Anomalies Detected" liệt kê
Map Leaflet ghim Marker tại trip.gpsLocation nếu có
```

**Aggregate multi-file:** `GET /trips/:id/data-files` gộp cả 3 loại (sensor, dvl, sonar) trong 1 lần gọi, dùng MongoDB `$group` theo `sourceFile` — phục vụ UI "DATA FILES" hiển thị danh sách file cụ thể thay vì chỉ icon.

---

## Tổng quan Evidence System (Photo/Clip snapshot)

Trong lúc xem lại video ROV, operator có thể "đóng băng" một khoảnh khắc quan trọng thành **evidence** — tách biệt hoàn toàn khỏi Media playlist (không làm loãng danh sách media chính).

| Khía cạnh | Photo | Clip |
|---|---|---|
| Nguồn ảnh | Canvas frame (client burn-in bbox) hoặc FFmpeg extract nếu canvas bị taint (CORS) | Không lưu file video riêng — chỉ lưu `startTime`/`endTime` tham chiếu vào video gốc + 1 thumbnail PNG tại `startTime` |
| Trường lưu S3 | `imageS3Key` (full-size PNG) | `thumbnailS3Key` (chỉ 1 frame làm preview) |
| Trường thời gian | `imageTime` (giây trong video lúc chụp) | `startTime`, `endTime` (khoảng giây) |
| YOLO chạy trên | Ảnh PNG tĩnh → `model.predict()` | Video gốc nhưng CHỈ xử lý frame trong khoảng `[startTime, endTime]` → `model.track()` |
| Xem lại | `EvidenceViewer` hiện `<img>` + bbox overlay (`DetectionSVG`) | `EvidenceViewer` hiện `<video>` constrained trong `[t0, t1]`, tự seek về `t0` khi phát hết đoạn |
| Tải về | `GET /snapshots/:id/download-url` → presigned PNG | `GET /snapshots/:id/download-clip` → FFmpeg `-c copy` stream trực tiếp (không re-encode), cắt đúng đoạn |

**Vì sao tách riêng khỏi Media?** Evidence không phải là "file mới" độc lập (clip không thực sự cắt và lưu video con — tiết kiệm dung lượng S3), mà chỉ là **con trỏ + metadata** trỏ vào Media gốc (`parentMediaId`). Điều này tránh nhân bản dữ liệu video nặng.

**Trường hợp CORS khi client canvas bị "tainted":** Nếu trình duyệt không cho phép `canvas.toDataURL()` (do video load qua presigned URL cross-origin), backend fallback dùng **FFmpeg** tải video từ S3 (qua presigned URL tạm 300s) và extract đúng frame tại `imageTime`/`startTime` bằng `ffmpeg-static` + `fluent-ffmpeg`.

---

## Module Media

### `backend/src/modules/media/media.model.js`
- **Chức năng chính:** Mongoose schema cho 1 file media (ảnh/video/document) gắn với 1 Trip + Project cụ thể, lưu metadata S3, trạng thái xử lý, và kết quả YOLO detection.
- **Các field quan trọng:**
  - `trip`, `project`, `uploadedBy` — ObjectId ref bắt buộc.
  - `s3Key` (unique) — đường dẫn file trên S3, dạng `trips/{tripId}/{uuid}.{ext}`.
  - `type`: enum `image|video|document|other` — suy ra từ mimeType (xem `media.service.js`).
  - `meta.duration/width/height/thumbnailKey` — điền bởi xử lý phía sau (hiện tại chủ yếu `duration` dùng cho auto-frame brush TASK 6e).
  - `status`: `pending` (vừa tạo presigned URL, chưa upload xong) → `ready` (đã confirm) → `failed`.
  - `order` — thứ tự hiển thị trong playlist, dùng cho drag-to-reorder.
  - `recordedAt` — thời điểm bắt đầu quay, dùng để **sync chart** (TASK 6c) — nullable, có thể đến từ: nhập tay, parse tên file, hoặc GPS/manifest auto-sync.
  - `labels[]` — mảng kết quả YOLO: `{name, confidence, frameTime, trackId, bbox:{x1,y1,x2,y2}}`. `frameTime` là giây tính từ đầu video (null với ảnh); `trackId` là ID object tracking từ ByteTrack (TASK 6b-4), cho phép theo dõi cùng 1 vật thể qua nhiều frame.
  - `analysisStatus`: `idle|pending|done|failed` — điều khiển UI hiển thị spinner/nút Run Analysis.
- **Index:** `{trip:1, createdAt:-1}` và `{project:1, createdAt:-1}` — tối ưu query danh sách media theo trip/project sort theo thời gian tạo mới nhất.
- **Điểm đáng chú ý:** `labels` là mảng phẳng chứa **tất cả detections theo thời gian** (không phải 1 record/class) — kể từ TASK 6b-2, cho phép bbox "di chuyển" theo video khi phát (frontend filter theo `currentTime ± ngưỡng`).

### `backend/src/modules/media/media.routes.js`
- **Chức năng chính:** Định tuyến REST cho module media, tất cả yêu cầu `authenticate` trước.
- **Route quan trọng:**
  - `GET /models` (operator/admin) — danh sách model YOLO khả dụng.
  - `POST /presigned-url` (operator/admin) — bước 1 upload.
  - `PATCH /:id/confirm` (operator/admin) — bước 2 upload.
  - `GET /:id/url` (mọi role đã login) — lấy presigned GET để xem/tải file.
  - `PATCH /reorder`, `PATCH /:id/move` (operator/admin) — sắp xếp / chuyển trip.
  - `DELETE /bulk` (chỉ admin) — xóa hàng loạt.
  - `POST /:id/analyze`, `POST /:id/analyze/cancel` (operator/admin) — trigger/hủy phân tích YOLO.
  - `PATCH /:id` (operator/admin) — **đặt sau** các route `/:id/...` cụ thể để Express không match nhầm (đúng nguyên tắc routing trong CLAUDE.md).
  - `DELETE /:id` (chỉ admin) — xóa 1 file.
  - `GET /trip/:tripId`, `GET /project/:projectId` — lấy danh sách theo scope.
- **Điểm đáng chú ý:** Phân quyền xóa đơn lẻ và bulk đều giới hạn `admin` (khác với `authorize('admin','operator')` cho các thao tác khác) — khớp bảng RBAC trong CLAUDE.md ("Xóa media (bulk): admin").

### `backend/src/modules/media/media.controller.js`
- **Chức năng chính:** Tầng HTTP — nhận request, validate input cơ bản, gọi `media.service`, trả response chuẩn `success()/error()`.
- **Hàm quan trọng:**
  - `getUploadUrl(req,res,next)`: đọc `{tripId, fileName, mimeType, size, recordedAt}` từ body; validate `size ≤ 500MB` (`MAX_SIZE = 500*1024*1024`) và `mimeType` nằm trong `ALLOWED_TYPES` (video mp4/webm/quicktime/x-msvideo, ảnh jpeg/png/webp, audio mp4/mpeg, pdf). Nếu client không gửi `projectId`, tự tra `Trip.findById(tripId).select('project')` để suy ra — tránh phải gửi thừa từ frontend.
  - `confirmUpload`: gọi thẳng `mediaService.confirmUpload(id)`.
  - `getByTrip`, `getByProject`: lấy danh sách.
  - `getViewUrl`: presigned GET để xem/tải.
  - `remove`, `bulkDelete`: xóa (đơn/nhiều).
  - `reorder`: nhận `{items:[{id,order}]}`.
  - `moveMedia`: đổi `trip` của 1 media sang trip khác.
  - `update`: patch field cho phép (`recordedAt`, `description`, `order`).
  - `analyze(req,res,next)`: đọc `{model='yolov8n', confidence=0.3}` từ body → `mediaService.enqueueAnalysis` → trả **202 Accepted** (đúng chuẩn REST cho async job).
  - `getModels`: gọi `GET {YOLO_URL}/models` (timeout 4s qua `AbortSignal.timeout`); nếu lỗi/không phản hồi → fallback trả về danh sách mặc định `[{name:'yolov8n', label:'YOLOv8n General', speed:'fast', warning:null}]` — đảm bảo UI luôn có ít nhất 1 lựa chọn dù YOLO service down.
  - `cancelAnalyze`: set `analysisStatus='failed'` — dùng khi operator muốn hủy chờ (không có cơ chế hủy Bull job thật sự, chỉ đánh dấu trạng thái).
- **Điểm đáng chú ý:** Controller không chứa business logic phức tạp — đúng nguyên tắc kiến trúc trong CLAUDE.md ("Controller không chứa business logic — chuyển hết sang service").

### `backend/src/modules/media/media.service.js`
- **Chức năng chính:** Toàn bộ business logic tương tác S3 + MongoDB cho media: tạo presigned URL, confirm, CRUD, enqueue phân tích.
- **Hàm quan trọng:**
  - `getMediaType(mimeType)`: dùng `MIME_TYPE_MAP` (object các hàm test) để map mimeType → `image|video|document`; không match → `other`. Lưu ý: `audio/mp4` được xếp vào `video` (có thể là ghi âm sonar hoặc phối hợp với `video/mp4` container).
  - `createPresignedUploadUrl({tripId, projectId, userId, fileName, mimeType, size, recordedAt})`:
    - Tạo `s3Key = trips/{tripId}/{uuidv4()}.{ext}` — dùng UUID để tránh trùng tên, KHÔNG giữ tên gốc trong key (tên gốc lưu ở `originalName`).
    - `PutObjectCommand` + `getSignedUrl(..., {expiresIn:300})` — presigned PUT URL 5 phút, đủ để client bắt đầu upload.
    - Tìm `order` cao nhất hiện tại của trip (`Media.findOne({trip}).sort({order:-1})`) để media mới luôn nằm cuối playlist.
    - Tạo `Media` doc với `status:'pending'` NGAY LẬP TỨC (trước khi client thực sự upload xong) — cho phép track file "đang chờ upload".
  - `confirmUpload(mediaId)`:
    - Set `status:'ready', analysisStatus:'idle'`.
    - Logic ưu tiên `recordedAt`: **manifest** (đã set lúc tạo presigned URL) > **filename pattern** (`parseTimestampFromFilename`) > giữ `null`. Chỉ parse từ filename NẾU `recordedAt` hiện đang null — tránh ghi đè giá trị đã có từ nguồn ưu tiên cao hơn.
    - `.populate('uploadedBy', 'fullName')` để trả kèm tên người upload.
  - `getByTrip(tripId)` / `getByProject(projectId)`: chỉ lấy `status:'ready'`, sort theo `order, createdAt` (trip) hoặc `createdAt desc` (project) — file `pending`/`failed` không hiển thị trong gallery.
  - `reorder(items)`: `Promise.all` update từng `order` song song.
  - `createViewUrl(mediaId)`: presigned GET, `ResponseContentDisposition: attachment; filename=...` để browser tải đúng tên gốc thay vì UUID.
  - `moveToTrip(mediaId, newTripId)`: đổi trip, reset `order=0`.
  - `bulkRemove(ids)`: xóa S3 song song (best-effort — lỗi S3 bị nuốt bằng `.catch(()=>{})` để không chặn xóa DB), rồi `deleteMany`.
  - `remove(mediaId)`: xóa file S3 chính + `meta.thumbnailKey` nếu có, rồi xóa DB doc. **Khác `bulkRemove`:** đây throw lỗi nếu S3 delete chính thất bại (không có `.catch`), chỉ thumbnail là best-effort.
  - `update(mediaId, data)`: whitelist field được phép sửa `['recordedAt','description','order']` — chặn client sửa field nhạy cảm như `s3Key`, `status`.
  - `enqueueAnalysis(mediaId, {model, confidence})`:
    - Validate `model` bằng regex `^[a-zA-Z0-9_-]{1,64}$` (chống injection tên file/path traversal khi Node truyền sang Python service).
    - Validate `confidence` trong khoảng `[0.1, 0.9]`.
    - Set `analysisStatus:'pending'` NGAY để UI phản hồi tức thì.
    - `mediaAnalysisQueue.add({mediaId, mimeType, userId, model, confidence}, {jobId: 'media-analysis-{id}-{timestamp}'})` — jobId có timestamp để tránh Bull coi 2 lần enqueue liên tiếp là job trùng.
  - `cancelAnalysis(mediaId)`: set `analysisStatus:'failed'` — không thực sự hủy job Bull đang chạy trong worker, chỉ đổi trạng thái hiển thị.
- **Luồng dữ liệu:** Import `mediaAnalysisQueue` từ `config/queue.js`. Đây là điểm nối duy nhất với Bull — `media.worker.js` mới là nơi `process()` job.
- **Điểm đáng chú ý:** Presigned PUT (upload) hết hạn sau 300s, presigned GET (xem) hết hạn sau 3600s (1 giờ) — khác nhau vì upload cần nhanh gọn còn xem video có thể kéo dài.

### `backend/src/modules/media/media.worker.js`
- **Chức năng chính:** Bull worker xử lý job `media-analysis` — gọi YOLO microservice để nhận diện vật thể trong ảnh/video, lưu kết quả, và push notification real-time qua SSE.
- **Chi tiết xử lý (`mediaAnalysisQueue.process(async (job) => {...})`)**:
  1. Destructure `{mediaId, mimeType, userId}` từ `job.data` (lưu ý: `model`, `confidence` được lấy lại bên trong try-block, không destructure ở đầu).
  2. Tìm `Media` theo `mediaId`; nếu không tồn tại → `throw new Error(...)` (Bull sẽ log job failed).
  3. **Tạo presigned GET URL mới** (10 phút, `expiresIn:600`) để YOLO service (chạy Python, không có quyền truy cập AWS credentials của Node) tải file từ S3 — đây là cách né việc phải cấp IAM credentials cho service Python.
  4. **Timeout động theo loại file:** `isVideo = mimeType.startsWith('video/')` → `axiosTimeout = isVideo ? 22*60*1000 : 60*1000` (22 phút cho video, 60 giây cho ảnh). Comment trong code giải thích rõ: video 30 phút lấy mẫu mỗi 2s ≈ 900 frame × ~400ms/frame ≈ 6 phút xử lý + thời gian download.
  5. Gọi `axios.post('{YOLO_URL}/detect', {mediaUrl, mediaType, model, confidence}, {timeout: axiosTimeout})` — đây là bước gọi model chính (`model` mặc định `'yolov8n'`, `confidence` mặc định `0.3` nếu job không truyền, dù thực tế luôn được truyền từ `media.service.enqueueAnalysis`).
  6. **Xử lý lỗi kết nối riêng biệt:** nếu `err.code` là `ECONNREFUSED|ECONNRESET|ETIMEDOUT` (YOLO service down hoặc quá tải) → set `analysisStatus:'failed'` và **return êm** (không throw) — tránh Bull spam retry vô ích khi service rõ ràng không khả dụng. Lỗi khác (vd lỗi logic từ YOLO service) → set `failed` rồi **re-throw** để Bull ghi nhận job failed đúng nghĩa.
  7. Thành công: `Media.findByIdAndUpdate(mediaId, {labels, analysisStatus:'done'})` — `labels` là toàn bộ response body từ YOLO service (mảng `{name, confidence, frameTime, trackId, bbox}`), **overwrite hoàn toàn** labels cũ (đúng thiết kế TASK 6b-4 — không versioning).
  8. **SSE push:** nếu có `userId`, gọi `notifService.create(userId, 'media_analysis_done', 'Object detection complete', '{n} object(s) detected...', '/trips/{media.trip}')`. Gọi `.catch(()=>{})` để lỗi notification không làm crash worker. Đây chính là điểm nối với module `notifications` (SSE) — frontend `useSSE.js` lắng nghe event này để `invalidateQueries(['media'])`.
- **Điểm đáng chú ý:**
  - Job chỉ có `attempts:1` (cấu hình trong `config/queue.js` cho `mediaAnalysisQueue`) — không tự động retry vì video timeout sẽ luôn timeout lại (lãng phí), retry chỉ hữu ích cho lỗi tạm thời như `ECONNREFUSED`.
  - `timeout` mặc định của queue là 25 phút (`config/queue.js`), lớn hơn `axiosTimeout` (22 phút) một chút để axios luôn timeout trước và worker có cơ hội catch lỗi gọn gàng thay vì bị Bull force-kill job.

---

## Module Sensor

> **Lưu ý quan trọng:** Không tồn tại file `sensor.routes.js` riêng trong thư mục `backend/src/modules/sensor/`. Route sensor được đăng ký **trực tiếp trong `backend/src/modules/trips/trip.routes.js`** bằng cách import `sensorCtrl = require('../sensor/sensor.controller')` rồi gắn route thủ công (`router.get('/:id/sensor-data', sensorCtrl.getSensorData)` v.v. — xem chi tiết ở mục "Trip routes" bên dưới).

### `backend/src/modules/sensor/sensor.model.js`
- **Chức năng chính:** Schema 1 reading cảm biến tại 1 thời điểm, gắn với 1 Trip cụ thể (không phải Project — đúng nguyên tắc "Trip = 1 lần lặn" trong CLAUDE.md).
- **Field:**
  - `trip` (bắt buộc), `sourceFile` (nullable — tên file gốc, phục vụ multi-file TASK 6d), `timestamp` (bắt buộc), `depth` (bắt buộc).
  - Optional: `temp`, `pressure`, `yaw`, `pitch`, `roll`, `temperature` (nhiệt độ board/electronics, khác với `temp` — cột "Temperature" trong CSV GCS), `voltage`, `battery_percent`, `humidity`.
  - GCS discrete fields: `holdDepth`, `holdHeading`, `manual` (0/1 boolean dạng Number), `cameraTilt`, `lightLevel`, `powerLevel`.
- **Index:** `{trip:1, timestamp:-1}` (query nhanh theo trip sort mới nhất) và `{trip:1, sourceFile:1, timestamp:1}` (hỗ trợ multi-file: tìm nhanh theo file cụ thể, sort tăng dần cho chart).
- **Điểm đáng chú ý:** Không dùng `{timestamps:true}` của Mongoose (không có `createdAt/updatedAt` tự động) — vì bản thân đã có field `timestamp` nghiệp vụ riêng.

### `backend/src/modules/sensor/sensor.controller.js`
- **Chức năng chính:** Xử lý upload bulk sensor readings (với logic multi-file overlap-trim), xóa theo file/toàn bộ, trả sensor data kèm thống kê + anomaly detection, và API tổng hợp danh sách file (`data-files`).
- **Hàm `upload(req, res, next)`** — chi tiết logic:
  1. Nhận `{readings, sourceFile}` từ body; validate `readings` phải là array không rỗng.
  2. Tìm `Trip` theo `tripId` (từ `req.params.id`) — không tồn tại → 404.
  3. Duyệt từng `reading`, validate: `timestamp` parse được bằng `new Date()` (không NaN), `depth != null` bắt buộc. Các field khác dùng helper `optNum(v)` — trả `Number(v)` nếu có giá trị hợp lệ (khác `null`/`''`), ngược lại `null`.
  4. **Logic ghi đè/append (trái tim của TASK 6d):**
     - **Không có `sourceFile`** (legacy client cũ) → `SensorData.deleteMany({trip})` — xóa sạch, giữ hành vi cũ để tương thích ngược.
     - **`sourceFile` đã tồn tại trong trip** (`existingCount > 0`) → coi là "re-upload" cùng 1 file → `deleteMany({trip, sourceFile})` rồi insert lại toàn bộ.
     - **`sourceFile` mới hoàn toàn** → kiểm tra overlap: lấy `maxTs` = timestamp lớn nhất hiện có trong TOÀN BỘ trip (không phân biệt file khác). Nếu file mới có dòng nào có `timestamp ≤ maxTs` → bị lọc bỏ (`droppedCount`). Nếu lọc hết sạch → `warning='file_skipped'`; nếu lọc một phần → `warning='overlap_trimmed'`.
  5. `SensorData.insertMany(insertDocs, {ordered:false})` — `ordered:false` để 1 document lỗi không chặn các document khác insert thành công.
  6. **Reverse geocoding GPS:** đọc `lat`/`lng` từ **dòng đầu tiên** của `readings` (không phải từ toàn bộ mảng) — parse bằng `parseFloat`. Nếu hợp lệ VÀ trip **chưa có** `gpsLocation.lat` (first-GPS-wins — GPS chỉ set 1 lần, không bị ghi đè bởi lần upload file thứ 2 của cùng trip) → gọi `reverseGeocode(lat,lng)` (Nominatim) để lấy `locationName`, rồi update cả `gpsLocation` và `locationName` vào Trip.
  7. Cập nhật `Trip.sensorCount` = tổng số document hiện có sau khi upload (không phải chỉ số vừa insert).
  8. Trả `{count: insertDocs.length, total: newCount, warning?, droppedCount?}` với message khác nhau tùy warning.
- **Hàm `clear(req,res,next)`:**
  - Có `?file=xxx` → chỉ xóa readings của `sourceFile` đó, cập nhật lại `sensorCount`.
  - Không có `?file=` → xóa **toàn bộ** sensor data của trip, đồng thời reset `gpsLocation={lat:null,lng:null}` và `locationName=''` — tức là xóa toàn bộ sensor sẽ mất luôn thông tin GPS đã suy ra (hành vi có chủ đích, vì GPS đến từ sensor data).
- **Hàm `zScoreAnomalies(readings, metric, threshold=2.5)`** — công thức Anomaly Detection:
  ```
  mean = trung bình cộng các giá trị hợp lệ của metric
  std  = sqrt( Σ(x - mean)² / n )        (population standard deviation)
  z    = |x - mean| / std
  ANOMALY nếu z > threshold (mặc định 2.5)
  ```
  - Cần tối thiểu **4 giá trị hợp lệ** (`vals.length < 4` → trả `[]`) — tránh z-score vô nghĩa với mẫu quá nhỏ.
  - `std === 0` (tất cả giá trị giống hệt nhau) → trả `[]` — tránh chia cho 0.
  - Kết quả mỗi anomaly: `{index, metric, value, zScore (làm tròn 2 chữ số thập phân), timestamp}`.
- **Hàm `getSensorData(req,res,next)`:**
  - Query toàn bộ `SensorData` của trip, sort `timestamp:1` (tăng dần — đúng thứ tự thời gian cho chart).
  - Không có dữ liệu → trả `{data:[], stats:null, anomalies:[]}` (empty state).
  - **Stats** (min/max/avg làm tròn 3 chữ số thập phân) tính cho 10 metric: `depth, temp, temperature, pressure, voltage, battery_percent, humidity, powerLevel, lightLevel, cameraTilt`.
  - **Anomalies**: chạy `zScoreAnomalies` cho 7 metric quan trọng nhất (`depth, temp, temperature, pressure, voltage, battery_percent, humidity`) rồi gộp lại, sort theo `index` tăng dần (để hiển thị đúng thứ tự thời gian trên chart dù metric khác nhau).
  - `data[]` trả về đầy đủ toàn bộ field kể cả `sourceFile` (dùng cho vẽ gap giữa các file trên chart — TASK 6d-5) và các field GCS discrete.
- **Hàm `getDataFiles(req,res,next)`** (API mới TASK 6d):
  - Dùng `mongoose.Types.ObjectId` ép kiểu `tripId` để dùng trong aggregation pipeline (`$match`).
  - Chạy song song 3 query (`Promise.all`):
    - `SensorData.aggregate`: `$group` theo `sourceFile`, tính `count`, `minTs`, `maxTs` — sort theo `minTs`.
    - `DVLData.aggregate`: `$group` theo `sourceFile`, tính `count`.
    - `SonarFile.find({trip}).sort({recordedAt:1, createdAt:1})`.
  - Trả về object `{sensor:[...], dvl:[...], sonar:[...]}` — dùng để render section "DATA FILES" hiển thị tên file cụ thể trong `TripList.jsx` (ProjectDetailPage) và `TripDetailPage.jsx`.
- **Luồng dữ liệu / kết nối:** Import trực tiếp `DVLData` và `SonarFile` model (dù tên file là `sensor.controller.js`) để phục vụ hàm tổng hợp `getDataFiles` — đây là lý do module sensor "biết" về DVL/Sonar dù về mặt domain là 3 loại dữ liệu riêng biệt. Gọi `reverseGeocode` từ `utils/geocode.util.js` (Nominatim OpenStreetMap, free, có `User-Agent` header + timeout 5s).
- **Điểm đáng chú ý / edge case:**
  - Không có GPS trong file → `hasGps=false`, bỏ qua bước reverse geocode, Trip giữ nguyên `gpsLocation` cũ (nếu có từ file trước).
  - Reverse geocode lỗi mạng/API → `reverseGeocode` trong `geocode.util.js` catch lỗi và trả `''` (không throw), nên upload sensor **không bao giờ fail vì lỗi geocoding**.
  - File trùng hoàn toàn về khoảng thời gian với dữ liệu cũ → toàn bộ bị trim, `insertDocs.length === 0`, `SensorData.insertMany` bị skip (có check `if (insertDocs.length > 0)`), tránh gọi insertMany với mảng rỗng (MongoDB sẽ lỗi nếu insertMany([])).

### Route sensor thực tế (trong `trip.routes.js`)
Vì không có `sensor.routes.js`, các route sau được đăng ký trực tiếp trong `backend/src/modules/trips/trip.routes.js`:
```js
router.get('/:id/sensor-data', sensorCtrl.getSensorData);
router.post('/:id/sensor-data/upload', authorize('admin','operator'), sensorCtrl.upload);
router.delete('/:id/sensor-data', authorize('admin','operator'), sensorCtrl.clear);
router.get('/:id/data-files', sensorCtrl.getDataFiles);
```
Router này dùng `express.Router({mergeParams:true})` nên `req.params.id` (tripId) truyền xuyên suốt từ router cha `projects/:projectId/trips` hoặc mount trực tiếp `/trips`.

---

## Module DVL

### `backend/src/modules/dvl/dvl.model.js`
- **Chức năng chính:** Schema 1 điểm dữ liệu DVL (Doppler Velocity Log) — vị trí tương đối tính bằng dead-reckoning, dùng để vẽ trajectory (đường di chuyển) của ROV dưới nước khi không có GPS.
- **Field:** `trip`, `sourceFile` (nullable, multi-file TASK 6d), `ts` (Unix seconds dạng float — đồng hồ nội bộ ROV, KHÔNG phải UTC tuyệt đối), `x`/`y` (mét, Đông/Bắc tương đối), `z` (độ sâu, optional), `std` (độ bất định, mét), `roll/pitch/yaw`, `status` (0 = valid theo quy ước DVL).
- **Index:** `{trip:1, ts:1}` và `{trip:1, sourceFile:1, ts:1}`.
- **Điểm đáng chú ý:** `{timestamps:false, versionKey:false}` — không cần `createdAt/updatedAt`/`__v` vì đây là dữ liệu time-series khối lượng lớn, tối ưu kích thước document.

### `backend/src/modules/dvl/dvl.controller.js`
- **Chức năng chính:** Parse file JSON DVL dạng newline-delimited (NDJSON), lọc bản ghi hợp lệ, hỗ trợ multi-file merge theo thời gian thực (absolute time), downsample để trả về frontend không bị quá tải.
- **Hàm `parseDvlBuffer(buffer)`:**
  - Tách buffer theo `\n`, mỗi dòng `JSON.parse` riêng lẻ (không parse cả file như 1 JSON array — đúng định dạng NDJSON streaming của thiết bị DVL thực tế).
  - Chỉ giữ record có `obj.type === 'position_local'` và có đủ `x`, `y`, `ts` — các message khác (velocity, status ping...) bị bỏ qua.
  - Dòng lỗi JSON (`try/catch`) bị skip êm, không làm crash toàn bộ file.
- **Hàm `downsample(arr, maxPts)`:** nếu số điểm ≤ `maxPts` giữ nguyên; ngược lại lấy mẫu đều theo `step = arr.length/maxPts`, chọn index `Math.round(i*step)` — đây là uniform downsampling (không phải LOD/Douglas-Peucker phức tạp), đủ dùng để vẽ trajectory mượt mà không gửi hàng chục nghìn điểm.
- **Hàm `upload(req,res,next)`:**
  - Nhận file qua `multer` memory storage (`req.file.buffer`), lấy `filename = req.file.originalname`.
  - Parse toàn bộ, lọc `status === 0` (valid) — không có bản ghi hợp lệ nào → lỗi 400.
  - **Multi-file (TASK 6d):** nếu `sourceFile` (filename) đã tồn tại → xóa data cũ của đúng file đó rồi insert lại (re-upload); nếu file mới → **append thẳng, không cần overlap check** (khác sensor!) vì lý do: "GPS/trajectory track không có khái niệm overwrite theo thời gian" — ghi rõ trong code comment.
  - Cập nhật `Trip.dvlCount`.
- **Hàm `getPath(req,res,next)`** — logic phức tạp nhất trong module DVL, xử lý merge nhiều file theo thời gian thực:
  - Lấy toàn bộ `DVLData` của trip.
  - Với mỗi `sourceFile`, xây `fileMeta[sf] = {ts0, recordedAtMs}`:
    - `ts0` = giá trị `ts` nhỏ nhất trong file đó (mốc "0" cục bộ của đồng hồ ROV cho file này).
    - `recordedAtMs` = parse UTC timestamp thực từ TÊN FILE (`parseTimestampFromFilename`), null nếu tên file không khớp pattern.
  - **Vấn đề cốt lõi cần giải quyết:** mỗi file DVL có đồng hồ `ts` riêng (thường reset về gần 0 khi thiết bị khởi động lại giữa các lần ghi) → nếu sort thẳng theo `ts` khi có nhiều file, các file sẽ bị **xen kẽ lẫn nhau** sai thứ tự thời gian thực.
  - Giải pháp: nếu **TẤT CẢ** file đều xác định được `recordedAtMs` (`canMergeByTime = mọi file có recordedAtMs != null`) → tính `absoluteMs = recordedAtMs + (ts - ts0)*1000` cho từng điểm rồi sort theo `absoluteMs`. Nếu không (thiếu ít nhất 1 file không parse được tên) → fallback sort theo `ts` thô (hành vi cũ, chỉ đúng khi 1 file duy nhất).
  - `downsample(withAbs, 2000)` rồi trả về `{ts, x, y, z, roll, pitch, yaw, absoluteMs}` cho mỗi điểm.
  - Trả kèm `gpsAnchor` = `trip.gpsLocation` nếu có — dùng ở frontend để "neo" trajectory tương đối (x,y mét) vào 1 tọa độ GPS thực tế trên bản đồ.
- **Hàm `clear`:** giống pattern sensor — có `?file=` xóa riêng file đó, không có thì xóa hết + reset `dvlCount=0`.
- **Điểm đáng chú ý:** Export cả `parseDvlBuffer` (không chỉ các route handler) — khả năng được dùng lại ở `batch.controller.js` cho tính năng batch upload folder/ZIP.

### `backend/src/modules/dvl/dvl.routes.js`
- **Chức năng chính:** Router độc lập định nghĩa `GET/:id/dvl`, `POST /:id/dvl/upload`, `DELETE /:id/dvl` với `multer` giới hạn 50MB.
- **⚠️ Điểm cần lưu ý:** File này **KHÔNG được mount trong `app.js`** — kiểm tra `app.js` chỉ thấy `require('./modules/trips/trip.routes')`, không có `require('./modules/dvl/dvl.routes')`. Route DVL thực tế đang chạy production là bản đăng ký thủ công trong `trip.routes.js` (dùng chung `dvl.controller`). File `dvl.routes.js` hiện là **dead code / router dự phòng không dùng tới** — có thể là tàn dư từ giai đoạn refactor route DVL từ module riêng sang gộp vào `trip.routes.js`.

---

## Module Sonar

### `backend/src/modules/sonar/sonar.model.js`
- **Chức năng chính:** Schema metadata 1 file sonar binary (không parse waveform vào DB, chỉ lưu thống kê + S3 key).
- **Field:** `trip`, `filename` (tên gốc), `s3Key`, `frameCount`, `durationMs`, `fileSizeBytes`, `recordedAt` (parse từ tên file).
- **Index:** `{trip:1}`.
- **`{timestamps:true, versionKey:false}`** — có `createdAt/updatedAt` (khác DVL) vì số lượng file sonar/trip nhỏ, không cần tối ưu size.

### `backend/src/modules/sonar/sonar.controller.js`
- **Chức năng chính:** Upload file sonar binary tùy chỉnh (custom binary format `SONAR360`), parse header để lấy `frameCount`/`durationMs` mà KHÔNG cần lưu toàn bộ waveform vào MongoDB (chỉ lưu trên S3), cấp presigned URL để client tải về phát lại bằng `SonarViewer.jsx`.
- **Hàm `parseSonarMeta(buffer)`:**
  - Kiểm tra `buffer.length ≥ HEADER_SIZE (32 bytes)`.
  - Đọc 8 byte đầu bằng ASCII, phải khớp `MAGIC = 'SONAR360'` — nếu không → throw lỗi rõ ràng (magic number validation, kỹ thuật phổ biến để nhận diện định dạng file binary).
  - Duyệt từng frame bắt đầu từ offset 32: mỗi frame có header 12 byte (`FRAME_HEADER`) gồm `timestampMs` (8 byte, đọc bằng `readBigInt64LE` vì có thể vượt quá giới hạn 32-bit an toàn của JS Number), `angleGrads` (2 byte, không dùng trong hàm này), `numSamples` (2 byte, `readUInt16LE`).
  - `frameSize = FRAME_HEADER + numSamples` — nếu frame tiếp theo vượt quá độ dài buffer thì dừng (`break`) — bảo vệ chống file bị cắt/hỏng.
  - Track `firstTs`/`lastTs` để tính `durationMs = lastTs - firstTs`.
- **Hàm `recordedAtFromFilename(filename)`:** đơn giản là wrapper gọi `parseTimestampFromFilename` (shared util), comment nói rõ giờ trong tên file là **UTC+7** (giờ Việt Nam).
- **Hàm `upload(req,res,next)`:**
  - Parse meta trước — lỗi format trả 400 rõ ràng kèm message cụ thể (vd sai magic number).
  - **Multi-file theo tên file (TASK 6d):** tìm `SonarFile` cùng `trip` + `filename` đã tồn tại → xóa S3 key cũ (best-effort `.catch(()=>{})`) + xóa doc cũ trước khi tạo mới (tức là "replace" đúng file đó, không phải xóa hết mọi file sonar của trip như hành vi cũ).
  - `s3Key = sonar/{tripId}/{uuid}-{filename}` — giữ tên gốc trong key (khác Media chỉ dùng UUID) để dễ debug trên S3 console.
  - `PutObjectCommand` upload thẳng buffer từ backend (KHÔNG dùng presigned URL client-side như Media) — vì sonar file thường nhỏ hơn video và được validate format trước khi lưu, nên để backend nhận qua `multer` rồi tự upload S3 hợp lý hơn.
  - Set `ContentDisposition: attachment; filename=...` ngay khi PUT.
  - Tạo `SonarFile` doc với `recordedAt` auto-parse từ filename.
  - Cập nhật `Trip.sonarCount = countDocuments` (không hardcode `=1` nữa — đúng yêu cầu TASK 6d-2 hỗ trợ nhiều file sonar).
- **Hàm `list`:** trả tất cả file sonar của trip, sort theo `createdAt:1`.
- **Hàm `getUrl`:** presigned GET 900s (15 phút) — dùng để `SonarViewer.jsx` tải file binary về phát lại phía client.
- **Hàm `remove`:** xóa S3 (best-effort) + xóa doc, cập nhật lại `sonarCount`.
- **Điểm đáng chú ý:** Đây là module duy nhất tự parse 1 định dạng binary custom (`SONAR360`) bằng tay bytes-level — thể hiện rõ việc thiết bị ROV xuất ra định dạng riêng, không phải chuẩn công nghiệp có sẵn.

### `backend/src/modules/sonar/sonar.routes.js`
- **Chức năng chính:** Định nghĩa `GET /:id/sonar`, `POST /:id/sonar/upload` (multer 500MB), `GET /:id/sonar/:sonarId/url`, `DELETE /:id/sonar/:sonarId`.
- **⚠️ Tương tự DVL:** File này cũng **KHÔNG được mount trong `app.js`** — route sonar thực tế đang chạy là bản đăng ký thủ công trong `trip.routes.js` (dùng chung `sonar.controller`). Đây cũng là dead code / router dự phòng, giữ lại có thể vì lý do lịch sử refactor hoặc dự định tách module độc lập sau này nhưng chưa dọn dẹp.

---

## Trip routes — nơi thực sự đăng ký sensor/dvl/sonar (`backend/src/modules/trips/trip.routes.js`)

Router này (`mergeParams:true`) là **điểm hợp nhất thực tế** của 3 module dữ liệu cảm biến, được mount trong `app.js` qua `require('./modules/trips/trip.routes')`. Nó import trực tiếp 3 controller (`sensorCtrl`, `dvlCtrl`, `sonarCtrl`) và `batchCtrl` (batch upload ZIP/folder — TASK 9 / manifest), rồi đăng ký toàn bộ route liên quan trip + 3 loại dữ liệu con trong 1 file duy nhất:
```
GET/POST   /                          (trip CRUD trong project)
GET/PATCH/DELETE /:id                 (trip CRUD)
GET/POST/DELETE  /:id/sensor-data...  (sensor)
GET        /:id/data-files            (tổng hợp sensor+dvl+sonar)
GET/POST/DELETE  /:id/dvl...          (dvl)
GET/POST/GET/DELETE /:id/sonar...     (sonar)
POST       /:id/data/upload-batch     (batch upload ZIP/folder — TASK 9)
```
Việc gộp route theo cách này giải thích tại sao `sensor.routes.js` không tồn tại và `dvl.routes.js`/`sonar.routes.js` là dead code.

---

## Module Snapshots (Evidence System)

### `backend/src/modules/snapshots/snapshot.model.js`
- **Chức năng chính:** Schema 1 evidence item — photo (khung hình đơn) hoặc clip (khoảng thời gian video) — được operator chủ động chụp/đánh dấu khi xem lại media.
- **Field:**
  - `type`: enum `photo|clip` bắt buộc — quyết định field nào được dùng.
  - `trip`, `project`, `createdBy`, `parentMediaId` (ref `Media` — video đang xem lúc tạo evidence, **tên field thực tế** `parentMediaId` chứ không phải `parentVideoId` như kế hoạch ban đầu, đã ghi chú lại trong CLAUDE.md).
  - Photo: `imageS3Key` (PNG full-size, đã burn-in bbox nếu overlay đang bật lúc chụp), `imageTime` (giây trong video).
  - Clip: `startTime`, `endTime` (giây), `thumbnailS3Key` (preview PNG tại `startTime`).
  - `aiLabels[]` — cùng cấu trúc với `Media.labels` (`name, confidence, bbox, frameTime, trackId`).
  - `analysisStatus`: `idle|pending|done|failed`.
  - `analysisMeta: {model, confidence, analyzedAt}` — lưu lại **model + confidence đã dùng lần phân tích gần nhất**, hiển thị trong popover settings (khác Media — Media không có field này ở schema, chỉ Snapshot mới track).
  - `note` — ghi chú tự do của operator.
- **Index:** `{trip:1, createdAt:-1}`.

### `backend/src/modules/snapshots/snapshot.routes.js`
- **Chức năng chính:** Định tuyến REST cho evidence, tất cả sau `authenticate`.
- **Route:**
  - `POST /` (operator/admin) — tạo evidence mới.
  - `GET /trip/:tripId` — lấy danh sách evidence của trip (mọi role xem được).
  - `DELETE /bulk`, `DELETE /:id` (operator/admin).
  - `POST /:id/analyze`, `POST /:id/analyze/cancel` (operator/admin).
  - `PATCH /:id/note` (operator/admin) — sửa ghi chú.
  - `GET /:id/download-url` — presigned tải ảnh/thumbnail.
  - `GET /:id/download-clip` — stream MP4 clip cắt trực tiếp (FFmpeg).
  - `GET /:id/image-raw` — proxy ảnh gốc qua backend (tránh CORS khi cần canvas export).
  - `GET /:id/frame-at` — trích 1 frame tùy ý theo `?time=`.
- **Điểm đáng chú ý:** Router này KHÔNG dùng `{mergeParams:true}` vì không nested dưới `/trips/:id` — nó là router top-level riêng (`/api/v1/snapshots`), nhận `tripId` qua query path `/trip/:tripId` thay vì `req.params` kế thừa.

### `backend/src/modules/snapshots/snapshot.controller.js`
- **Chức năng chính:** Tầng HTTP cho evidence — validate input theo `type` (photo cần `imageTime`, clip cần `startTime`+`endTime`), gọi service.
- **Hàm quan trọng:**
  - `create`: validate `type/tripId/parentMediaId` bắt buộc; validate riêng theo loại (`imageTime` cho photo, `startTime`+`endTime` cho clip). Tra `Trip.findById(tripId).select('project')` để lấy `projectId` tự động — evidence luôn gắn đúng project mà không cần client gửi thêm.
  - `getByTrip`, `remove`, `bulkDelete`: CRUD cơ bản.
  - `analyze`: nhận `{model, confidence}` giống hệt pattern Media — gọi `snapshotService.enqueueAnalysis`.
  - `cancelAnalyze`, `getDownloadUrl`, `updateNote`: tương tự Media.
  - `downloadClip`: **không dùng `success()` wrapper** — trả response binary trực tiếp (`res` được truyền thẳng vào `snapshotService.streamClipDownload`), vì đây là file stream chứ không phải JSON.
  - `proxyImage`: tương tự, response là ảnh nhị phân qua backend proxy.
  - `frameAt`: parse `?time=` từ query, validate `isNaN` và `< 0`, rồi stream 1 frame PNG tại thời điểm bất kỳ — dùng riêng response `res.status(400).json(...)` thủ công (không qua `error()` util) cho case lỗi input.

### `backend/src/modules/snapshots/snapshot.service.js`
- **Chức năng chính:** Toàn bộ business logic evidence — upload ảnh lên S3 (từ base64 hoặc FFmpeg extract), CRUD, enqueue phân tích YOLO, và các thao tác FFmpeg nặng (stream clip, extract frame).
- **Hàm `uploadImage(tripId, dataUrl, suffix='')`:**
  - Parse `data:image/png;base64,....` — tách `header` (lấy mimeType) và `b64` (payload).
  - `ext = mime==='image/png' ? 'png' : 'jpg'`.
  - Upload buffer lên `snapshots/{tripId}/{uuid}{suffix}.{ext}` — `suffix='-thumb'` dùng cho clip thumbnail để phân biệt với photo full-size.
  - Trả `null` nếu `dataUrl` là null (case CORS, xử lý ở nhánh khác).
- **Hàm `extractFrameFromVideo(tripId, parentMediaId, imageTime)`** — dùng khi client-side canvas bị "tainted" (video load qua cross-origin presigned URL khiến `canvas.toDataURL()` bị trình duyệt chặn vì lý do bảo mật):
  - Tra `Media` để lấy `s3Key`, tạo presigned GET URL 300s.
  - Dùng `fluent-ffmpeg` (với `ffmpeg-static` cung cấp binary path — không cần cài ffmpeg hệ thống) để `.seekInput(imageTime).frames(1).output(tempFile)` — trích đúng 1 frame tại giây `imageTime`, ghi ra file tạm trong `os.tmpdir()`.
  - Có `setTimeout` 30s để tự động `reject` + dọn file tạm nếu FFmpeg treo quá lâu (tránh leak resource / job không bao giờ kết thúc).
  - Khi FFmpeg `on('end')`: đọc file tạm, kiểm tra `buffer.length === 0` (FFmpeg chạy "thành công" nhưng output rỗng — có thể do seek vượt quá độ dài video) → throw lỗi rõ ràng, rồi upload buffer lên S3 và xóa file tạm.
  - `on('error')`: dọn file tạm, reject.
- **Hàm `create({type, tripId, projectId, userId, parentMediaId, imageTime, startTime, endTime, dataUrl, note})`:**
  - Nếu có `dataUrl` (canvas không bị CORS) → upload trực tiếp qua `uploadImage`, phân nhánh theo `type` (photo → `imageS3Key`, clip → `thumbnailS3Key` với suffix `-thumb`).
  - Nếu KHÔNG có `dataUrl` (CORS case) → dùng `extractFrameFromVideo`: photo trích tại `imageTime`, clip trích thumbnail tại `startTime`. Có `try/catch` bọc riêng — nếu FFmpeg extract lỗi, log lỗi nhưng **vẫn tạo Snapshot doc** (không có ảnh) thay vì fail toàn bộ request — đây là thiết kế "graceful degradation".
  - Cuối cùng `Snapshot.create({...})` lưu doc.
- **Hàm `getByTrip(tripId)`:** lấy toàn bộ snapshot sort `createdAt:-1`, với mỗi snapshot sinh presigned URL tương ứng (`imageUrl` cho photo, `thumbnailUrl` cho clip) song song bằng `Promise.all` — lỗi presigned URL riêng lẻ (`try/catch` trong map) không làm hỏng cả danh sách, chỉ item đó thiếu URL.
- **Hàm `remove`/`bulkRemove`:** xóa key S3 liên quan (image/thumbnail) trước khi xóa doc; `bulkRemove` xóa theo chunk 10 phần tử song song để tránh quá tải kết nối S3 cùng lúc.
- **Hàm `enqueueAnalysis(snapshotId, {model, confidence})`:** validate y hệt Media (regex model, confidence 0.1–0.9), set `analysisStatus:'pending'`, `snapshotAnalysisQueue.add({snapshotId, userId, model, confidence}, {jobId:'snap-{id}-{timestamp}'})`.
- **Hàm `cancelAnalysis`:** set `analysisStatus:'failed'`.
- **Hàm `getDownloadUrl(snapshotId)`:** chọn đúng key theo `type` (photo→`imageS3Key`, clip→`thumbnailS3Key`), presigned GET 300s, tự đặt tên file tải về (`snapshot-{6 ký tự cuối id}.png` hoặc `clip-thumb-{...}.png`).
- **Hàm `updateNote`:** patch field `note`.
- **Hàm `streamClipDownload(snapshotId, res)`** — tính năng nổi bật: tải MP4 **chỉ đúng đoạn clip** mà KHÔNG cần re-encode:
  - Validate `type==='clip'` và có `startTime`/`endTime`.
  - Tra `Media` cha để lấy `s3Key`, tạo presigned GET 300s (ffmpeg tải trực tiếp từ URL này, không qua tay Node — tiết kiệm băng thông server).
  - `ffmpeg(videoUrl).seekInput(startTime).duration(endTime-startTime)` với `outputOptions(['-c copy', '-movflags frag_keyframe+empty_moov', '-f mp4'])`:
    - `-c copy`: copy stream không re-encode → cực nhanh, không tốn CPU.
    - `-movflags frag_keyframe+empty_moov`: cho phép MP4 output dạng **fragmented** để có thể `.pipe(res)` trực tiếp ra HTTP response (MP4 thường cần biết trước tổng độ dài file để ghi `moov atom` ở đầu file — fragmented MP4 giải quyết vấn đề streaming này).
  - `.pipe(res, {end:true})` — stream trực tiếp, không lưu file tạm trên đĩa server.
- **Hàm `proxyImage(snapshotId, res)`:** GetObject từ S3 rồi `Body.pipe(res)` — dùng khi frontend cần load ảnh qua backend (same-origin) để tránh vấn đề CORS khi vẽ canvas (burn bbox, export PNG...).
- **Hàm `streamFrameAt(snapshotId, time, res)`:** tương tự `extractFrameFromVideo` nhưng stream thẳng ra response thay vì lưu S3 — dùng cho tính năng xem/tải 1 frame tùy ý theo thời gian mà không tạo thêm snapshot record.
- **Điểm đáng chú ý:** Đây là module duy nhất dùng FFmpeg ở 3 chỗ khác nhau (extract frame lúc tạo, stream clip, frame-at-time) — cho thấy backend đảm nhiệm luôn vai trò xử lý video nhẹ, không cần thêm microservice riêng cho việc này.

### `backend/src/modules/snapshots/snapshot.worker.js`
- **Chức năng chính:** Bull worker xử lý job `snapshot-analysis` — phân biệt rõ cách gọi YOLO cho **photo** (predict tĩnh) và **clip** (track theo khoảng thời gian trong video gốc).
- **Chi tiết xử lý (`snapshotAnalysisQueue.process(async (job) => {...})`)**:
  1. Destructure `{snapshotId, userId, model='yolov8n', confidence=0.3}` từ `job.data`.
  2. Tìm `Snapshot`; không tồn tại → throw.
  3. **Phân nhánh theo `snap.type`:**
     - **`photo`**: tạo presigned GET cho `snap.imageS3Key` (chính ảnh PNG đã chụp), `mimeType='image/png'` cố định. Không set `startTime`/`endTime`.
     - **`clip`**: tra `Media` cha (`snap.parentMediaId`) để lấy `s3Key` GỐC của video (không phải thumbnail!) — nghĩa là YOLO sẽ phân tích **video đầy đủ nhưng chỉ trong đoạn `[startTime, endTime]`** truyền qua request, chứ không phải xử lý cả video từ đầu đến cuối. `mimeType = parent.mimeType` (mime thật của video, vd `video/mp4`). Set `startTime = snap.startTime`, `endTime = snap.endTime`.
  4. Gọi `axios.post('{YOLO_URL}/detect', {mediaUrl, mediaType, model, confidence, startTime, endTime}, {timeout: 5*60*1000})` — timeout cố định 5 phút (khác Media Worker có timeout động theo loại file) vì clip evidence luôn ngắn (thường vài giây đến vài chục giây), không cần timeout dài như video đầy đủ.
  5. Xử lý lỗi kết nối y hệt Media Worker: `ECONNREFUSED/ECONNRESET/ETIMEDOUT` → set `failed`, return êm; lỗi khác → set `failed` rồi re-throw.
  6. Thành công: lưu `aiLabels = labels`, `analysisStatus='done'`, và ghi `analysisMeta.model`, `analysisMeta.confidence`, `analysisMeta.analyzedAt = new Date()` — Snapshot có lưu lại "model+confidence đã dùng" (Media thì không lưu field này ở schema, dù cũng nhận cùng tham số).
  7. SSE push nếu có `userId`: `notifService.create(userId, 'snapshot_analysis_done', 'Evidence analysis complete', '{n} object(s) detected in evidence item.', '/trips/{snap.trip}')`.
- **Điểm đáng chú ý:**
  - Đây chính là cơ chế cho phép **"chỉ phân tích đúng đoạn clip"** thay vì cả video dài — tiết kiệm rất nhiều thời gian CPU so với chạy YOLO trên toàn bộ video rồi lọc kết quả theo thời gian. YOLO service (Python, không nằm trong phạm vi tài liệu này) nhận `startTime`/`endTime` để chỉ decode + predict các frame trong khoảng đó.
  - `snapshotAnalysisQueue` cấu hình `attempts:1, timeout:5*60*1000` (5 phút, xem `config/queue.js`) — không retry, giống triết lý của `mediaAnalysisQueue`.

---

## Bảng tổng hợp Bull Queue liên quan đến các module này

| Queue name (Bull) | File xử lý (`*.process`) | File enqueue (`*.add`) | Timeout job | Attempts |
|---|---|---|---|---|
| `media-analysis` | `media.worker.js` | `media.service.js` → `enqueueAnalysis` | 25 phút (`config/queue.js`) | 1 |
| `snapshot-analysis` | `snapshot.worker.js` | `snapshot.service.js` → `enqueueAnalysis` | 5 phút (`config/queue.js`) | 1 |

Cả 2 queue đều được khởi tạo trong `backend/src/config/queue.js` bằng `new Bull(name, redisUrl, {...})`, dùng chung Redis instance với `ai-summary` và `email` queue (khác nhau ở `defaultJobOptions`). Cả 2 worker đều gọi `notification.service.js` (`notifService.create(...)`) để đẩy SSE real-time đến đúng user khi phân tích xong — đây là điểm kết nối với module `notifications` (do nhóm khác document chi tiết).

---

## Bảng tổng hợp các route KHÔNG được mount (dead code cần lưu ý khi bảo vệ đồ án)

| File | Trạng thái | Route thực tế đang chạy nằm ở đâu |
|---|---|---|
| `backend/src/modules/dvl/dvl.routes.js` | Không `require` trong `app.js` | `backend/src/modules/trips/trip.routes.js` (dùng chung `dvl.controller.js`) |
| `backend/src/modules/sonar/sonar.routes.js` | Không `require` trong `app.js` | `backend/src/modules/trips/trip.routes.js` (dùng chung `sonar.controller.js`) |
| `backend/src/modules/sensor/sensor.routes.js` | **Không tồn tại file này** | `backend/src/modules/trips/trip.routes.js` (dùng chung `sensor.controller.js`) |

Xác nhận qua `grep` trong `app.js`: chỉ có `const tripRoutes = require('./modules/trips/trip.routes');` liên quan đến trip/sensor/dvl/sonar — không có dòng `require` nào trỏ tới `dvl.routes` hay `sonar.routes`. Nếu hội đồng hỏi vì sao có 2 file routes cho DVL/Sonar, đây là câu trả lời chính xác: đó là code cũ còn sót lại từ giai đoạn thiết kế module độc lập trước khi routes được gộp vào `trip.routes.js` để tiện quản lý chung theo `tripId`.
