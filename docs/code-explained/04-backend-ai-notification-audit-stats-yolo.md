# Giải thích mã nguồn — AI Summary, Notifications (SSE), Audit Log, Stats, YOLOv8 Microservice, Scripts hỗ trợ

Tài liệu này giải thích chi tiết các module backend liên quan đến TASK 2 (Notifications + Redis + SSE), TASK 3 (AI Project Summary + Bull Queue với Gemini 2.5 Flash), TASK 4 (Audit Log), phần Dashboard/Stats, TASK 6b (YOLOv8 microservice), và các script hỗ trợ seed/test/load-test.

---

## Tổng quan luồng AI Summary (Gemini) qua Bull Queue

Mục tiêu: khi một `Project` đã `completed`, operator/admin bấm "Generate Summary" trên `ProjectDetailPage`. Vì gọi Gemini API có thể mất 5-15 giây, hệ thống KHÔNG xử lý đồng bộ trong request HTTP mà đẩy việc này vào hàng đợi (Bull Queue, backed bởi Redis) để worker xử lý nền, tránh block event loop và tránh timeout HTTP.

**Luồng đầy đủ:**
1. Frontend gọi `POST /projects/:id/ai-summary` → controller (không nằm trong danh sách file đọc lần này, nhưng theo CLAUDE.md) set `project.aiSummary.status = 'pending'`, enqueue job vào `aiSummaryQueue` với `{ projectId, userId }`, trả về HTTP 202 ngay lập tức.
2. `aiSummaryQueue.process()` trong `ai.worker.js` được Bull tự động gọi khi có job mới trong queue (worker chạy trong cùng tiến trình Node — `require('../../config/queue')` dùng chung kết nối Redis).
3. Worker fetch song song (`Promise.all`): `Project.findById` (kèm `populate('rov', 'name model')`), `Trip.find({ project: projectId })` (tất cả trip thuộc project), `Media.countDocuments({ project: projectId, status: 'ready' })` (đếm số media đã upload xong).
4. Gọi `generateProjectSummary(project, trips, mediaCount)` trong `ai.service.js` → build prompt tiếng Anh (chỉ dẫn) yêu cầu Gemini trả về **cả tiếng Việt lẫn tiếng Anh** theo format có separator `===VI===` / `===EN===`.
5. Gemini trả về text thô → regex tách 2 phần `vi` và `en`.
6. Cập nhật `Project.aiSummary` trong MongoDB: `vi`, `en`, `generatedAt`, `status: 'done'`.
7. Gọi `notifService.create(...)` để tạo notification loại `ai_summary_done`, đồng thời push SSE đến đúng user (nếu đang online) — người dùng thấy summary tự cập nhật mà không cần tự F5 (frontend poll `GET /projects/:id` mỗi 3s khi `status === 'pending'` theo CLAUDE.md, và/hoặc nhận SSE để invalidate query ngay).
8. Nếu lỗi (Gemini quota hết, key sai, mạng lỗi, timeout) → `project.aiSummary.status = 'failed'`; nếu lỗi thuộc nhóm "non-retryable" (429/403/quota/API key/not configured/not found) thì worker ném lỗi có gắn cờ `noRetry = true` để Bull không lãng phí 3 lần retry cho một lỗi chắc chắn sẽ lặp lại (ví dụ hết quota Gemini free tier).

**Vị trí quan trọng:** `backend/src/config/queue.js` định nghĩa `aiSummaryQueue` dùng chung `defaultJobOptions`: `attempts: 3`, `backoff: exponential 2000ms`, `timeout: 60000ms` (60 giây/job), `removeOnComplete: 50`, `removeOnFail: 100`.

---

## Tổng quan luồng Notification realtime qua SSE

Kiến trúc: thay vì WebSocket, hệ thống dùng **Server-Sent Events (SSE)** — kết nối HTTP một chiều server → client, đơn giản hơn WebSocket, tận dụng auto-reconnect có sẵn của `EventSource` phía trình duyệt, phù hợp vì chỉ cần đẩy thông báo một chiều (không cần client gửi ngược lại qua cùng kênh).

**Cơ chế lưu kết nối (in-memory, không cần Redis pub/sub vì chỉ chạy 1 instance Node):**
- `notification.service.js` giữ một `Map<userId(string), res>` tên `sseClients` ở scope module (tồn tại suốt vòng đời process, không cần persist).
- Khi client mở kết nối `GET /notifications/stream`, controller gọi `notifService.registerSSE(userId, res)` — nếu user đã có 1 kết nối cũ (ví dụ mở 2 tab), kết nối cũ bị `res.end()` đóng lại trước khi lưu kết nối mới → đảm bảo **mỗi user chỉ có tối đa 1 SSE connection active tại một thời điểm** (nhất quán nhưng đồng nghĩa mở tab 2 sẽ ngắt tab 1).
- Khi kết nối đóng (client rời trang, mất mạng...), `unregisterSSE(userId)` được gọi để dọn Map, tránh leak.
- `pushSSE(userId, data)`: tra `Map` theo `userId`, nếu tồn tại và còn `writable` thì `res.write('data: ' + JSON.stringify(data) + '\n\n')` (đúng format SSE — mỗi message kết thúc bằng 2 ký tự xuống dòng); nếu kết nối đã đóng thì tự dọn luôn.

**Xác thực đặc biệt cho SSE:** `EventSource` trình duyệt không cho set custom header `Authorization`, nên endpoint `stream` (route `GET /notifications/stream`, KHÔNG có middleware `authenticate` gắn sẵn trong route — xác thực được xử lý thủ công bên trong controller) đọc JWT từ **query string** `?token=...`, tự `jwt.verify` bằng `JWT_SECRET`, load `User` từ DB (loại bỏ password/refreshToken), kiểm tra `isActive`, rồi gán `req.user` thủ công. Nếu không có token hoặc token sai/user bị khóa → trả `401`.

**Giữ kết nối sống:** sau khi set header `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, gọi `res.flushHeaders()` để đẩy header ngay (không đợi buffer), gửi ngay 1 event `{type: 'connected'}` để client biết đã kết nối thành công. Sau đó `setInterval` mỗi 30 giây gửi comment ping `: ping\n\n` (dòng bắt đầu bằng `:` là comment trong spec SSE, client bỏ qua nhưng giữ kết nối sống, tránh timeout do reverse proxy/nginx/load balancer).

**Tạo notification:** `notifService.create(userId, type, title, body, link)` — lưu vào MongoDB (`Notification.create`) TRƯỚC, sau đó `pushSSE` với payload `{ type: 'notification', data: notification }`. Vì lưu DB luôn xảy ra bất kể user có đang online hay không, khi user login lại/reload trang, `GET /notifications` vẫn trả đúng dữ liệu lịch sử (không mất thông báo khi offline).

**REST API còn lại:**
- `GET /notifications?limit=&unreadOnly=` — trả `{ notifications, unreadCount }` (2 query chạy song song `Promise.all`).
- `PATCH /notifications/:id/read` — đánh dấu 1 thông báo đã đọc, chỉ tác động đến bản ghi thuộc đúng `userId` (an toàn IDOR).
- `PATCH /notifications/read-all` — đánh dấu tất cả `isRead: false` của user thành `true` bằng `updateMany`.

**Liên hệ Redis blacklist (TASK 2a):** không nằm trong các file notification đọc ở đây, nhưng `backend/src/middleware/auth.middleware.js` có kiểm tra `redis.get('blacklist:' + token)` trước khi chấp nhận access token — đây là cơ chế riêng cho logout security, độc lập với SSE nhưng cùng nằm trong TASK 2 và cùng dùng Redis (SSE dùng Map in-memory, không dùng Redis).

---

## Tổng quan YOLOv8 microservice — kiến trúc và luồng xử lý ảnh/video

`yolo-service/main.py` là một **FastAPI microservice độc lập bằng Python**, tách khỏi Node.js backend, giao tiếp qua HTTP nội bộ (`YOLO_SERVICE_URL`). Backend Node (Bull worker của `media-analysis` / `snapshot-analysis` queue, không nằm trong file được đọc lần này) gọi `POST /detect` với `mediaUrl` (presigned S3 URL) + `mediaType` + `model` + `confidence` (+ `startTime`/`endTime` cho clip).

### Load model động — `MODEL_META` và cache
- `MODEL_META` là dict cứng khai báo metadata hiển thị cho từng model: `label` (tên hiển thị UI), `speed` (`fast`/`slow`), `warning` (cảnh báo nếu model nặng, ví dụ `f4k_single_m`, `deepfish_multi_m` là YOLOv8m — chậm hơn 2-3 lần trên CPU so với YOLOv8n).
- `get_model(name)`: tra cache `_model_cache: dict[str, YOLO]` theo tên; nếu chưa load, tìm file `{name}.pt` trong `BASE_DIR` (thư mục chứa `main.py`), nếu không tồn tại → `404`; nếu có → `YOLO(str(pt_path))` load model rồi cache lại (tránh phải load lại từ đĩa mỗi request — load model mất thời gian đáng kể).
- Ngay khi module load (`get_model("yolov8n")` gọi ở top-level), model mặc định `yolov8n` được preload luôn để request đầu tiên không bị delay cold-start.
- **Quy ước thêm model mới:** chỉ cần thả file `.pt` vào thư mục `yolo-service/` và (tùy chọn) thêm entry vào `MODEL_META` — không cần sửa code. Model không có trong `MODEL_META` vẫn hoạt động, chỉ là hiển thị `label = filename, speed = "unknown", warning = None`.

### Endpoint `GET /models`
Quét toàn bộ file `*.pt` trong `BASE_DIR` bằng `Path.glob`, với mỗi file lấy `stem` (tên không đuôi) làm `name`, tra `MODEL_META` (fallback nếu thiếu), trả về `{ models: [{name, label, speed, warning}, ...] }`. Đây là API mà frontend `AIAnalyzePopover` gọi để hiển thị danh sách model khả dụng (chỉ hiện model có file `.pt` thật sự tồn tại, đúng như checklist TASK 6b-4 ghi "N/A: /models chỉ trả về model có file thực").

### Endpoint `GET /health`
Trả `{ status: "ok", models: [...] }` — dùng để kiểm tra service còn sống (health check), liệt kê luôn tên các model có sẵn (không kèm metadata).

### Endpoint `POST /detect` — luồng chính
1. Nhận `DetectRequest` (Pydantic model): `mediaUrl`, `mediaType` (default `image/jpeg`), `confidence` (default `0.3`), `model` (default `"yolov8n"`), `startTime`/`endTime` (Optional, dùng cho clip snapshot).
2. `get_model(req.model)` — load hoặc lấy từ cache; nếu file không tồn tại → `404`.
3. Tải file media về bằng `requests.get(mediaUrl, timeout=60)` — nếu lỗi mạng/HTTP → trả `400` kèm chi tiết lỗi.
4. Ghi tạm ra `tempfile.NamedTemporaryFile` (đuôi `.mp4` nếu là video theo `mediaType.startswith("video/")`, ngược lại `.jpg`).
5. Rẽ nhánh: `_detect_video(...)` nếu là video, `_detect_image(...)` nếu là ảnh.
6. Luôn `finally: os.unlink(tmp_path)` để dọn file tạm dù thành công hay lỗi (tránh đầy disk khi xử lý nhiều video).
7. Trả về danh sách detection (`labels`) là JSON array thuần (không bọc thêm object) — mỗi phần tử `{ name, confidence, bbox, frameTime?, trackId? }`.

### `_detect_image(path, m, conf)` — xử lý ảnh
- `m.predict(path, conf=conf, iou=0.3)` — chạy YOLO inference 1 lần.
- Với mỗi box detect được: chuẩn hóa bbox về tỉ lệ 0-1 (`x/w`, `y/h`) để frontend vẽ overlay không phụ thuộc kích thước ảnh gốc.
- Dùng `dict` `detections` keyed theo `name` (tên class) để **chỉ giữ 1 detection có confidence cao nhất mỗi class** (vì ảnh tĩnh, không cần theo dõi nhiều instance cùng loại theo thời gian).
- Sort giảm dần theo confidence, cắt top 20.
- Áp thêm `_cross_class_nms` trước khi trả về.

### `_iou(a, b)` và `_cross_class_nms(dets, iou_thresh=0.3)` — khử trùng lặp cross-class
- `_iou`: tính Intersection-over-Union giữa 2 bbox (tọa độ đã chuẩn hóa 0-1).
- `_cross_class_nms`: sắp xếp detections theo confidence giảm dần, duyệt tuần tự — nếu bbox của detection hiện tại overlap (IoU > 0.3) với bất kỳ detection nào **đã giữ lại** (dù khác class), thì bỏ qua nó. Đây là NMS (Non-Max Suppression) **xuyên class**, khác với NMS mặc định của YOLO (chỉ áp dụng trong cùng 1 class) — cần thiết vì model có thể detect cùng 1 vật thể là 2 class khác nhau (confuse) chồng lấn nhau, cross-class NMS loại bỏ detection yếu hơn.

### `_pick_interval(duration_sec)` — Adaptive sample interval
```python
< 30s   → 0.2s
30-180s → 0.5s
>= 180s → 1.0s
```
Video càng dài, sample càng thưa để tránh xử lý quá nhiều frame (giới hạn thời gian xử lý và tránh OOM trên CPU-only VPS).

### `_detect_video(path, m, conf, start_time, end_time)` — xử lý video với tracking
1. Mở video bằng `cv2.VideoCapture`, lấy `fps` (fallback 25 nếu đọc lỗi) và `total_frames` → tính `duration`.
2. `seg_duration` = đoạn thực sự cần xử lý (`end_time - start_time`, hoặc cả video nếu không truyền range) → dùng để chọn `sample_interval` qua `_pick_interval`, quy đổi ra `frame_interval` (số frame giữa 2 lần sample, tối thiểu 1).
3. Nếu có `start_time` (dùng khi phân tích **clip evidence** — chỉ xử lý đoạn `[startTime, endTime]` của video gốc thay vì toàn bộ): `cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)` để seek thẳng tới, tránh đọc tuần tự từ đầu.
4. Vòng lặp đọc frame tuần tự (`cap.read()`); nếu vượt `end_time` → dừng sớm.
5. Chỉ mỗi `frame_interval` frame mới chạy inference (không predict mọi frame).
6. Dùng `m.track(frame, conf=conf, iou=0.3, persist=not is_first, tracker="bytetrack.yaml")` thay vì `predict` — ByteTrack là thuật toán multi-object tracking gán `trackId` ổn định xuyên nhiều frame cho cùng 1 vật thể (để frontend có thể "theo dõi" bbox di chuyển theo track, và cho phép TASK 6b-2 filter theo `frameTime` gần nhất khi video đang phát).
7. `persist=not is_first`: frame đầu tiên gọi với `persist=False` để **reset trạng thái tracker** (đảm bảo mỗi lần gọi `/detect` là một tracking session mới, không rò rỉ track ID từ lần track trước đó trong cùng model instance); các frame sau `persist=True` để tracker nhớ trạng thái track liên tục.
8. Với mỗi box: lấy `name`, `confidence`, `frameTime` (giây thực trong video gốc = `frame_idx/fps`, **không reset về 0 khi có `startTime`** — đúng yêu cầu CLAUDE.md để timestamp vẫn đúng theo video gốc), `trackId` (từ `box.id`, có thể `None` nếu tracker chưa gán được).
9. Mỗi frame áp `_cross_class_nms` riêng (khử chồng lấn trong cùng frame) rồi `detections.extend(...)` — **khác với ảnh, video KHÔNG dedup theo class** mà giữ **tất cả** detections theo từng frame/thời điểm (đúng thiết kế TASK 6b-2 — cho phép bbox "di chuyển" theo thời gian phát video thay vì chỉ 1 detection tĩnh mỗi class).
10. `cap.release()` giải phóng tài nguyên OpenCV, trả về list.

### Điểm đáng chú ý (YOLO service)
- Không có logic ghi log FPS/benchmark trong file hiện tại — phần "YOLO Performance Benchmark" trong CLAUDE.md (mục 5 Testing Plan) được ghi là "CẦN VIẾT THÊM CODE", tức đến thời điểm đọc file này, `main.py` chưa có đoạn `logger.info(f"YOLO... FPS")`.
- Response của `/detect` là **list thuần**, không có field `processingMs`/`fps` như CLAUDE.md dự kiến thêm — nghĩa là phần benchmark logging chưa được implement.
- `requests.get(..., timeout=60)` — nếu presigned URL S3 hết hạn hoặc mạng chậm, timeout sau 60s và trả lỗi 400 (không phải 500), giúp Bull worker phân biệt lỗi input với lỗi hệ thống.
- Không giới hạn kích thước file tải về — với video rất lớn có thể gây tốn RAM tạm thời (rủi ro tiềm ẩn, không phải bug nhưng đáng lưu ý khi bảo vệ).

---

## Tổng quan các script hỗ trợ (seed, test, load-test) — mục đích từng script, cách chạy

Tất cả scripts nằm trong `backend/src/scripts/`, chạy bằng `node src/scripts/<file>.js` từ thư mục `backend/`. Tất cả đều tự nạp biến môi trường bằng `dotenv.config({ path: ... resolve(__dirname, '../../.env') })` để không phụ thuộc thư mục hiện hành khi chạy.

| Script | Mục đích | Cách chạy | Yêu cầu |
|---|---|---|---|
| `seed.js` | Seed tối thiểu 3 user test (admin/operator/viewer) | `node src/scripts/seed.js` | Kết nối MongoDB |
| `seed-sensor.js` | Sinh file CSV mẫu để test upload sensor data thủ công qua UI | `node src/scripts/seed-sensor.js` | Không cần DB, chỉ ghi file |
| `seed-full.js` | Seed dữ liệu giả đầy đủ: users, ROVs, projects, trips, sensor data, DVL data, notifications | `node src/scripts/seed-full.js` (hoặc `--reset` để xóa sạch trước khi seed) | Kết nối MongoDB |
| `functional-test.js` | Test tự động API: auth, RBAC, validation, CRUD, pagination | `node src/scripts/functional-test.js` | Backend chạy ở `localhost:5000`, đã seed data |
| `load-test.js` | Load test đơn giản không cần cài thêm thư viện — đo avg/p50/p95/p99/max cho từng endpoint | `node src/scripts/load-test.js` | Backend đang chạy |
| `get-token.js` | Lấy JWT access token thủ công để dán vào `artillery.yml` | `node src/scripts/get-token.js` | Backend đang chạy |
| `run-artillery.js` | Tự động lấy token mới, patch vào `artillery.yml`, rồi chạy Artillery — không cần copy/paste tay | `node src/scripts/run-artillery.js` | Backend đang chạy, đã cài `artillery` global |

---

## Chi tiết từng file

### `backend/src/modules/ai/ai.service.js`
- **Chức năng chính:** Gọi Google Gemini 2.5 Flash để sinh tóm tắt vận hành (operational summary) song ngữ Việt-Anh cho một Project, dựa trên metadata project + danh sách trip + số lượng media.
- **Các hàm/export quan trọng:**
  - `getModel()`: lazy-singleton, chỉ khởi tạo `GoogleGenerativeAI` client 1 lần (biến module-level `_model`). Đọc `GEMINI_API_KEY` từ env, nếu thiếu → ném lỗi `'GEMINI_API_KEY not configured'` ngay (lỗi này match với `isNonRetryable` trong worker qua chuỗi `'not configured'`). Model cố định `'gemini-2.5-flash'`.
  - `generateProjectSummary(project, trips = [], mediaCount = 0)`: hàm chính, async.
    - **Xây dựng `tripLines`**: với mỗi trip, format 1 dòng gồm `title`, `[status]`, location (nếu trip có `locationName`, chỉ lấy phần đầu trước dấu phẩy — ví dụ "Bán đảo Sơn Trà" thay vì cả chuỗi địa chỉ đầy đủ, để prompt gọn), và `description` nếu có.
    - **Prompt gửi Gemini** gồm:
      - Role: "summarizing an underwater ROV trip project for an operations report"
      - Project details: `name`, `location` (ưu tiên `locationName`, fallback `location`, rồi "Not specified"), `startTime`/`endTime` (format bằng `toLocaleString()`), `status`, `description` (chỉ thêm dòng này nếu có).
      - Danh sách trip đã hoàn thành: `${trips.length} total` + `tripLines` (hoặc "No trips recorded" nếu rỗng).
      - `Media recorded: ${mediaCount} file(s)`.
      - Yêu cầu: viết 2-3 đoạn, chuyên nghiệp, factual, không markdown/bullet, plain text.
      - **Bắt buộc format output**: `===VI===\n<tiếng Việt>\n===EN===\n<tiếng Anh>` — dùng separator cứng để parse ngược lại chắc chắn (tránh phải gọi Gemini 2 lần cho 2 ngôn ngữ, tiết kiệm quota/latency).
    - **Gọi API với timeout thủ công**: `Promise.race([model.generateContent(prompt), timeout 45000ms])` — vì SDK Gemini không có timeout config trực tiếp dễ dùng, nên tự dựng race với 1 Promise reject sau 45s để tránh job treo vô hạn nếu Gemini không phản hồi (lưu ý: Bull job timeout ở tầng queue là 60s, nên timeout nội bộ 45s ở đây sẽ kích hoạt trước và trả lỗi có message rõ ràng hơn).
    - **Parse response**: `result.response.text()` lấy raw text; nếu rỗng → ném lỗi. Dùng regex `/===VI===\s*([\s\S]*?)(?:===EN===|$)/` và `/===EN===\s*([\s\S]*?)$/` để tách 2 phần, `trim()` mỗi phần. Nếu thiếu 1 trong 2 phần → ném lỗi kèm 200 ký tự đầu của raw response để debug.
    - **Xử lý lỗi HTTP status**: đọc `err.status ?? err.statusCode ?? err.response?.status`; `429` → ném lỗi có prefix `'429: Gemini rate limit exceeded'`; `403` → `'API key invalid or quota exhausted'`; `>=500` → `'Gemini server error (status)'`; còn lại ném nguyên lỗi gốc.
  - Export: `{ generateProjectSummary }`.
- **Luồng dữ liệu / kết nối với file khác:** Được `ai.worker.js` gọi trực tiếp sau khi worker đã fetch `project` (kèm populate `rov`), `trips`, `mediaCount` từ MongoDB. Không tự truy vấn DB — chỉ nhận dữ liệu đã chuẩn bị sẵn (single responsibility: service này chỉ lo phần gọi AI + parse).
- **Điểm đáng chú ý:** Không cache kết quả Gemini theo input — mỗi lần gọi lại (regenerate) sẽ tính phí/quota mới. Timeout kép (45s nội bộ + 60s Bull) là lớp bảo vệ 2 tầng chống job treo.

---

### `backend/src/modules/ai/ai.worker.js`
- **Chức năng chính:** Bull worker (consumer) lắng nghe queue `ai-summary`, thực thi việc gọi AI service, ghi kết quả vào `Project.aiSummary`, và bắn notification khi xong.
- **Các hàm/export quan trọng:**
  - `isNonRetryable(err)`: helper phân loại lỗi có nên retry hay không. Trả `true` nếu `err.status`/`err.statusCode` là `429`/`403`, hoặc message chứa `'429'`, `'quota'`, `'API key'`, `'not configured'`, `'not found'`. Các lỗi này chắc chắn sẽ lặp lại y hệt ở lần retry sau (do cấu hình sai hoặc hết quota), nên không đáng để Bull retry 3 lần (tốn thời gian chờ exponential backoff vô ích).
  - `aiSummaryQueue.process(async (job) => {...})`: đăng ký hàm xử lý cho mọi job trong queue `ai-summary` (đây chính là "worker" — Bull tự động gọi hàm này khi có job mới, không cần polling thủ công).
    - Destructure `{ projectId, userId }` từ `job.data` (được backend controller enqueue trước đó khi user bấm "Generate Summary").
    - `Promise.all` 3 truy vấn song song:
      - `Project.findById(projectId).populate('rov', 'name model')` — chỉ populate 2 field cần cho prompt.
      - `Trip.find({ project: projectId })` — toàn bộ trip (kể cả mọi status, không lọc).
      - `Media.countDocuments({ project: projectId, status: 'ready' })` — chỉ đếm media đã upload xong (không tính pending/failed).
    - Nếu `project` không tồn tại (bị xóa giữa lúc enqueue và lúc worker chạy) → ném lỗi ngay `Project ${projectId} not found` (lỗi này sẽ match `'not found'` trong `isNonRetryable`).
    - Try block: gọi `generateProjectSummary`, rồi `Project.findByIdAndUpdate` set 4 field: `aiSummary.vi`, `aiSummary.en`, `aiSummary.generatedAt` (`new Date()`), `aiSummary.status = 'done'`.
    - Gọi `notifService.create(userId, 'ai_summary_done', title, body, link)` — `link` trỏ về `/projects/${projectId}` để frontend click notification điều hướng đúng trang. Có `.catch(() => {})` — lỗi tạo notification (ví dụ Mongo tạm lỗi) **không** làm fail toàn bộ job AI summary (đã lưu summary thành công là quan trọng nhất).
    - Catch block: log lỗi ra console, set `aiSummary.status = 'failed'` trong DB (để frontend biết và có thể hiện nút "Retry"/"Regenerate"). Nếu lỗi thuộc nhóm non-retryable → tạo `Error` mới gắn `noRetry = true` rồi throw (Bull vẫn thấy job fail, nhưng code gắn cờ này có thể được dùng ở tầng khác để không retry — lưu ý: về mặt kỹ thuật Bull xử lý `attempts` dựa theo cấu hình queue, cờ `noRetry` ở đây đóng vai trò đánh dấu ngữ nghĩa/log, phối hợp với cấu hình `attempts: 3` mặc định của toàn bộ queue).
  - Cuối file: `console.log('[Worker] ai-summary queue ready')` — log xác nhận worker đã đăng ký thành công khi server khởi động.
- **Luồng dữ liệu / kết nối với file khác:**
  - Import `aiSummaryQueue` từ `../../config/queue` (Bull instance dùng chung Redis connection).
  - Import `generateProjectSummary` từ `./ai.service`.
  - Import trực tiếp models `Project`, `Trip`, `Media` (không qua service layer riêng — worker đóng vai trò như một "controller" cho background job).
  - Import `notification.service` để push kết quả real-time qua SSE.
- **Điểm đáng chú ý:**
  - Bull queue config (từ `config/queue.js`): `attempts: 3`, `backoff: exponential, delay 2000ms`, `timeout: 60000ms`, `removeOnComplete: 50`, `removeOnFail: 100`.
  - Không có transaction — nếu update `aiSummary.status = 'done'` thành công nhưng notification lỗi, project vẫn ở trạng thái đúng (done), chỉ là user không được thông báo ngay (chấp nhận được, vì poll `GET /projects/:id` mỗi 3s vẫn phát hiện được theo CLAUDE.md).
  - Không giới hạn concurrency worker rõ ràng trong file này (Bull mặc định xử lý tuần tự trừ khi gọi `.process(concurrency, handler)` — ở đây gọi `.process(handler)` không truyền concurrency, nên mặc định là 1 job cùng lúc cho queue này trong tiến trình này).

---

### `backend/src/modules/notifications/notification.controller.js`
- **Chức năng chính:** Xử lý HTTP layer cho notification — bao gồm endpoint SSE streaming đặc biệt (`stream`) và 3 endpoint REST thông thường (`list`, `markRead`, `markAllRead`).
- **Các hàm/export quan trọng:**
  - `stream(req, res)`:
    - Vì `EventSource` (Web API) không hỗ trợ set header `Authorization`, route này **không** dùng middleware `authenticate` chuẩn; thay vào đó tự kiểm tra `req.user` (nếu middleware khác đã gán — thực tế route định nghĩa không có `authenticate` nên `req.user` luôn `undefined` lúc vào) rồi đọc `req.query.token`.
    - Verify token bằng `jwt.verify(token, process.env.JWT_SECRET)` (JWT_SECRET, không phải JWT_REFRESH_SECRET — đây là access token).
    - Load `User.findById(decoded.id).select('-password -refreshToken')`; kiểm tra tồn tại và `isActive`; nếu không hợp lệ → `401` và kết thúc response bằng `res.end()`.
    - Set 3 header SSE chuẩn + `res.flushHeaders()` để browser nhận header ngay (không đợi buffer đầy).
    - Gửi event đầu tiên `{ type: 'connected' }` để xác nhận bắt tay thành công (frontend `useSSE.js` có thể dùng để set trạng thái "connected").
    - Đăng ký kết nối vào Map qua `notifService.registerSSE(userId, res)`.
    - Định nghĩa `cleanup()` dọn `keepalive` interval + gọi `unregisterSSE`.
    - `keepalive` — `setInterval` mỗi 30000ms gửi comment ping (`: ping\n\n`); nếu `res` đã `writableEnded`/`destroyed` thì tự cleanup thay vì tiếp tục ghi (tránh lỗi ghi vào stream đã đóng).
    - Lắng nghe sự kiện đóng kết nối: `req.on('close', cleanup)` và `res.on('error', cleanup)` — đảm bảo dọn dẹp dù client đóng tab hay lỗi network.
  - `list(req, res, next)`: đọc query `limit`, `unreadOnly`; gọi song song `notifService.getForUser` và `notifService.countUnread`; trả `success(res, { notifications, unreadCount })`.
  - `markRead(req, res, next)`: gọi `notifService.markRead(id, userId)`; nếu không tìm thấy (notification không tồn tại hoặc không thuộc user) → `404` (dùng `res.status(404).json(...)` trực tiếp thay vì `success()` — ngoại lệ so với convention chung, có thể là điểm để hội đồng hỏi).
  - `markAllRead(req, res, next)`: gọi `notifService.markAllRead`, trả message "All notifications marked as read".
- **Luồng dữ liệu / kết nối với file khác:** Dùng `notification.service.js` cho toàn bộ business logic (không truy vấn Mongoose trực tiếp trong controller — tuân thủ convention "controller không chứa business logic"), trừ việc query `User` model để xác thực JWT thủ công trong `stream`.
- **Điểm đáng chú ý:** Route `stream` không cần Bearer token qua header — đây là ngoại lệ bảo mật cần thiết vì giới hạn kỹ thuật của `EventSource`; token vẫn được verify đầy đủ qua query param nên vẫn an toàn (không bypass auth, chỉ đổi kênh truyền token).

---

### `backend/src/modules/notifications/notification.model.js`
- **Chức năng chính:** Định nghĩa Mongoose schema cho collection `notifications`.
- **Cấu trúc field:**
  - `userId`: ObjectId ref `User`, required, có index riêng lẻ.
  - `type`: String required — giá trị ví dụ thấy trong code: `ai_summary_done` (từ `ai.worker.js`), và các loại khác theo CLAUDE.md như `trip_done`, `trip_failed`.
  - `title`, `body` (default rỗng), `link` (default rỗng — dùng cho điều hướng khi click).
  - `isRead`: Boolean default `false`.
  - `timestamps: true` → tự động có `createdAt`/`updatedAt`.
- **Index:** `{ userId: 1, isRead: 1, createdAt: -1 }` — compound index tối ưu chính xác cho truy vấn phổ biến nhất: lấy thông báo của 1 user, lọc theo đã đọc/chưa đọc, sort theo mới nhất trước (đúng như trong CLAUDE.md mục "MongoDB Indexes cần thêm").
- **Điểm đáng chú ý:** Không giới hạn độ dài `body`/`title` (không có `maxlength`), không có TTL index tự xóa thông báo cũ — thông báo tồn tại vĩnh viễn trừ khi xóa thủ công (hiện không có endpoint xóa notification, chỉ có mark-read).

---

### `backend/src/modules/notifications/notification.routes.js`
- **Chức năng chính:** Khai báo route cho module notifications.
- **Danh sách route:**
  - `GET /stream` — **không có middleware `authenticate`** (do lý do kỹ thuật EventSource nêu trên; auth được xử lý thủ công trong controller).
  - `GET /` (authenticate) → `list`.
  - `PATCH /read-all` (authenticate) → `markAllRead`.
  - `PATCH /:id/read` (authenticate) → `markRead`.
- **Điểm đáng chú ý:** Thứ tự route `read-all` được đặt **trước** `:id/read` — đúng nguyên tắc trong CLAUDE.md "route cụ thể phải đặt trước route có param động" để Express không nhầm `read-all` là 1 giá trị `:id`.

---

### `backend/src/modules/notifications/notification.service.js`
- **Chức năng chính:** Toàn bộ business logic của notification — lưu trữ SSE connections trong bộ nhớ, tạo/truy vấn/đánh dấu đã đọc notification trong MongoDB, và cơ chế push real-time.
- **Các hàm/export quan trọng:**
  - `sseClients = new Map()` (module-level, khởi tạo 1 lần khi module được require lần đầu — tồn tại theo vòng đời process Node): key là `userId` dạng string, value là đối tượng `res` (Express Response) của kết nối SSE đang mở.
  - `registerSSE(userId, res)`: nếu user đã có kết nối cũ còn mở (`existing && !existing.writableEnded`) → chủ động `existing.end()` đóng nó trước khi ghi đè bằng kết nối mới vào Map. Điều này nghĩa là **mở tab thứ 2 sẽ tự động đóng SSE của tab thứ 1** (thiết kế đơn giản hóa: 1 user = 1 SSE connection).
  - `unregisterSSE(userId)`: `sseClients.delete(userId)`.
  - `pushSSE(userId, data)`: tra Map; nếu không tồn tại hoặc `writableEnded`/`destroyed` → xóa entry stale rồi return im lặng (không lỗi — user offline thì bỏ qua, notification vẫn đã lưu DB). Nếu còn sống → `client.write(...)`; bọc trong `try/catch`, nếu ghi lỗi (ví dụ socket đã reset) thì cũng xóa khỏi Map.
  - `create(userId, type, title, body = '', link = '')`: `Notification.create(...)` lưu DB trước, sau đó `pushSSE(userId, { type: 'notification', data: notification })`. Trả về document vừa tạo (Promise).
  - `getForUser(userId, { limit = 20, unreadOnly = false })`: build query `{ userId }` (+ `isRead: false` nếu `unreadOnly`), `.sort({ createdAt: -1 }).limit(Number(limit))`.
  - `countUnread(userId)`: `Notification.countDocuments({ userId, isRead: false })`.
  - `markRead(id, userId)`: `findOneAndUpdate({ _id: id, userId }, { isRead: true }, { new: true })` — filter kèm `userId` để tránh user A đánh dấu đọc thông báo của user B (IDOR protection).
  - `markAllRead(userId)`: `updateMany({ userId, isRead: false }, { isRead: true })`.
  - Export: `{ create, getForUser, countUnread, markRead, markAllRead, registerSSE, unregisterSSE }` — chú ý `pushSSE` **không** được export (chỉ dùng nội bộ trong `create`), các module khác (như `ai.worker.js`) chỉ gọi `create()` chứ không tự push SSE trực tiếp.
- **Luồng dữ liệu / kết nối với file khác:** Được gọi từ `notification.controller.js` (REST + SSE endpoint) và từ `ai.worker.js` (tạo notification khi AI summary xong). Theo CLAUDE.md, các nơi khác cũng gọi `create()` tương tự: trip status đổi thành done/failed, project completed, admin bulk-disable user.
- **Điểm đáng chú ý:**
  - **Giới hạn kiến trúc quan trọng:** vì `sseClients` là in-memory Map, giải pháp này **chỉ hoạt động đúng khi chạy 1 instance Node duy nhất**. Nếu scale ngang (nhiều instance backend đứng sau load balancer), user kết nối SSE vào instance A nhưng notification được tạo bởi request xử lý ở instance B sẽ không push được (cần Redis Pub/Sub để broadcast giữa các instance) — đây là điểm CLAUDE.md ghi rõ "đủ cho single instance", và kiến trúc deployment (VPS Contabo, 1 `docker compose up`) khớp với giả định này.
  - Không có giới hạn số lượng notification lưu trữ (không TTL, không cap), có thể phình collection theo thời gian nếu không dọn định kỳ.

---

### `backend/src/modules/audit/audit.controller.js`
- **Chức năng chính:** Expose duy nhất 1 endpoint đọc audit log (chỉ admin), có xử lý làm mới URL avatar (presigned S3) trước khi trả về.
- **Các hàm/export quan trọng:**
  - `getAll(req, res, next)`:
    - Gọi `auditService.getAll(req.query)` lấy `{ data, total, page, totalPages }`.
    - Với mỗi log, `Promise.all(map(...))`: convert Mongoose document sang plain object (`toObject()` nếu có), nếu `userId.avatar` tồn tại (đã được `populate` trong service) thì gọi `freshenAvatar(...)` để refresh presigned URL avatar (avatar S3 URL có thời hạn, cần regenerate mỗi lần trả về để tránh link hết hạn hiển thị vỡ ảnh).
    - Trả `success(res, { ...result, data })` — giữ nguyên `total/page/totalPages`, chỉ thay `data` bằng mảng đã xử lý avatar.
- **Luồng dữ liệu / kết nối với file khác:** Dùng `audit.service.js` cho query logic, dùng `utils/avatar.util.js` (`freshenAvatar`) — file này không nằm trong danh sách đọc nhưng được import và dùng trực tiếp.
- **Điểm đáng chú ý:** Đây là ví dụ về nơi controller có thêm 1 bước xử lý hậu kỳ (post-processing) ngoài gọi service thuần túy — vẫn tuân thủ nguyên tắc chung nhưng có ngoại lệ nhỏ cho vấn đề avatar URL. Route bảo vệ bằng `authorize('admin')` — đúng RBAC "Xem audit log: chỉ admin" trong CLAUDE.md.

---

### `backend/src/modules/audit/audit.model.js`
- **Chức năng chính:** Schema Mongoose cho collection `auditlogs`.
- **Cấu trúc field:**
  - `userId`: ObjectId ref `User`, required — người thực hiện hành động.
  - `action`: String required — ví dụ "Deleted ROV", "Updated role", theo CLAUDE.md.
  - `entity`: String required — loại đối tượng bị tác động (ví dụ "Project", "ROV", "User").
  - `entityId`: ObjectId, default `null` — id của đối tượng cụ thể.
  - `details`: `Mixed`, default `{}` — dữ liệu tự do (ví dụ email user bị đổi role, giá trị role cũ/mới).
  - `timestamps: true`.
- **Index:** 3 index riêng biệt: `{ createdAt: -1 }` (sort mặc định toàn bộ log), `{ entity: 1, createdAt: -1 }` (filter theo loại entity), `{ userId: 1, createdAt: -1 }` (filter theo người thực hiện) — tối ưu cho các kiểu truy vấn khác nhau mà `getAll` hỗ trợ (`entity`, `userId`).
- **Điểm đáng chú ý:** Không có index compound `{entity, userId, createdAt}` — nếu filter đồng thời cả `entity` và `userId`, MongoDB sẽ dùng 1 trong 2 index đơn rồi filter phần còn lại trong memory (chấp nhận được với quy mô dữ liệu đồ án).

---

### `backend/src/modules/audit/audit.routes.js`
- **Chức năng chính:** Khai báo route audit — chỉ 1 route.
- **Route:** `GET /` với middleware `authenticate` + `authorize('admin')` — chỉ admin mới xem được audit log, đúng RBAC.
- **Điểm đáng chú ý:** Module cực kỳ tối giản — không có route tạo/xóa log thủ công qua API (log chỉ được tạo nội bộ qua `auditService.log()` gọi từ các controller khác, không expose ra ngoài).

---

### `backend/src/modules/audit/audit.service.js`
- **Chức năng chính:** Cung cấp hàm ghi log (`log`) dùng ở khắp các module khác, và hàm truy vấn phân trang (`getAll`) cho trang audit UI.
- **Các hàm/export quan trọng:**
  - `log(userId, action, entity, entityId = null, details = {})`:
    - Guard: nếu không có `userId` → return ngay (không ghi log ẩn danh).
    - **Fire-and-forget**: gọi `AuditLog.create(...)` nhưng KHÔNG `await` trong hàm gọi (hàm `log` không phải `async`, không return Promise cho phần ghi DB) — chỉ gắn `.catch(err => console.error(...))` để bắt lỗi ngầm, không block luồng request chính đang gọi `log()`. Điều này đảm bảo việc audit log không bao giờ làm chậm hoặc làm fail thao tác nghiệp vụ chính (ví dụ xóa ROV vẫn thành công dù ghi audit log lỗi).
  - `getAll({ page = 1, limit = 20, entity, userId } = {})`:
    - Build `query` động: chỉ thêm `entity`/`userId` vào filter nếu được truyền.
    - `skip = (page - 1) * limit`.
    - `Promise.all` chạy song song: `AuditLog.find(query).populate('userId', 'fullName email avatar').sort({createdAt:-1}).skip(skip).limit(limit)` và `AuditLog.countDocuments(query)`.
    - Trả `{ data: logs, total, page: Number(page), totalPages: Math.ceil(total/limit) }` — đúng convention pagination chuẩn của dự án (field `data`/`total`/`page`/`totalPages`).
- **Luồng dữ liệu / kết nối với file khác:** `log()` được gọi (theo CLAUDE.md) từ các controller khác — tạo/xóa project, xóa ROV, đổi role, bulk operations, generate AI summary — nhưng các lời gọi đó nằm ở các module ngoài phạm vi đọc lần này. `getAll()` được `audit.controller.js` gọi.
- **Điểm đáng chú ý:** Thiết kế "fire-and-forget" là điểm quan trọng cần nhấn mạnh khi bảo vệ — nó đánh đổi độ tin cậy tuyệt đối của audit trail (có khả năng mất log nếu DB lỗi đúng lúc) để lấy hiệu năng và không ảnh hưởng UX của thao tác chính.

---

### `backend/src/modules/stats/stats.controller.js`
- **Chức năng chính:** Cung cấp 1 endpoint tổng hợp (`getOverview`) chạy nhiều MongoDB aggregation song song để dựng dữ liệu cho Dashboard (stat cards, biểu đồ donut, biểu đồ cột, activity timeline).
- **Các hàm/export quan trọng:**
  - `getOverview(req, res, next)`:
    - Tính `sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)` — mốc đầu tháng, 5 tháng trước tháng hiện tại (tổng cộng 6 tháng kể cả tháng hiện tại).
    - **7 aggregation chạy song song bằng `Promise.all`:**
      1. `Project.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])` — đếm project theo từng status.
      2. `Trip.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])` — đếm trip theo từng status.
      3. `ROV.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])` — đếm ROV theo từng status.
      4. `projectsPerMonth`: `Project.aggregate` với `$match: createdAt >= sixMonthsAgo`, `$group` theo `{year, month}` (dùng `$year`/`$month` operator), `$sort` tăng dần theo year rồi month.
      5. `tripsPerMonth`: tương tự (4) nhưng trên `Trip`.
      6. `rovUtilization`: `Project.aggregate` — `$group` theo `$rov` đếm số project mỗi ROV, `$sort` giảm dần theo count, `$limit: 8` (top 8 ROV bận rộn nhất), `$lookup` join sang collection `rovs` lấy tên, `$unwind` (giữ cả trường hợp `null` với `preserveNullAndEmptyArrays: true` — phòng khi `rov` bị xóa nhưng project vẫn còn tham chiếu id cũ), `$project` format lại `{ name: ifNull(rov.name, 'Unknown'), count }`.
      7. `mediaPerMonth`: `Media.aggregate` với `$match: { createdAt >= sixMonthsAgo, status: 'ready' }` (chỉ tính media upload thành công), `$group` theo `{year, month}`, `$sort` tăng dần.
    - **Build `monthLabels`**: vòng lặp `for i = 5 downto 0`, tạo `Date` cho từng tháng trong 6 tháng gần nhất, format label kiểu `"Jan 26"` bằng `toLocaleString('default', {month:'short', year:'2-digit'})`.
    - **Merge `activityTimeline`**: map qua `monthLabels`, với mỗi tháng tìm count tương ứng trong `projectsPerMonth`/`tripsPerMonth`/`mediaPerMonth` (so khớp theo key `"year-month"`), fallback `0` nếu tháng đó không có data → trả mảng `[{name, projects, trips, media}]` sẵn sàng cho Recharts.
    - **`toMap(arr)`**: helper chuyển mảng `[{_id, count}]` thành object `{status: count}` — dùng cho `projectByStatus`, `tripByStatus`, `rovByStatus` (dữ liệu donut chart).
    - Trả `success(res, { projectByStatus, tripByStatus, rovByStatus, activityTimeline, rovUtilization })`.
- **Luồng dữ liệu / kết nối với file khác:** Import trực tiếp 4 model (`Project`, `Trip`, `ROV`, `Media`) — không qua service layer riêng (toàn bộ logic aggregation nằm ngay trong controller, khác với các module khác có tách controller/service).
- **Điểm đáng chú ý:**
  - Đúng như CLAUDE.md ghi "Backend: 7 MongoDB aggregations song song" — đã liệt kê đủ 7 pipeline ở trên.
  - Đây là endpoint nặng nhất hệ thống theo kết quả load test trong CLAUDE.md (avg 906ms, P95 1842ms) — lý do: 7 aggregation query độc lập cùng lúc tới MongoDB Atlas free tier, mỗi cái đều phải quét toàn bộ hoặc phần lớn collection (không có `$match` giới hạn cho 3 aggregation đầu — `projectByStatus`/`tripByStatus`/`rovByStatus` group toàn bộ collection không giới hạn thời gian).
  - `rovUtilization` dùng `$lookup` (join) — đắt hơn so với group thuần, đây có thể là điểm tối ưu tương lai (ví dụ denormalize tên ROV vào Project lúc tạo, hoặc cache kết quả).

---

### `backend/src/modules/stats/stats.routes.js`
- **Chức năng chính:** Khai báo route duy nhất cho module stats.
- **Route:** `GET /overview` với middleware `authenticate` (không giới hạn role cụ thể — mọi role đã đăng nhập đều xem được Dashboard, khớp với thiết kế "ai cũng xem được thống kê tổng quan").
- **Điểm đáng chú ý:** Không có `authorize(...)` — khác với `audit.routes.js` giới hạn admin; đây là chủ đích vì Dashboard là trang chung cho mọi role.

---

### `yolo-service/main.py`
Đã giải thích chi tiết ở phần "Tổng quan YOLOv8 microservice" phía trên (bao gồm toàn bộ: `MODEL_META`, `get_model`, `/health`, `/models`, `/detect`, `_detect_image`, `_iou`, `_cross_class_nms`, `_pick_interval`, `_detect_video`). Tóm tắt vai trò file: đây là **toàn bộ logic** của microservice — không có file phụ nào khác chứa business logic (một file `main.py` duy nhất, kiến trúc đơn giản phù hợp quy mô đồ án).

---

### `yolo-service/requirements.txt`
- **Chức năng chính:** Khai báo dependency Python cho microservice.
- **Nội dung:**
  ```
  fastapi
  uvicorn[standard]
  ultralytics
  opencv-python-headless
  requests
  ```
- **Giải thích từng thư viện:**
  - `fastapi`: framework web Python, cung cấp routing + validation qua Pydantic (dùng cho `DetectRequest`).
  - `uvicorn[standard]`: ASGI server chạy FastAPI (extra `[standard]` cài thêm `uvloop`, `httptools`... để tăng hiệu năng).
  - `ultralytics`: thư viện chính thức chứa class `YOLO`, dùng để load model `.pt` và chạy `predict`/`track`.
  - `opencv-python-headless`: bản OpenCV không kèm GUI (phù hợp môi trường server/container không có display) — dùng để đọc frame video (`cv2.VideoCapture`).
  - `requests`: tải file media từ presigned S3 URL về máy tạm.
- **Điểm đáng chú ý:** Không pin version cụ thể (không có `==x.y.z`) — nghĩa là mỗi lần `pip install` có thể lấy bản mới nhất, tiềm ẩn rủi ro breaking change giữa các lần build lại image Docker (đáng lưu ý khi được hỏi về reproducibility).

---

### `yolo-service/Dockerfile`
- **Chức năng chính:** Đóng gói microservice thành Docker image để deploy trên VPS cùng `docker-compose.yml`.
- **Nội dung / từng bước:**
  1. `FROM python:3.11-slim` — base image nhẹ.
  2. `WORKDIR /app`.
  3. Cài các thư viện hệ thống cần cho OpenCV chạy được (dù dùng bản `headless`, OpenCV vẫn cần một số shared library ở tầng OS): `libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 libxcb1`, rồi dọn cache apt (`rm -rf /var/lib/apt/lists/*`) để giảm kích thước image.
  4. `COPY requirements.txt .` rồi `pip install --no-cache-dir -r requirements.txt` — tách riêng bước copy requirements trước code để tận dụng Docker layer cache (nếu code đổi nhưng requirements không đổi, không phải cài lại pip package).
  5. **Pre-download weights**: `RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"` — chạy ngay trong lúc build image để tải sẵn file `yolov8n.pt` (Ultralytics tự động download nếu chưa có), giúp container khởi động lần đầu (runtime) không phải chờ tải model từ internet — quan trọng cho production vì VPS có thể không có mạng nhanh hoặc bị giới hạn.
  6. `COPY . .` — copy toàn bộ code (bao gồm cả các file `.pt` model custom nếu có sẵn trong thư mục lúc build).
  7. `EXPOSE 8000`.
  8. `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]` — chạy server lắng nghe tất cả interface (cần thiết trong container để expose ra ngoài qua Docker network).
- **Điểm đáng chú ý:** Chỉ pre-download `yolov8n.pt` (model mặc định) — các model custom khác (`fish1`, `trash`, `f4k_single_m`...) nếu có phải được `COPY` cùng code (`COPY . .`) chứ không tự tải, nghĩa là các file `.pt` custom cần tồn tại sẵn trong thư mục `yolo-service/` trước khi build image.

---

### `backend/src/scripts/seed.js`
- **Chức năng chính:** Seed nhanh 3 tài khoản test cố định (admin/operator/viewer) — phiên bản tối giản, không tạo ROV/Project/Trip.
- **Logic:** Mảng `users` cố định 3 object `{fullName, email, password, role}`. Hàm `seed()` kết nối MongoDB, với mỗi user kiểm tra `User.findOne({email})` — nếu đã tồn tại thì `SKIP`, nếu chưa thì `User.create(u)` (password sẽ được hash tự động qua hook `pre('save')` trong `user.model.js`, không nằm trong phạm vi đọc ở đây nhưng suy luận từ cách gọi `.create` trực tiếp với password thô). Log ra console từng bước, disconnect khi xong.
- **Luồng dữ liệu:** Chỉ đụng tới `User` model, độc lập hoàn toàn với các script khác.
- **Điểm đáng chú ý:** Idempotent (chạy lại nhiều lần không tạo trùng nhờ check `findOne` trước khi tạo) — an toàn để chạy trên môi trường đã có data.

---

### `backend/src/scripts/seed-sensor.js`
- **Chức năng chính:** KHÔNG chạm vào MongoDB — chỉ sinh ra 1 file CSV mẫu (`sensor-data.csv`) ở thư mục gốc repo, dùng để test thủ công tính năng "Upload sensor data" qua giao diện web.
- **Logic chi tiết:**
  - `START = 2026-05-07T08:00:00Z`, `ROWS = 120` (2 giờ, 1 reading/phút).
  - Mô phỏng 1 lần lặn: 30 dòng đầu độ sâu tăng tuyến tính từ 0 → 50m (lặn xuống), 60 dòng giữa giữ quanh 50m ± nhiễu ngẫu nhiên nhỏ (giữ độ sâu, "hold"), 30 dòng cuối giảm dần về 0 (nổi lên).
  - `temp` giảm nhẹ theo độ sâu (nước sâu hơn thường lạnh hơn) + nhiễu ngẫu nhiên.
  - `pressure` tăng theo độ sâu theo công thức xấp xỉ tuyến tính + nhiễu.
  - **GPS chỉ ở dòng đầu tiên** (`i === 0`) — tọa độ Đà Nẵng (16.0544, 108.2022), các dòng sau để trống — đúng thiết kế "chỉ đọc dòng đầu làm GPS cố định của trip" trong CLAUDE.md TASK 5.
  - **Chèn 3 anomaly nhân tạo** tại các dòng cố định (index 20, 55, 100): cộng thêm +15 vào depth và +6 vào temp tại các dòng đó — để test tính năng Anomaly Detection (Z-Score) ở TASK 6 phát hiện đúng các điểm bất thường này.
  - Ghi file ra `path.resolve(__dirname, '../../../../sensor-data.csv')` — 4 cấp `../` từ `backend/src/scripts/` sẽ ra tới thư mục gốc của repo (`rov-management/`).
- **Điểm đáng chú ý:** Format cột đúng chuẩn `timestamp,depth,temp,pressure,lat,lng` mô tả trong CLAUDE.md phần "Format file được hỗ trợ" (dù không đủ tất cả cột optional như yaw/pitch/roll/voltage/battery/humidity — chỉ đủ 6 cột cơ bản, khác với file mẫu đầy đủ `test-data/sensor-sample-full.csv` được nhắc ở TASK 6a có 12 cột).

---

### `backend/src/scripts/seed-full.js`
- **Chức năng chính:** Script seed đầy đủ và thực tế nhất — tạo Users, ROVs, Projects, Trips, SensorData, DVLData, Notifications với dữ liệu có ý nghĩa (tên tiếng Việt, địa danh Đà Nẵng/Hội An/Cù Lao Chàm thật), phù hợp để demo/chụp ảnh báo cáo đồ án. Có cờ `--reset` để xóa sạch rồi tạo lại từ đầu.
- **Các hàm/export quan trọng (nội bộ, không export vì là script chạy trực tiếp):**
  - **Helpers:** `pick(arr)` (random 1 phần tử), `rnd(lo, hi, dec)` (random số thực trong khoảng), `daysAgo(n)` (trừ n ngày từ hiện tại), `addMs(d, ms)` (cộng mili giây vào Date).
  - **`gpsNear(anchor, radiusDeg=0.05)`**: sinh tọa độ ngẫu nhiên quanh 1 điểm neo (`DA_NANG = {16.0544, 108.2022}`) trong bán kính `radiusDeg` độ, dùng để mỗi project/trip có GPS hơi khác nhau nhưng vẫn quanh khu vực Đà Nẵng — tạo cảm giác thực tế khi hiển thị map.
  - **`genSensorReadings(tripId, count=60, startTime, sourceFile)`**: sinh mảng reading giả lập theo hàm sin — `depth` dao động theo `Math.sin(phase)` (âm, từ khoảng -2 đến -10, tức độ sâu dưới mặt nước), `temp` dao động quanh 26°C, `pressure` tỉ lệ thuận với `|depth|`. **Chèn 2 anomaly spike** tại vị trí `35%` và `72%` của chuỗi dữ liệu (nhân `depth` với 3.5 và cộng thêm 15 vào `temp`) để test Anomaly Detection. Sinh đầy đủ các field mở rộng: `yaw`, `pitch`, `roll` (dao động sin/cos với biên độ và tần số khác nhau để trông tự nhiên), `voltage` (giảm dần tuyến tính theo % tiến trình — mô phỏng pin cạn dần), `battery_percent` (giảm từ 100 xuống 75), `humidity`, `temperature` (nhiệt độ board mạch, khác với `temp` là nhiệt độ nước), `powerLevel`, `lightLevel`, `cameraTilt`.
  - **`genDVLPoints(tripId, pointCount=400, sourceFile)`**: sinh quỹ đạo hình elip (`x = cos(phase)*5`, `y = sin(phase)*3`) mô phỏng đường di chuyển ROV dưới nước, `z` (độ sâu) âm dần theo `sin(phase)`, `roll/pitch/yaw` dao động, `ts` tăng đều 0.25s/điểm (tần số 4Hz — giống DVL thật), `std` (độ lệch chuẩn đo lường) ngẫu nhiên nhỏ, `status: 0` (mã trạng thái tín hiệu tốt).
  - **`seed()` (hàm main async):**
    1. Kết nối MongoDB.
    2. Nếu có flag `--reset` (kiểm tra qua `process.argv.includes('--reset')`) → xóa sạch 7 collection: `User`, `ROV`, `Project`, `Trip`, `SensorData`, `DVLData`, `Notification` (chạy song song `Promise.all`).
    3. **Seed Users**: 4 user cố định gồm `admin@rov.local`, `operator@rov.local` (role operator), `viewer@rov.local`, và thêm `hung@rov.local` (role operator thứ 2, tên "Operator Hùng") — khác với `seed.js` chỉ có 3 user. Mỗi user check tồn tại trước khi tạo (idempotent), lưu vào object `users` để tái sử dụng reference (`users.admin`, `users.operator`, v.v., key theo phần trước `@` của email hoặc `'admin'`).
    4. **Seed ROVs**: 3 ROV với model thật (BlueROV2 Heavy, VideoRay M5, Saab Seaeye Falcon), mỗi ROV có `specs` (`maxDepth`, `thrusterCount`, `weight`) và `status` khác nhau (2 active, 1 maintenance).
    5. **Seed Projects + Trips + Data** — đây là phần lớn nhất:
       - Định nghĩa cứng `projectDefs`: mảng 4 project mẫu, mỗi project có `name`, `description` (tiếng Việt, ngữ cảnh khảo sát ROV thực tế: rạn san hô Sơn Trà, kiểm tra cảng Tiên Sa, nghiên cứu sinh vật biển Cù Lao Chàm, khảo sát xác tàu đắm), `status` (completed/ongoing/planned), `rov` (tham chiếu tới 1 trong 3 rov), `daysBack` (bao nhiêu ngày trước, có 1 project `daysBack: -3` tức là trong **tương lai** — dùng để test project `planned` sắp diễn ra), `locationName`, và mảng `trips` con (mỗi trip có `title`, `status`, `durationMin`, `hasSensor`, `hasDvl`).
       - Với mỗi project: tính `projectStart = daysAgo(pd.daysBack)`, sinh `gps = gpsNear(DA_NANG)`; check tồn tại theo `name` trước khi tạo (idempotent). Nếu tạo mới: set `startTime`/`endTime` (chỉ có `endTime` nếu `status === 'completed'`, tính bằng `projectStart + 3 ngày`), gán `aiSummary` **có sẵn** nếu project completed — đây là bản demo AI summary viết tay (không gọi Gemini thật) bao gồm cả `vi` và `en`, `generatedAt: new Date()`, `status: 'done'` — nếu chưa completed thì `aiSummary: {status: 'idle'}`. Điều này giúp demo có ngay dữ liệu AI summary mà không cần tốn quota Gemini thật.
       - Với mỗi trip trong project: tính `tripStart` lệch nhau vài giờ so với `projectStart` (mô phỏng nhiều lần lặn trong nhiều ngày của project), `tripGps` = GPS gần với GPS project (bán kính nhỏ hơn `0.01`). Check tồn tại theo `{title, project}` trước khi tạo. Set `gpsLocation`/`locationName`/`sensorCount`/`dvlCount` dựa vào cờ `hasSensor`/`hasDvl`.
       - Nếu `td.hasSensor`: sinh `sourceFile = log_${last6charsOfTripId}.csv`, gọi `genSensorReadings(trip._id, 60, tripStart, srcFile)`, `SensorData.insertMany(readings, {ordered: false})` (`ordered: false` để nếu có lỗi 1 document vẫn tiếp tục insert các document khác, không dừng cả batch).
       - Tương tự cho DVL (`dvl_${...}.json`, 400 điểm).
    6. **Seed Notifications**: 3 notification mẫu cố định (`trip_done`, `trip_failed`, `ai_done`) gán cho `users.operator`, `link: '/projects'`.
    7. In tổng kết ra console: số user/ROV/project/trip/sensor readings/DVL points đã tạo, kèm danh sách 4 việc "CẦN LÀM THỦ CÔNG" (upload media, upload sonar binary, kích hoạt Google OAuth, chạy YOLO service) — vì các phần này không thể giả lập tự động qua script (cần file thật hoặc external service).
- **Luồng dữ liệu / kết nối với file khác:** Import trực tiếp 6 model: `User`, `ROV`, `Project`, `Trip`, `SensorData`, `DVLData`, `Notification`.
- **Điểm đáng chú ý:**
  - Idempotent ở mọi cấp (user, ROV theo `serialNumber`, project theo `name`, trip theo `{title, project}`) — an toàn chạy lại nhiều lần mà không tạo trùng, **trừ khi** dùng `--reset` thì xóa sạch trước.
  - Dữ liệu anomaly được chèn ở vị trí cố định (35%, 72% cho sensor; 20/55/100 cho `seed-sensor.js`) — đảm bảo demo Anomaly Detection luôn có kết quả nhất quán, dễ tái hiện khi chấm điểm/bảo vệ.
  - KHÔNG seed Media, Sonar, AuditLog — audit log không được seed nghĩa là khi demo tính năng Audit Log (TASK 4), cần thao tác thật qua UI để sinh log (log chỉ được tạo qua `audit.service.log()` khi có hành động thật, không có sẵn trong script này).

---

### `backend/src/scripts/load-test.js`
- **Chức năng chính:** Load test đơn giản, tự viết bằng module `http`/`https` built-in của Node (không cần cài Artillery hay bất kỳ thư viện ngoài) — đo độ trễ (latency) của các endpoint chính dưới tải đồng thời.
- **Các hàm/export quan trọng:**
  - `request(method, path, body, token)`: wrapper Promise quanh `http.request`/`https.request`, tự động chọn `http`/`https` theo `url.protocol`. Đo `start = Date.now()` trước khi gửi, tính `ms = Date.now() - start` khi nhận đủ response. Trả `{status, ms, body}` (parse JSON, fallback string nếu parse lỗi). Nếu lỗi network → reject với `{error, ms}`.
  - `login()`: đăng nhập bằng `admin@rov.local`/`Admin@123`, lưu `TOKEN` vào biến module-level để dùng cho các request sau; ném lỗi nếu login thất bại.
  - `bench(label, fn, concurrency=10, rounds=3)`: hàm benchmark tổng quát.
    - Chạy `rounds` vòng, mỗi vòng bắn đồng thời `concurrency` request (`Array.from({length: concurrency}, () => fn()...)` rồi `Promise.all`).
    - Với mỗi response: nếu `status >= 400` tăng `errors`; luôn đẩy `res.ms` vào mảng `times` (kể cả lỗi, để phản ánh đúng độ trễ thực tế).
    - Sau khi xong toàn bộ: sort `times`, tính `avg` (trung bình cộng), `p50`/`p95`/`p99` (percentile bằng index `Math.floor(len * pct)` trên mảng đã sort — cách tính percentile đơn giản, không nội suy), `max`.
    - In ra dòng kết quả với emoji trạng thái: 🟢 nếu `avg < 200ms`, 🟡 nếu `< 500ms`, 🔴 nếu chậm hơn.
  - `run()` (hàm main):
    - Cấu hình `CONCURRENCY = 20`, `ROUNDS = 3` → mỗi endpoint nhận `20 × 3 = 60` request.
    - Login trước để lấy token dùng chung.
    - Chạy tuần tự (không song song giữa các bench, vì mỗi `await bench(...)` block trước khi sang endpoint kế) benchmark cho: `POST /auth/login`, `GET /auth/me`, `GET /projects`, `GET /trips`, `GET /rovs`, `GET /stats/overview`, và (nếu có trip) `GET /trips/:id/sensor-data`, `GET /trips/:id/dvl`, `GET /media/trip/:id`, `GET /notifications`.
    - Lấy `tid` (id trip đầu tiên) bằng cách gọi `GET /trips?limit=5` trước, dùng `tripList[0]._id` cho các test phụ thuộc trip.
    - Tổng kết: tính `overall` = trung bình cộng `avg` của tất cả endpoint, `totalErrors` = tổng lỗi tất cả endpoint. In verdict: PASS nếu `overall < 200ms && totalErrors === 0`; WARN nếu `< 500ms`; FAIL nếu chậm hơn hoặc nhiều lỗi.
    - In gợi ý tối ưu nếu chậm (stats/overview → thêm index; sensor-data → cân nhắc pagination; p99 cao → check slow query log Atlas).
- **Luồng dữ liệu / kết nối với file khác:** Gọi HTTP trực tiếp tới server đang chạy ở `localhost:5000` — không import module backend nào, hoàn toàn "black-box" test qua network thật.
- **Điểm đáng chú ý:**
  - Kết quả baseline ghi trong CLAUDE.md: `stats/overview` avg 906ms/P95 1842ms (chậm nhất, khớp với nhận định 7 aggregation song song ở `stats.controller.js`); `POST /auth/login` có 41/60 lỗi — đây là **kỳ vọng đúng**, không phải bug, vì rate limiter (`express-rate-limit` cho `/auth/*`, 20 req/15 phút theo TASK 2a) chặn phần lớn request lặp lại nhanh — script tự nhận định "Rate limiter hoạt động đúng".
  - Không có warm-up phase (khác với Artillery có 3 phase: warm-up/ramp-up/peak) — nghĩa là round đầu tiên có thể bị ảnh hưởng bởi cold-start (kết nối MongoDB pool, JIT warmup của Node).

---

### `backend/src/scripts/functional-test.js`
- **Chức năng chính:** Bộ test tự động end-to-end qua HTTP thật (không phải unit test/mock) — kiểm tra Auth, RBAC, Validation, CRUD, Pagination. Đã đạt 37/37 passed theo CLAUDE.md.
- **Các hàm/export quan trọng:**
  - `req(method, path, body, token)`: helper HTTP request bằng module `http` thuần (tương tự `load-test.js` nhưng đơn giản hơn, không đo thời gian).
  - `assert(label, condition, detail='')`: helper kiểm tra — in `✅`/`❌` kèm nhãn, tăng biến đếm toàn cục `passed`/`failed`. Đây là 1 dạng test framework tự chế cực nhẹ (không dùng Jest/Mocha).
  - `login(email, password)`: helper login trả về `accessToken` hoặc `null`.
  - **`testAuth()`**: 7 case — login đúng (200 + có `accessToken`), sai password (401), email không tồn tại (401), thiếu field password (>=400), `GET /auth/me` với token hợp lệ (200 + đúng email), không token (401), token sai hoàn toàn (401). Trả về `token` admin để các suite sau dùng.
  - **`testRBAC(adminToken)`**: 6 case, login bằng `viewer@rov.local` trước — viewer `POST /projects` → 403; viewer `DELETE /trips/:id` (id giả `000...000`) → 403; viewer `GET /projects` → 200 (đọc được); viewer `POST /trips/:id/data/upload-batch` → 403 (không được upload); không có token nào `GET /projects` → 401.
  - **`testValidation(token)`**: 5 case — thiếu `name` khi tạo project (>=400); `rov` không đúng ObjectId format (>=400/422/500 — chấp nhận cả 500 vì có thể Mongoose cast error chưa được middleware bắt gọn thành 400); tạo trip với `projectId` giả không tồn tại → phải là **404** (đây chính là bug đã tìm thấy và fix, ghi rõ trong CLAUDE.md: "trả 201 thay vì 404 — đã fix bằng cách thêm kiểm tra project tồn tại trong trip.controller.js"); upload sensor-data với `readings` không phải array → 400; `readings: []` (mảng rỗng) → 400.
  - **`testCRUD(token)`**: 11 case — lấy `rovId` đầu tiên từ `GET /rovs` (nếu không có ROV nào thì log cảnh báo và bỏ qua toàn bộ suite này — tránh test crash khi DB trống); tạo project mới (tên có prefix `[TEST]` + `Date.now()` để tránh trùng và dễ nhận diện/dọn dẹp), đọc lại, cập nhật (`PATCH status: 'ongoing'`), tạo trip con trong project đó, đọc trip, xóa trip, cuối cùng **xóa project (cleanup)** và verify `GET` project đã xóa trả về 404 (đảm bảo test không để lại rác trong DB sau khi chạy).
  - **`testPagination(token)`**: 6 case — `GET /projects?page=1&limit=2` → cấu trúc đúng (`data`, `total` tồn tại) + số item ≤ 2; filter `status=completed` → tất cả kết quả đúng status; `page=999` (vượt quá) → vẫn 200 nhưng `data` rỗng (không lỗi khi trang không tồn tại).
  - **`run()`**: chạy tuần tự 5 suite theo thứ tự `testAuth → testRBAC → testValidation → testCRUD → testPagination` (thứ tự có ý nghĩa: cần `adminToken` từ `testAuth` trước, các suite sau phụ thuộc). Nếu login thất bại ngay từ đầu → thoát với `process.exit(1)` kèm thông báo cần đảm bảo backend đang chạy + đã seed data. Cuối cùng in tổng kết `passed/total (pct%)`, exit code `1` nếu có test fail (để CI có thể dùng exit code này).
- **Luồng dữ liệu / kết nối với file khác:** Gọi HTTP thật tới server, không import module backend — giống `load-test.js`, đây là black-box integration test.
- **Điểm đáng chú ý:**
  - Đây là bằng chứng cụ thể nhất để trình bày trước hội đồng: đã dùng test tự động phát hiện 1 bug thật (trip tạo được dù project không tồn tại) và đã fix.
  - Test có tính "tự dọn dẹp" (cleanup) ở `testCRUD` — không để lại project/trip rác sau khi chạy nhiều lần.
  - Phụ thuộc dữ liệu đã seed sẵn (`admin@rov.local`, `viewer@rov.local`, ít nhất 1 ROV) — không tự seed, phải chạy `seed.js`/`seed-full.js` trước.

---

### `backend/src/scripts/get-token.js`
- **Chức năng chính:** Script tiện ích lấy JWT access token bằng cách login qua API thật, in ra token và câu lệnh Artillery mẫu để copy/paste thủ công.
- **Logic:**
  - Login bằng `operator@rov.local`/`Operator@123` (dùng operator chứ không phải admin — có thể vì muốn test load dưới góc nhìn quyền hạn thấp hơn, gần với user thực tế).
  - Dùng `http.request` thuần (không Promise, callback style trực tiếp).
  - Nếu có `r.data.accessToken`: in ra 2 gợi ý dùng — (1) câu lệnh `artillery run ... --overrides '{"config":{"environments":{"default":{"variables":{"token":"..."}}}}}'` để truyền token qua CLI override mà không cần sửa file yml; (2) token thô để tự paste tay vào `artillery.yml`.
  - Nếu thất bại: in lỗi ra `console.error`.
- **Luồng dữ liệu / kết nối với file khác:** Độc lập, chỉ gọi HTTP tới backend đang chạy. Liên quan tới file `artillery.yml` (không nằm trong phạm vi đọc yêu cầu, nhưng được tham chiếu tên trong cùng thư mục `scripts/`).
- **Điểm đáng chú ý:** Đây là bước thủ công trung gian — được thay thế hoàn toàn tự động hoá bởi `run-artillery.js` (không cần chạy `get-token.js` riêng nữa nếu dùng `run-artillery.js`), nhưng vẫn giữ lại như một tiện ích debug độc lập.

---

### `backend/src/scripts/run-artillery.js`
- **Chức năng chính:** Tự động hoá hoàn toàn quy trình load test bằng Artillery — tự lấy token mới, tự patch vào file cấu hình, tự chạy Artillery — không cần thao tác tay như `get-token.js`.
- **Các hàm/export quan trọng:**
  - `getToken()`: giống hệt logic trong `get-token.js` (login bằng `operator@rov.local`/`Operator@123`), nhưng trả về Promise (`resolve(accessToken)` / `reject(Error)`), dùng để `await` trong `run()`.
  - `run()` (hàm main async):
    1. Gọi `getToken()`, log "Token received (expires in 15 min)" — nhắc rằng access token có hạn 15 phút (đúng thiết kế JWT trong CLAUDE.md), nên phải lấy token mới mỗi lần chạy Artillery thay vì hardcode.
    2. Đọc nội dung `artillery.yml` hiện tại (`fs.readFileSync`), dùng regex `/token: ".*"/` thay thế bằng token mới (`fs.writeFileSync` ghi đè lại chính file `artillery.yml` — **side-effect quan trọng: file cấu hình bị chỉnh sửa trực tiếp mỗi lần chạy script này**).
    3. Chạy Artillery bằng `spawnSync('artillery', ['run', ARTILLERY_YML], { stdio: 'inherit', shell: true })` — `stdio: 'inherit'` để output của Artillery (bao gồm progress bar, kết quả real-time) hiển thị trực tiếp ra terminal của người chạy script, không bị nuốt mất. `shell: true` cần thiết trên Windows để tìm đúng lệnh `artillery` (global npm binary, thường là `.cmd` trên Windows).
    4. Nếu `result.status !== 0` (Artillery exit code khác 0, tức có lỗi) → in lỗi và `process.exit(result.status)` để phản ánh đúng exit code ra ngoài (hữu ích nếu tích hợp vào CI).
- **Luồng dữ liệu / kết nối với file khác:** Phụ thuộc trực tiếp vào sự tồn tại của `backend/src/scripts/artillery.yml` (không nằm trong danh sách file được yêu cầu đọc lần này, nhưng được tham chiếu qua `ARTILLERY_YML = path.resolve(__dirname, 'artillery.yml')`) và vào việc đã cài `artillery` như global CLI tool (`npm install -g artillery`, theo CLAUDE.md).
- **Điểm đáng chú ý:**
  - Script này **ghi đè file cấu hình** `artillery.yml` mỗi lần chạy (thay token cũ bằng token mới) — nếu người dùng có sửa thủ công phần khác của `artillery.yml` cùng lúc, cần cẩn thận vì regex chỉ thay đúng dòng `token: "..."`, không ảnh hưởng phần còn lại của file.
  - Không có timeout hay giới hạn cho tiến trình Artillery — nếu Artillery treo, `spawnSync` (đồng bộ, block hoàn toàn) sẽ treo theo, không có cơ chế kill tự động.

---

## Tổng kết liên kết giữa các module đã đọc

```
User bấm "Generate Summary" (frontend)
        │
        ▼
POST /projects/:id/ai-summary (controller ngoài phạm vi đọc)
        │  set aiSummary.status='pending', enqueue Bull job
        ▼
config/queue.js → aiSummaryQueue (Redis-backed)
        │
        ▼
ai.worker.js  ── process(job) ──► ai.service.js (gọi Gemini 2.5 Flash)
        │                                │
        │  update Project.aiSummary      │ parse ===VI===/===EN===
        ▼                                ▼
   MongoDB (Project.aiSummary.status='done'/'failed')
        │
        ▼
notification.service.js.create() ──► lưu Notification (MongoDB)
        │                        └──► pushSSE() nếu user đang mở kết nối
        ▼
notification.controller.js (stream) ──► client EventSource nhận event
        │
        ▼
Frontend invalidate query → hiện summary mới, tắt spinner


Media/Snapshot analysis (TASK 6b) ──► Bull queue media-analysis/snapshot-analysis
        │
        ▼
Node worker (ngoài phạm vi đọc) ──► HTTP POST tới yolo-service (main.py) /detect
        │                                  │
        │                                  ├─ ảnh: _detect_image + cross-class NMS
        │                                  └─ video: _detect_video (ByteTrack + adaptive interval)
        ▼
Lưu media.labels / snapshot.aiLabels ──► notification.service push SSE


Admin xem Dashboard ──► GET /stats/overview ──► stats.controller.js (7 aggregation song song)
Admin xem Audit Log  ──► GET /audit ──► audit.controller.js ──► audit.service.js (query có index)
Mọi controller khác  ──► auditService.log(...) fire-and-forget ──► ghi AuditLog


Chuẩn bị bảo vệ đồ án:
  seed.js / seed-full.js  → tạo dữ liệu demo
  functional-test.js      → xác nhận API đúng (37/37)
  load-test.js            → đo hiệu năng nhanh, không cần cài gì
  get-token.js / run-artillery.js → phục vụ Artillery load test nâng cao
```
