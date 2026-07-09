# Mục lục — Tài liệu giải thích code (ROV Management System)

Bộ tài liệu này được tạo để phục vụ ôn tập trước khi bảo vệ đồ án tốt nghiệp. Mỗi file trong thư mục `docs/code-explained/` giải thích chi tiết **chức năng, hàm quan trọng, luồng dữ liệu và điểm đáng chú ý** của từng file mã nguồn thật trong repo (đã đọc trực tiếp code, không suy đoán từ CLAUDE.md).

Bạn có thể hỏi trực tiếp theo từng phần, ví dụ: *"giải thích phần 03 cho tôi"*, *"hàm generateProjectSummary trong phần 04 làm gì"*, *"tại sao TripDetailPage lại có ReferenceLine"*...

---

## Danh sách các phần

| # | File | Phạm vi | Số dòng |
|---|------|---------|---------|
| 01 | [01-backend-core-auth-users.md](01-backend-core-auth-users.md) | `app.js`, `server.js`, config (db/passport/queue/redis/s3), middleware (auth/error/rateLimit), utils (jwt/response/geocode/avatar/parseTimestamp), module **auth** + **users** | 431 |
| 02 | [02-backend-rov-project-trip.md](02-backend-rov-project-trip.md) | Module **rovs**, **projects**, **trips** (model/controller/routes/service) + `batch.controller.js` (upload ZIP hàng loạt từ ROV) | 501 |
| 03 | [03-backend-media-sensor-dvl-sonar-snapshot.md](03-backend-media-sensor-dvl-sonar-snapshot.md) | Module **media** (S3 + YOLO), **sensor** (anomaly Z-score), **dvl**, **sonar**, **snapshots** (Evidence System photo/clip) | 507 |
| 04 | [04-backend-ai-notification-audit-stats-yolo.md](04-backend-ai-notification-audit-stats-yolo.md) | Module **ai** (Gemini + Bull), **notifications** (SSE + Redis), **audit**, **stats** (dashboard aggregation), YOLO microservice Python (`main.py`), các script (seed/test/load-test) | 538 |
| 05 | [05-frontend-core-infra.md](05-frontend-core-infra.md) | `App.jsx`, `main.jsx`, `router/index.jsx`, Zustand store (auth/theme), `lib/` (axios/export/chartColors/dnd-sensors), `hooks/` (useSSE/useDebounce), toàn bộ `components/shared/` và `components/bespoke/` (Marine* UI kit) | 505 |
| 06 | [06-frontend-features-simple.md](06-frontend-features-simple.md) | Auth pages, Dashboard, Errors, Media (Gallery/Upload), Profile, Projects (page + form), Rovs (page + form), Users, Audit | 428 |
| 07 | [07-frontend-trips-detail.md](07-frontend-trips-detail.md) | **Phần lớn và quan trọng nhất**: `TripDetailPage.jsx` (cockpit layout 3 cột), `TripsPage`, `TripList`, `TripForm`, gauge SVG (ArtificialHorizon/CompassRose), `ROVDataUpload`, `SensorChart`, `TrajectoryViewer`, `TripMap`, SonarViewer (parser + player), `BottomChart`, Evidence system, layout panels, media shared | 592 |

**Tổng cộng: ~3500 dòng tài liệu**, bao phủ toàn bộ ~70 file backend + ~70 file frontend + YOLO microservice.

---

## Sơ đồ tổng thể luồng hệ thống (tham chiếu nhanh)

```
ROV (thực địa, không wifi)
   │  Về bờ → operator upload
   ▼
Frontend (React)                         Backend (Express)
 ROVDataUpload / MediaUpload  ──HTTP──▶  batch.controller.js (ZIP)
                                          │  ├─ sensor.controller.js  (CSV → SensorData + Z-score anomaly)
                                          │  ├─ dvl.controller.js     (JSON → DVLData trajectory)
                                          │  ├─ sonar.controller.js   (binary → SonarFile)
                                          │  └─ media.controller.js  (presigned URL → S3, video/ảnh)
                                          ▼
                                     MongoDB Atlas (Project → Trip → Sensor/DVL/Sonar/Media/Snapshot)
                                          │
                     ┌────────────────────┼─────────────────────┐
                     ▼                    ▼                     ▼
             Bull Queue: ai-summary   Bull Queue: media-analysis   notification.service (SSE)
             → Gemini 2.5 Flash       → YOLOv8 (Python FastAPI)   → push realtime tới Navbar bell
                     │                    │
                     ▼                    ▼
              project.aiSummary      media.labels / snapshot.aiLabels
                                          │
                                          ▼
Frontend TripDetailPage — cockpit layout: video + chart sensor sync + bbox overlay + gauge + evidence capture
```

---

## Các phát hiện đáng chú ý khi đối chiếu code thật với CLAUDE.md

Trong quá trình đọc code, các agent phát hiện một số điểm **lệch giữa tài liệu kế hoạch (CLAUDE.md) và code thực tế hiện tại** — đáng lưu ý vì hội đồng phản biện có thể hỏi hoặc bạn có thể bị hỏi ngược:

1. **Cascade delete đã được fix đầy đủ** (khác với mô tả "BUG LỚN — chưa cascade" trong CLAUDE.md phần TASK 6d-0): `trip.service.js.remove()` và `project.service.js.remove()` hiện đã xóa cascade SensorData/DVLData/SonarFile/Media/Snapshot + object trên S3. → Xem chi tiết phần **02**.

2. **Tên file manifest**: `batch.controller.js` hiện check tên `trip.json`, trong khi TASK 9 (CLAUDE.md) mô tả file ROV xuất ra tên là `trip_master.json`. Cần xác minh lại với file thật từ thiết bị ROV để biết bên nào đúng. → Xem phần **02**.

3. **Route DVL/Sonar không được mount**: `dvl.routes.js` và `sonar.routes.js` tồn tại nhưng không đăng ký trong `app.js`. Các endpoint DVL/Sonar thực tế chạy qua `trip.routes.js` (dùng chung controller). Đây có thể là dead code còn sót lại từ refactor. → Xem phần **03**.

4. **`SensorUpload.jsx` (trong `features/projects/components/`) có khả năng là component legacy** đã bị thay thế bởi `ROVDataUpload.jsx` (theo TASK 5/6d). Kiểm tra xem còn được import ở đâu không trước khi nhắc đến trong buổi bảo vệ. → Xem phần **06**.

5. **Race condition trong axios interceptor**: cơ chế auto-refresh token khi gặp 401 không có dedupe — nếu nhiều request cùng 401 đồng thời có thể trigger nhiều lần gọi `/auth/refresh` song song. Đáng lưu ý nếu hội đồng hỏi về xử lý concurrency ở frontend. → Xem phần **05**.

6. **Dead code trong `TripDetailPage.jsx`**: khối JSX cũ dùng `handleEvidenceTimeUpdate` đã bị vô hiệu hóa bằng `{false && ...}`; `SensorChart.jsx` và `LocationPanel.jsx` không còn được `TripDetailPage` sử dụng trực tiếp (logic đã inline); `CustomVideoControls` và `EvidenceVideoControls` trùng lặp logic; `pickKpiSize` (KpiCard.jsx) và `pickSize` (CurrentStatus.jsx) là 2 hàm cùng mục đích tồn tại song song. → Xem phần **07** mục "Ghi chú tổng hợp cho hội đồng phản biện".

7. **`generateAISummary`** trong `project.controller.js` trả response bằng `res.status(202).json(...)` trực tiếp thay vì dùng `success()` util — không tuân theo convention response format chuẩn của dự án. → Xem phần **02**.

8. **`classifyFile`** trong batch upload coi mọi file `.csv` là sensor, không bắt buộc phải có prefix `log_` như mô tả. → Xem phần **02**.

---

## Gợi ý cách dùng bộ tài liệu này

- Đọc phần **01 → 04** để nắm vững backend (kiến trúc, auth, business logic, AI/queue/realtime).
- Đọc phần **05 → 07** để nắm vững frontend, đặc biệt phần **07** vì `TripDetailPage` là tính năng phức tạp và nổi bật nhất — khả năng cao hội đồng sẽ hỏi sâu vào đây (video-sensor sync, YOLO bbox overlay, evidence system).
- Khi ôn tập, có thể hỏi tôi theo dạng: *"trong phần 07, giải thích lại cơ chế tính chartTimestamp"*, *"phần 03, Z-score tính như thế nào"*, *"phần 01, JWT refresh token lưu ở đâu, TTL bao lâu"* — tôi sẽ trả lời dựa trên đúng nội dung đã ghi (và có thể đọc lại code gốc để xác nhận nếu cần).
