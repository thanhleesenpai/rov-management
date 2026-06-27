# ROV Management System — Project Context

## Mô tả dự án
Web app quản lí ROV (Remotely Operated Vehicle) — đồ án tốt nghiệp BKHN.

**Luồng chính:**
```
Operator (sau khi ROV về bờ)
    │  Upload file CSV/JSON chứa sensor data + GPS qua web
    ▼
Backend API (Node.js)
    ├── Lưu sensor data (nhiệt độ, độ sâu, áp suất, GPS) vào MongoDB
    └── Lưu video/ảnh lên AWS S3

Web App (React)
    └── Người dùng đăng nhập xem dữ liệu đã lưu:
        ROV info, project history, sensor charts, media gallery
```
**Không có GCS tự động** — ngoài thực địa không có wifi. Operator upload thủ công sau khi về bờ.

---

## Tech stack
| Layer | Công nghệ | Ghi chú |
|-------|-----------|---------|
| Frontend | React 18 + Vite + Tailwind CSS | |
| UI Components | shadcn/ui | Đã cài, dùng một số component |
| State | React Query + Zustand | Server state + auth/client state |
| Charts | Recharts | Dashboard + sensor data |
| Map | Leaflet.js + OpenStreetMap | Vẽ route GPS từ sensor data — miễn phí |
| Backend | Node.js + Express.js | |
| Database | MongoDB Atlas + Mongoose | |
| Realtime | SSE (Server-Sent Events) | Push notification từ server → client, không cần WebSocket |
| Cache | Redis | Token blacklist (logout security) + rate limiting |
| Queue | Bull (Redis-backed) | Async jobs: AI summary generation, email |
| Storage | AWS S3 (presigned URL) | |
| Auth | JWT — access 15 phút + refresh 7 ngày | Google OAuth2 via Passport.js |
| AI | Gemini 2.5 Flash (Google) | Project summary sau khi hoàn tất |
| Computer Vision | YOLOv8 (Python FastAPI microservice) | Nhận diện vật thể trong ảnh/video ROV |
| Anomaly Detection | Z-Score (tự implement) | Phát hiện bất thường sensor data |
| Email | Nodemailer + Gmail SMTP | Notify trip failed / project completed |

---

## Cấu trúc thư mục
```
rov-management/
├── backend/src/
│   ├── app.js                      # Express app, đăng ký tất cả routes
│   ├── config/
│   │   ├── db.js
│   │   ├── s3.js                   # AWS S3 client
│   │   ├── redis.js                # Redis client (ioredis)
│   │   └── queue.js                # Bull queues: ai-summary, email
│   ├── middleware/
│   │   ├── auth.middleware.js      # authenticate, authorize(roles), blacklist check
│   │   ├── rateLimit.middleware.js # express-rate-limit + rate-limit-redis
│   │   └── error.middleware.js
│   ├── utils/
│   │   ├── response.util.js        # success(res, data, msg, status)
│   │   └── jwt.util.js
│   └── modules/
│       ├── auth/                   # register, login, logout, refresh, me, updateMe, changePassword
│       ├── users/                  # getAllUsers, updateUser, toggleStatus, bulkStatus, bulkRole
│       ├── rovs/                   # CRUD ROV
│       ├── projects/                  # CRUD Project + filter nâng cao
│       ├── trips/                  # CRUD Trip
│       ├── media/                  # presigned upload, gallery, reorder, bulkDelete
│       ├── stats/                  # overview aggregation
│       ├── notifications/          # SSE stream, CRUD notifications
│       ├── ai/                     # ai.service.js, Bull worker
│       └── sensor/                 # upload endpoint, SensorData model
│
└── frontend/src/
    ├── store/auth.store.js          # Zustand: user, tokens, updateUser()
    ├── lib/
    │   ├── axios.js                 # auto attach + auto refresh token
    │   ├── export.js                # CSV + PDF (jsPDF + autotable)
    │   └── dnd-sensors.js
    ├── router/index.jsx
    ├── components/shared/
    │   ├── Layout.jsx / Sidebar.jsx / Navbar.jsx
    │   ├── ProtectedRoute.jsx
    │   ├── ExportMenu.jsx           # dropdown CSV / PDF
    │   └── Skeleton.jsx
    └── features/
        ├── auth/                    # LoginPage, RegisterPage
        ├── dashboard/               # charts + stat cards
        ├── rovs/                    # RovsPage, RovDetailPage, RovForm
        ├── projects/                   # ProjectsPage, ProjectDetailPage, ProjectForm
        ├── trips/                   # TripsPage, TripList, TripForm
        ├── media/                   # MediaGallery, MediaUpload
        ├── users/                   # UsersPage (admin only)
        └── profile/                 # ProfilePage — tabs: profile, password, settings
```

---

## Phân quyền (RBAC)
| Role | Quyền |
|------|-------|
| `viewer` | Chỉ đọc |
| `operator` | Tạo/sửa project, trip; upload media |
| `admin` | Toàn quyền + quản lí user + xóa resource |

---

## Response format (cực kỳ quan trọng)
Backend dùng `success(res, data)` — KHÔNG dùng `res.json()` trực tiếp.
```json
{ "success": true, "message": "...", "data": <payload> }
```
Axios interceptor trả về `response.data` → query result = `{ success, message, data }`.

**Cấu trúc `data` theo endpoint:**
| Endpoint | Cấu trúc data |
|----------|--------------|
| Paginated (projects, trips, rovs, media) | `{ data: [...], total, page, totalPages }` |
| Users | `{ users: [...], total, page, totalPages }` |
| Stats | `{ projectByStatus, tripByStatus, rovUtilization, activityTimeline, ... }` |
| Single object | `{ _id, ... }` |

**Export functions:** nhận kết quả `await api.get(...)` trực tiếp → `res.data.data` = array (hoặc `res.data.users` cho users).

---

## ✅ ĐÃ HOÀN THÀNH

### Auth (đầy đủ)
- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`
- `GET /auth/me`, `PATCH /auth/me` (đổi fullName)
- `PATCH /auth/change-password`
- Axios auto-refresh khi access token hết hạn

### Google OAuth (đầy đủ)
- `GET /auth/google` → redirect Google consent screen
- `GET /auth/google/callback` → tạo/tìm user → trả JWT → redirect frontend
- `user.model.js`: `password` optional, thêm `googleId`, `authProvider`
- `config/passport.js`: GoogleStrategy — tìm user theo email, gắn googleId nếu chưa có, tạo mới nếu chưa tồn tại
- `AuthCallback.jsx`: đọc token từ URL params → fetch `/auth/me` → lưu Zustand → redirect dashboard
- `LoginPage` + `RegisterPage`: nút "Continue with Google" + divider
- `ProfilePage`: ẩn tab "Change Password" với Google user (`authProvider === 'google'`)
- Passport chỉ khởi tạo GoogleStrategy khi có `GOOGLE_CLIENT_ID` trong env (graceful warning nếu thiếu)
- Cần thêm vào `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/google/callback`

### Profile Page (đầy đủ)
- Tab "My Profile": đổi fullName → `PATCH /auth/me` → update Zustand store
- Tab "Change Password": `PATCH /auth/change-password`
- Tab "Settings": placeholder UI

### User Management (admin, đầy đủ)
- Danh sách, search, filter by role
- Update role, toggle status — có self-protection
- Bulk: activate / deactivate / set role
- Export CSV + PDF

### ROV Registry (đầy đủ)
- CRUD: `GET/POST /rovs`, `GET/PATCH/DELETE /rovs/:id`
- RovDetailPage: 4 stat cards + project history
- Export CSV + PDF

### Project Management (đầy đủ)
- CRUD: `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`
- Filter: status, rovId, fromDate, toDate, search
- Export CSV + PDF

### Trip Management (đầy đủ)
- Tạo: `POST /projects/:projectId/trips` | Actions: `PATCH/DELETE /trips/:id`
- TripsPage: danh sách, filter by status + date range
- Hiển thị chính trong ProjectDetailPage
- Export CSV + PDF

### Media / AWS S3 (đầy đủ)
- Upload qua presigned URL, confirm sau khi upload xong
- Gallery: xem theo project, drag-to-reorder, lightbox
- Bulk select + delete (admin)
- Media model: s3Key, url, type, size, status (pending/ready/failed), order

### Dashboard (đầy đủ)
- Stat cards: Total Projects, Running Trips, Active ROVs, Total Users
- Biểu đồ: Project Status donut, Trips by Status bar, ROV Utilization horizontal bar
- Activity timeline 6 tháng (projects / trips / media)
- Backend: 7 MongoDB aggregations song song

### Tiện ích (đầy đủ)
- Export CSV + PDF tất cả danh sách
- Filter nâng cao + Clear filters (đỏ)
- Bulk operations + select mode
- ExportMenu dropdown component

---

## 🔲 LỘ TRÌNH CÒN LẠI

---

### ✅ TASK 1 — Google OAuth (đăng nhập bằng Google)

**Files đã thay đổi:**
- `backend/src/modules/users/user.model.js` — `password` optional, thêm `googleId`, `authProvider`
- `backend/src/config/passport.js` — GoogleStrategy: tìm/tạo user theo email
- `backend/src/modules/auth/auth.controller.js` — thêm `googleCallback`
- `backend/src/modules/auth/auth.routes.js` — `GET /auth/google` + `GET /auth/google/callback`
- `backend/src/app.js` — khởi tạo `passport.initialize()`
- `frontend/src/features/auth/LoginPage.jsx` — Google button + divider + lỗi oauth_failed
- `frontend/src/features/auth/RegisterPage.jsx` — Google button + divider
- `frontend/src/features/auth/AuthCallback.jsx` — đọc token từ URL → Zustand → redirect
- `frontend/src/router/index.jsx` — thêm route `/auth/callback`
- `frontend/src/features/profile/ProfilePage.jsx` — ẩn tab "Change Password" với Google user

**Cần làm để kích hoạt:** Thêm vào `backend/.env`:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/google/callback
```

**Checklist:**
- [x] Bấm "Continue with Google" → mở Google consent screen
- [x] Chọn tài khoản Google → về dashboard, có tên + avatar từ Google
- [x] User mới tự động tạo trong DB với role `viewer`
- [x] User cũ (cùng email) login lại được, không tạo duplicate
- [x] Tài khoản Google không hiển thị tab "Change Password" trong Profile
- [x] Login bằng email/password vẫn hoạt động bình thường

---

### TASK 2 — In-app Notifications + Redis + SSE
**Tại sao cần:** Hệ thống multi-operator cần thông báo realtime khi có thay đổi quan trọng. Redis bảo mật logout. SSE thay thế polling.

**2a — Redis (token blacklist + rate limit):**
1. Kích hoạt `config/redis.js` — kết nối Redis qua `REDIS_URL`
2. `POST /auth/logout` → thêm refreshToken vào Redis blacklist (`blacklist:{token}`, TTL 7 ngày)
3. `auth.middleware.js` → kiểm tra blacklist trước khi chấp nhận token
4. Rate limit: `express-rate-limit` + `rate-limit-redis` cho `/auth/*` (20 req/15 phút)

**2b — Notification model + service:**
1. Tạo `Notification` model:
   ```
   userId (ref), type (string), title, body, isRead (bool), link (string), createdAt
   ```
   Index: `{ userId: 1, isRead: 1, createdAt: -1 }`
2. `notification.service.js`: hàm `create(userId, type, title, body, link)` — lưu DB + push SSE
3. Trigger tại các sự kiện:
   - Trip status → `done` / `failed` → notify user tạo trip
   - Project status → `completed` → notify operator liên quan
   - Admin bulk-disable user → notify user bị disable
4. REST routes: `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`

**2c — SSE (Server-Sent Events):**
1. `GET /notifications/stream` — giữ kết nối, trả `text/event-stream`
2. Lưu `res` object theo `userId` trong Map (in-memory, đủ cho single instance)
3. Khi `notification.service.create()` được gọi → tìm SSE connection của user → push event
4. Client tự reconnect nếu mất kết nối (EventSource mặc định)

**Frontend — subtasks:**
1. Hook `useSSE()` — `new EventSource('/api/v1/notifications/stream')`, cập nhật React Query cache khi nhận event
2. Bell icon trong `Navbar.jsx` với badge số chưa đọc (query `GET /notifications?unreadOnly=true`)
3. Click bell → dropdown 10 thông báo gần nhất
4. Click thông báo → navigate đến `link` + mark as read
5. "Mark all as read" button

**Checklist sau TASK 2:**
- [x] Logout → access token vào Redis blacklist, dùng lại token cũ → 401 (refresh token xóa khỏi DB)
- [x] Đổi trip sang `done` → bell badge đỏ xuất hiện ngay (SSE push, không cần reload)
- [x] Click bell → dropdown đúng thông báo
- [x] Click thông báo → navigate đúng trang, badge giảm
- [x] "Mark all as read" → badge biến mất
- [x] Reload trang → số badge vẫn đúng (lưu DB)

---

### TASK 3 — AI Project Summary + Bull Queue ⭐
**Tại sao cần:** Tính năng AI bắt buộc cho đồ án. Bull Queue xử lý async — AI call có thể mất 5-15s, không nên block HTTP request.

**3a — Bull Queue setup:**
1. Cài: `npm i bull`
2. Tạo `config/queue.js` — khởi tạo Bull queue dùng `REDIS_URL`
3. Queue `ai-summary`: worker gọi AI API, lưu kết quả, gửi SSE notification khi xong
4. Queue `email`: worker gửi email (dùng cho TASK 8)

**3b — AI Summary backend:**
1. Cài: `npm i openai` (hoặc `@anthropic-ai/sdk`)
2. `modules/ai/ai.service.js`: hàm `generateProjectSummary(project, trips, mediaCount)` → gọi API
   - Prompt: tên project, location, thời gian, danh sách trips + status, số media
3. Thêm field vào `project.model.js`:
   - `aiSummary: { content: String, generatedAt: Date, status: 'idle'|'pending'|'done'|'failed' }`
4. `POST /projects/:id/ai-summary` — enqueue Bull job, set `aiSummary.status = 'pending'`, trả 202
5. Bull worker xử lý → lưu `aiSummary.content` + `status = 'done'` → push SSE đến user

**Frontend — subtasks:**
1. Trong `ProjectDetailPage.jsx`, thêm section "AI Summary" phía dưới Trips
2. Hiển thị content nếu `aiSummary.status === 'done'` + "Generated at ..."
3. Button "Generate Summary" (project completed + operator/admin) → POST → spinner
4. Poll `GET /projects/:id` mỗi 3s khi `status === 'pending'` để biết khi nào xong
5. Button "Regenerate" nếu đã có summary

**Checklist sau TASK 3:**
- [x] Project completed → bấm "Generate Summary" → trả 202, spinner xuất hiện
- [x] Sau vài giây → summary tự cập nhật (poll 3s khi pending)
- [x] Reload → summary vẫn còn (lưu DB)
- [x] Project chưa completed → không thấy button
- [x] Viewer thấy summary nhưng không thấy button Generate

---

### TASK 4 — Audit Log
**Tại sao cần:** Traceable, quan trọng cho hệ thống vận hành thực tế.

**Backend — subtasks:**
1. `AuditLog` model: `action, entity, entityId, userId (ref), details (Mixed), createdAt`
2. `audit.service.js`: hàm `log(userId, action, entity, entityId, details)`
3. Gọi trong các controller: tạo/xóa project, xóa ROV, đổi role, bulk operations
4. `GET /audit?page&limit&entity&userId` — admin only

**Frontend — subtasks:**
1. Thêm trang `/audit` hoặc tab trong UsersPage
2. Timeline list: avatar + tên user, action, entity, thời gian relative
3. Filter theo entity type

**Checklist sau TASK 4:**
- [x] Tạo project → log xuất hiện trong audit
- [x] Xóa ROV → log "Deleted ROV X"
- [x] Đổi role user → log ghi đúng, hiện email user bị đổi
- [x] Toggle status user → log activate/disable + email
- [x] Generate AI summary → log ghi đúng
- [x] Viewer/Operator không vào được `/audit`

---

### TASK 5 — Sensor Data Upload (manual via web)
**Mô tả:** Operator upload file CSV/JSON chứa sensor data sau khi ROV về bờ. Không có GCS tự động vì ngoài thực địa không có wifi.

**Lưu ý thiết kế:** Trip = 1 lần lặn → sensor data gắn với Trip, không phải Project.

**Backend — subtasks:**
1. `SensorData` model: `{ trip, timestamp, depth, temp, pressure, yaw, pitch, roll, voltage, battery_percent, humidity }` — trip là 1 lần lặn
   Index: `{ trip: 1, timestamp: -1 }`; `trip.sensorCount` lưu số readings
2. `POST /trips/:id/sensor-data/upload` — nhận array readings, lưu bulk vào DB
3. Khi upload, đọc `lat`/`lng` từ dòng đầu tiên (nếu có) → lưu vào **Trip** `gpsLocation: { lat, lng }` + gọi **OpenStreetMap Nominatim reverse geocoding** → lưu `trip.locationName` (GPS là vị trí của lần lặn cụ thể đó, không phải toàn project)
4. `DELETE /trips/:id/sensor-data` — xóa sensor data của trip đó

**Frontend — subtasks:**
1. `SensorUpload` component trong TripCard expanded section (operator/admin)
2. Parse file phía client → validate → gửi array lên backend
3. Hiển thị số readings, nút "Clear" với confirm dialog
4. Badge sensor count trong trip card header

**Format file được hỗ trợ:**
```csv
timestamp,depth,temp,pressure[,lat,lng,yaw,pitch,roll,voltage,battery_percent,humidity]
2026-05-07T08:00:00Z,10.5,24.3,1.23,16.0544,108.2022,183.2,-1.2,0.8,16.80,100,28.1
```
- `depth`(m), `temp`(°C), `pressure`(bar), `timestamp` — bắt buộc
- `lat`/`lng` — optional, chỉ đọc dòng đầu làm GPS cố định của trip
- `yaw`/`pitch`/`roll`(°) — optional, hiển thị tab Navigation + live gauge
- `voltage`(V), `battery_percent`(%), `humidity`(%) — optional, hiển thị tab System
- File mẫu: `test-data/sensor-sample-full.csv` (60 readings, GPS Đà Nẵng, 2 anomaly spikes)

**Checklist sau TASK 5:**
- [x] Upload file CSV hợp lệ → data lưu DB (gắn với trip, không phải project)
- [x] Upload file sai format → báo lỗi rõ ràng
- [x] Upload lại → xóa data cũ của trip đó, lưu data mới
- [x] File có lat/lng → trip.gpsLocation và trip.locationName được cập nhật (Nominatim reverse geocoding)
- [x] Viewer không thấy upload section
- [x] AI summary dùng locationName khi có GPS data
- [x] Badge sensor count hiện trong trip card header

---

### TASK 6 — Sensor Data Display + Anomaly Detection + Map ✅
**Mô tả:** API backend trả sensor data + stats + anomalies. Component `SensorChart.jsx` dùng trong ProjectDetailPage (TripCard expanded). Raw Leaflet map ghim GPS.

**Backend — subtasks:**
1. `GET /trips/:id/sensor-data` → query SensorData theo trip, trả array readings + stats
2. Aggregate: min/max/avg cho mỗi metric (depth, temp, pressure)
3. Anomaly Detection: Z-Score (|z| > 2.5) cho từng metric
4. Trả về `{ data, stats, anomalies: [{ index, metric, value, zScore, timestamp }] }`
5. `trip.locationName` được dùng trong AI summary prompt (Gemini nhận tên địa danh thay vì tọa độ số)

**Frontend — subtasks:**
1. Component `SensorChart.jsx` — AreaChart Recharts với depth, temp, pressure (dùng trong TripCard)
2. Highlight điểm bất thường màu đỏ trên biểu đồ (custom dot)
3. Toggle hiện/ẩn từng đường (Legend clickable)
4. Panel "Anomalies Detected" liệt kê các điểm bất thường
5. Map nhỏ (raw Leaflet) ghim 1 Marker tại `trip.gpsLocation` — chỉ hiện nếu có GPS
6. Link từ TripCard trong ProjectDetailPage → `/trips/:id`

**Checklist sau TASK 6:**
- [x] Trip có sensor data → chart hiển thị đúng 3 metrics
- [x] Điểm bất thường tự động highlight đỏ trên biểu đồ
- [x] Panel anomalies liệt kê đúng các điểm bất thường
- [x] Toggle từng metric trên Legend hoạt động
- [x] Trip có GPS → map hiện Marker + tên địa danh (raw Leaflet, không dùng react-leaflet vì incompatible với React 18.3)
- [x] Trip không có GPS → map ẩn, không crash
- [x] Trip không có data → empty state thân thiện (SensorChart)
- [x] Link từ TripCard (ProjectDetailPage) → `/trips/:id`

---

### TASK 6a — TripDetailPage Cockpit Layout ✅
**Mô tả:** Trang `/trips/:id` với layout 3 cột kiểu "cockpit" — không cuộn trang, tối ưu cho màn hình 1080p. Hỗ trợ cả light mode và dark mode.

**Layout đã thực hiện:**
```
Header (h-14): status badge · title · project/location meta · DATA SYNCED · action buttons · Export
─────────────────────────────────────────────────────────────────────
Left col (w-56)          │ Center col (flex-1)       │ Right col (w-56)
  LOCATION                │  bg-black rounded-xl      │  NAVIGATION
  └─ Leaflet map          │  ├─ Video area (flex-1)   │  └─ Horizon gauge (SVG)
  CURRENT STATUS          │  │  ├─ MainMedia           │  └─ Compass gauge (SVG)
  └─ KPI: Depth (blue)   │  │  ├─ Top gradient bar    │  ALERTS
  └─ KPI: Temp (amber)   │  │  │  (filename + AI btn) │  └─ Anomaly cards (amber)
  └─ KPI: Pressure (green)│  │  └─ Toggle tab (◀▶)    │  └─ All clear (emerald)
                          │  └─ Playlist panel (w-44) │
                          │     (collapsible, w/ vert  │
                          │      scrollable thumbs)    │
─────────────────────────────────────────────────────────────────────
Bottom (h-44 / h-80 expanded):
  Tabs: [Environment] [Navigation] [System]    Legend toggles    [Expand ↕]
  Environment: AreaChart depth/temp/pressure (với anomaly dots)
  Navigation:  LineChart Yaw/Pitch/Roll (real data nếu CSV có; fallback demo khi không có)
  System:      LineChart voltage(V, trục phải) + battery_percent + humidity (%, trục trái)
```

**Checklist sau TASK 6a:**
- [x] Layout 3 cột không cuộn, fit 100vh - navbar
- [x] Left: Leaflet map + 3 KPI cards (avg depth/temp/pressure từ sensor stats)
- [x] Center: video player bg-black, top gradient overlay (filename + AI Snapshot btn)
- [x] Center: vertical playlist (w-44) collapsible bằng toggle tab (◀▶)
- [x] Center: auto-open playlist khi có >1 media file
- [x] Right: `ArtificialHorizon.jsx` + `CompassRose.jsx` — SVG instrument thật, animate theo live sensor data (dim opacity-35 khi không có sync)
- [x] Right: Alert cards (amber warning / emerald all-clear / dashed placeholder)
- [x] Bottom: Environment tab (AreaChart depth/temp/pressure + anomaly dots)
- [x] Bottom: Navigation tab (real YPR LineChart khi CSV có yaw/pitch/roll; fallback demo + watermark khi không có)
- [x] Bottom: System tab (LineChart voltage + battery_percent + humidity, dual Y-axis)
- [x] Bottom: Expand/Collapse toggle (h-44 ↔ h-80)
- [x] Bottom: legend toggle (click ẩn/hiện từng metric)
- [x] Bottom: Brush range selector zoom/pan trục X — có trên cả 3 tab (Environment, Navigation khi có real data, System)
- [x] Light/dark mode đầy đủ (dùng semantic tokens: bg-card, bg-muted, text-foreground, border-border)
- [x] CartesianGrid dùng `stroke="rgb(var(--border))"` — đúng theo app design system
- [x] Gauge SVG intentionally dark (aviation instrument style)
- [x] Header Export dropdown → Sensor CSV (readings) + Chart PNG (canvas export từ SVG)

---

### TASK 6b — YOLOv8 Object Detection (Media Analysis)
**Mô tả:** Khi operator upload ảnh hoặc video lên S3, tự động gọi Python microservice chạy YOLOv8 để nhận diện vật thể. Kết quả lưu vào Media document, hiển thị dạng tags. Chạy async qua Bull Queue — không block HTTP request.

**Kiến trúc:**
```
Upload media → S3 → media.status = 'ready'  ← KHÔNG auto-analyze nữa

Operator chủ động trigger (2 luồng):

Luồng 1 — Phân tích toàn bộ media (AIAnalyzePopover):
  POST /media/:id/analyze { model, confidence }
    → Bull job 'media-analysis'
    → YOLO service: ảnh dùng predict, video dùng track + adaptive interval
    → Lưu media.labels + trackId → SSE push

Luồng 2 — Phân tích snapshot/clip (Evidence System):
  POST /snapshots/:id/analyze
    → Bull job 'snapshot-analysis'
    → YOLO service: photo dùng predict, clip dùng track + startTime/endTime
    → Lưu snapshot.aiLabels → SSE push
```

**Python microservice — subtasks:**
1. Tạo `yolo-service/` trong root repo: `main.py` (FastAPI) + `requirements.txt`
2. `POST /detect` — nhận `{ mediaUrl, mediaType }`:
   - `image/*`: tải file → `YOLO('yolov8n.pt').predict()` → trả labels
   - `video/*`: tải file → `cv2.VideoCapture` → extract frame mỗi 2 giây → predict từng frame → aggregate (dedup theo class, giữ max confidence)
3. Response: `[{ name, confidence }]` — sort by confidence desc, top 20
4. Model: `yolov8n.pt` (nano, ~6MB, CPU inference ~100-500ms/frame)
5. `Dockerfile` cho service này (base: `python:3.11-slim`, cài `ultralytics`, `opencv-python-headless`)
6. Thêm vào `docker-compose.yml`: service `yolo-service` build từ `./yolo-service`

**Backend Node.js — subtasks:**
1. Upload xong → `media.status = 'ready'`, `analysisStatus = 'idle'` — **không auto-enqueue Bull job**
2. `POST /media/:id/analyze` (từ 6b-4) là điểm kích hoạt duy nhất cho full-media analysis
3. Bull worker: lấy presigned URL + `media.type` → `POST yolo-service:8000/detect`
4. Lưu kết quả vào `media.labels: [{ name, confidence, frameTime, trackId }]`
5. Video timeout: `{ attempts: 2, timeout: 300000 }` (5 phút, đủ cho VPS CPU)
6. Push SSE notification đến user khi xong

**Frontend — subtasks:**
1. Hiển thị labels dưới ảnh/video trong MediaGallery/lightbox dạng badge
2. Badge xanh nếu confidence > 80%, vàng nếu 50-80%
3. Trong TripDetailPage: hiển thị labels khi media đang active trong center column
4. SVG bbox overlay toggle (Eye/EyeOff) — ảnh + video, align với object-fit:contain
5. Click label badge video → seek đến frameTime tương ứng
6. SSE auto-refresh sau khi analysis xong (queryClient.invalidateQueries)

**Checklist sau TASK 6b:**
- [x] Upload ảnh → sau vài giây labels tự hiện (SSE push)
- [x] Upload video → sau 10-60s (tùy độ dài) labels tự hiện
- [x] Labels hiển thị đúng trong gallery và TripDetailPage
- [x] SVG bbox overlay + Eye/EyeOff toggle trong TripDetailPage và lightbox
- [x] Click label badge → seek video đến frameTime (TripDetailPage)
- [x] Pending spinner trên card khi analysisStatus === 'pending'
- [x] Video dài → frame sampling đúng mỗi 2s, không OOM
- [x] Ảnh tối/mờ → labels ít nhưng không crash
- [x] Microservice down → job fail gracefully, không ảnh hưởng luồng upload chính

---

### TASK 6b-2 — Per-Frame Bbox Tracking
**Mô tả:** Hiện tại mỗi class chỉ lưu 1 detection (frame confidence cao nhất). Cần lưu **tất cả detections** theo thời gian để bbox có thể di chuyển theo video đang phát.

**Kiến trúc thay đổi:**
```
Hiện tại: labels: [{ name, confidence, frameTime, bbox }]  ← 1 entry/class
Mới:      labels: [{ name, confidence, frameTime, bbox }, ...]  ← nhiều entry/class theo thời gian
```

**Python microservice — subtasks:**
1. `_detect_video`: thay vì `detections: dict` (keep max per class), dùng `detections: list` (append tất cả)
2. Dedup threshold: nếu cùng class, bbox gần giống nhau (IoU > 0.5) trong 2 giây liền → bỏ qua (tránh noise)
3. Response vẫn là `[{ name, confidence, frameTime, bbox }]` nhưng nhiều entries per class

**Backend Node.js:**
- `media.model.js`: không đổi schema (labels array đã đúng)
- Bull worker: không đổi (lưu array như cũ)
- Chú ý: labels array có thể lên 200-500 entries cho video dài → MongoDB document vẫn ổn (<16MB)

**Frontend — subtasks:**
1. Trong `TripDetailPage`, `DetectionSVG`: filter `labels` theo `currentTime` trong khoảng `±1s`:
   ```js
   const activeLabs = labels.filter(l => l.frameTime != null
     && Math.abs(l.frameTime - currentTime) < 1.0)
   ```
2. `useEffect` listen `timeupdate` event → `setCurrentTime(v.currentTime)`
3. Labels badge bar: thay vì show tất cả, show labels unique (theo class) của frame hiện tại
4. Khi video không phát (paused/không có sync): show tất cả detections như hiện tại

**Checklist sau TASK 6b-2:**
- [x] YOLO service trả về tất cả detections theo thứ tự frameTime (list, không dedup per class)
- [x] `hasPerFrame` = `labs.some(l => l.frameTime != null)` — đơn giản, chính xác (không dùng unique class count nữa)
- [x] `activeLabs` dùng nearest-frame: tìm `nearestTime`, filter `l.frameTime === nearestTime`, ẩn khi gap > 0.4s
- [x] Video không có per-frame data (ảnh, hoặc old-style 1-per-class) → fallback hiển thị tất cả labels
- [x] `currentVideoTime` chỉ update khi `hasPerFrame` (tránh re-render thừa khi video không có detection)
- [x] Reset `currentVideoTime` khi đổi media
- [ ] Test thực tế: video phát → bbox animate theo frame (cần re-analyze sau khi upgrade tracking)

---

### TASK 6b-4 — AI Settings & Analyze Modal
**Mô tả:** Thay vì "Re-analyze" đơn điệu, nâng cấp thành modal cài đặt AI cho phép operator chọn model và độ nhạy trước khi chạy phân tích. Kết quả mới **overwrite** labels cũ trong DB.

**Tại sao cần:**
- **Model selection**: YOLOv8n general bây giờ → custom ROV model sau khi fine-tune (crack, debris, marine life). Cần UI để switch giữa các model mà không cần deploy lại
- **Confidence slider**: underwater footage thường có confidence thấp (nước đục, ánh sáng yếu) → cần hạ ngưỡng 0.3 xuống 0.15-0.2 để detect được. Ngược lại, cần tăng lên 0.5+ để lọc false positives
- **Overwrite**: đơn giản và đúng — không cần versioning lịch sử cho đồ án
- Kết quả **deterministic** với cùng model + confidence → re-analyze chỉ có ý nghĩa khi đổi model hoặc confidence

**UI/UX:**
- Nút nhỏ (icon ⚙ hoặc Sparkles) trong top overlay của TripDetailPage, cạnh nút "Detect"
- Click → Popover nhỏ (không phải full modal) xuất hiện ngay dưới nút:
  ```
  ┌─────────────────────────────┐
  │  🤖 AI Analysis Settings    │
  ├─────────────────────────────┤
  │  Model                      │
  │  ○ YOLOv8n General (Default)│
  │  ○ ROV Custom Model         │
  │    (disabled nếu chưa có)   │
  ├─────────────────────────────┤
  │  Confidence  [●────] 0.30   │
  │              0.1        0.9 │
  ├─────────────────────────────┤
  │  Last: Done · 5 min ago     │
  │  [    Run Analysis    ]     │
  └─────────────────────────────┘
  ```
- "ROV Custom Model" disabled + tooltip "Not available yet" nếu chưa có custom model
- "Run Analysis" → loading state → đóng popover khi enqueue xong

**YOLO service (`main.py`) — subtasks:**
1. Cập nhật `DetectRequest`: thêm `confidence: float = 0.3` và `model: str = "yolov8n"`
2. Load model động theo request: `YOLO(f"{req.model}.pt")` — cache bằng dict `loaded_models = {}`
3. Truyền `conf=req.confidence` vào `model.predict(...)` / `model.track(...)` thay vì hardcode
4. `GET /models` — trả về list model objects có metadata:
   ```json
   [{ "name": "yolov8n", "label": "YOLOv8n General", "speed": "fast", "warning": null },
    { "name": "best",    "label": "Fish Detector",    "speed": "slow", "warning": "Heavier model, may take 2-3× longer" }]
   ```
   Metadata lưu trong `MODEL_META` dict trong `main.py` — **không cần đổi tên file `.pt`**, chỉ cần thêm entry vào dict khi thêm model mới
5. Đổi `_detect_video` sang `m.track(persist=True, tracker="bytetrack.yaml")`:
   - Response thêm `trackId: int` cho mỗi detection (từ `box.id`)
   - Adaptive sample interval: tính `duration = total_frames / fps`, chọn interval:
     - < 30s → 0.2s, 30s–3m → 0.5s, > 3m → 1.0s
   - Reset tracker state giữa mỗi request (track tự reset khi khởi tạo VideoCapture mới)
6. `DetectRequest` thêm `startTime: float = None`, `endTime: float = None` — dùng cho clip snapshot:
   - Nếu có range: chỉ process frames trong `[startTime, endTime]`, bỏ qua phần còn lại
   - Timestamp của detection vẫn là giây thực trong video gốc (không reset về 0)
7. Cross-class NMS vẫn giữ (`_cross_class_nms`, `iou=0.3`) — tracking không loại bỏ in-frame duplicate

**Backend Node.js — subtasks:**
1. `POST /media/:id/analyze` — nhận `{ model: string, confidence: number }`
   - Validate: `confidence` trong [0.1, 0.9], `model` trong whitelist
   - Set `analysisStatus: 'pending'`, `labels: []`
   - Enqueue Bull job với `{ mediaId, mimeType, userId, model, confidence }`
   - Trả 202
2. Bull worker `media.worker.js`: truyền `model` và `confidence` trong POST body đến YOLO service
3. `GET /media/models` — proxy đến YOLO service `GET /models`, trả list model objects có metadata
4. Tăng timeout Bull job: `{ attempts: 2, timeout: 300000 }` (5 phút) để xử lý video dài trên VPS

**Frontend — subtasks:**
1. Component `AIAnalyzePopover` trong TripDetailPage (inline, không tách file riêng)
2. State: `conf` (0.3), `model` ('yolov8n'), `isOpen`, `isRunning`
3. Fetch `GET /media/models` để biết models nào available (disabled nếu chỉ có 1)
4. Hiển thị `warning` badge màu vàng bên dưới tên model nếu `model.speed === 'slow'`
   - Ví dụ: ⚠ "Heavier model, may take 2-3× longer on CPU"
5. Submit → `POST /media/:id/analyze` → đóng popover → refetch media (SSE sẽ push khi xong)
6. Hiển thị `analysisStatus` + `updatedAt` trong popover footer

**Quy ước thêm model mới (không cần đổi tên file):**
```python
# Chỉ cần thêm vào MODEL_META trong main.py:
MODEL_META = {
  "yolov8n":          { "label": "YOLOv8n General",       "speed": "fast",  "warning": None },
  "fish1":            { "label": "Fish Detector v1",       "speed": "fast",  "warning": None },
  "fish2":            { "label": "Fish Detector v2",       "speed": "fast",  "warning": None },
  "trash":            { "label": "Trash Detector",         "speed": "fast",  "warning": None },
  "f4k_single_m":     { "label": "Fish Detector M (f4k)",  "speed": "slow",  "warning": "YOLOv8m — 2-3× slower on CPU" },
  "deepfish_multi_m": { "label": "DeepFish Multi M",       "speed": "slow",  "warning": "YOLOv8m — 2-3× slower on CPU" },
}
# Quy tắc đặt tên: suffix _m = YOLOv8m (nặng/chậm hơn), không có suffix = YOLOv8n (mặc định)
# Model không có trong dict → fallback: label = filename, speed = "unknown", warning = None
```

**Checklist sau TASK 6b-4:**
- [x] Bấm nút → popover mở với đúng giá trị mặc định
- [x] Kéo slider → confidence thay đổi real-time
- [~] Model không có file `.pt` → N/A: `/models` chỉ trả về model có file thực — không bao giờ hiện disabled model
- [x] Model `speed === 'slow'` → hiện warning badge vàng (xác nhận qua screenshot)
- [x] Bấm "Run Analysis" → `analysisStatus` chuyển `pending` → spinner xuất hiện
- [x] Sau vài giây → SSE push (`media_analysis_done`) → `useSSE.js` invalidate `['media']` → labels cập nhật
- [ ] Confidence 0.15 → detect nhiều hơn so với 0.3 (cần test thực tế)
- [ ] Confidence 0.7 → chỉ hiện detections rất chắc chắn (cần test thực tế)
- [ ] Video > 3m → interval tự chuyển sang 1.0s (cần video dài để test)

**Thay đổi so với kế hoạch:**
- `frameTime` đổi từ `round(sample_count * SAMPLE_INTERVAL, 1)` → `round(frame_idx / fps, 2)` — chính xác hơn, frontend handle được nhờ threshold 0.7s
- Upload không còn auto-analyze: `confirmUpload` → `analysisStatus: 'idle'`, không enqueue job
- `trackId` thêm vào media.model.js labels schema

---

### TASK 6b-3 — Evidence System (Photo Snapshot + Video Clip) ✅
**Mô tả:** Operator đang xem video, phát hiện vật thể quan trọng → chụp ảnh frame hoặc đánh dấu đoạn clip làm **bằng chứng (evidence)**. Có thể gọi YOLO phân tích riêng từng evidence — tránh phải analyze toàn bộ video dài. Evidence lưu collection riêng, không lẫn vào Media playlist.

**Hai loại evidence:**
| Loại | Lưu gì | YOLO | Xem lại |
|------|---------|------|---------|
| **Photo** | Canvas PNG → S3 (`imageS3Key`) | predict trên PNG | EvidenceViewer inline overlay + bbox |
| **Clip** | `{ startTime, endTime }` + thumbnail PNG (`thumbnailS3Key`) | track trên video gốc, chỉ frames trong range | EvidenceViewer: video constrained [t0,t1] + bbox |

**Schema `Snapshot` collection (thực tế):**
```
type: 'photo' | 'clip'
trip: ObjectId ref Trip
project: ObjectId ref Project
createdBy: ObjectId ref User
parentMediaId: ObjectId ref Media   ← video đang xem lúc tạo (KHÔNG phải parentVideoId)
imageS3Key: String                   ← photo: full-size PNG; null cho clip
imageTime: Number                    ← giây trong video (chỉ cho photo)
startTime: Number                    ← giây bắt đầu (clip); null cho photo
endTime: Number                      ← giây kết thúc (clip); null cho photo
thumbnailS3Key: String               ← clip thumbnail PNG; null cho photo
aiLabels: [{ name, confidence, bbox, frameTime, trackId }]
analysisStatus: 'idle' | 'pending' | 'done' | 'failed'
analysisMeta: { model, confidence, analyzedAt }
note: String
```
Index: `{ trip: 1, createdAt: -1 }`

**UI thực tế — Top overlay video:**
```
[filename]  [Detect/Hide] [Analyze⚙] [📷] [🎬] [Evidence N] [🎞 N/Hide]
```
- Khi đang ghi clip: nút 🎬 chuyển đỏ + `animate-pulse` + hiện `fmtVideoTime(clipStart)` (start time)
- Evidence N: pill badge click → mở EvidencePanel (mutually exclusive với playlist)

**UI — Evidence Panel (single column, matches Playlist ThumbVertical style):**
- Single column, `w-44`, `top-0 bottom-0`, `pt-[52px]` (tránh che button bar)
- `ThumbVertical`-style thumbnail: `aspect-video`, `border-2`, bottom timestamp label
- Top-left badge: `PHOTO` / `CLIP` (bg-white/15, không emoji)
- Top-right badge: AI label count khi done (emerald), `err` khi failed
- Hover actions: Sparkles (analyze), Download, X (delete)
- Ghost X button `absolute top-[54px] right-1.5`
- Click thumb → EvidenceViewer overlay (KHÔNG phải lightbox riêng)

**EvidenceViewer component (inline overlay z-30):**
- Photo: hiện `<img thumbnailUrl>` + `DetectionSVG` với tất cả aiLabels
- Clip: `<video>` với cùng presigned URL của parent media, constrained `[t0, t1]` qua `handleTimeUpdate`
- `onPlay` handler: nếu `currentTime >= t1 - 0.05` → seek về `t0` (restart clip)
- Controls: play/pause, seek bar (no transition-[width]), time display `elapsed/duration`, mute
- Detect toggle (same style as main video), Back button → `setActiveEvidence(null)`
- Khi EvidenceViewer active: `CustomVideoControls` ẩn, `MainMedia` click disabled

**Thay đổi so với kế hoạch ban đầu:**
- `parentVideoId` → `parentMediaId` (tên field thực tế trong DB)
- Photo lưu vào `imageS3Key` (full-size), không phải `thumbnailS3Key`
- Evidence Panel: single column (không phải grid 2 cột)
- "Lightbox" → `EvidenceViewer` inline overlay (đầy đủ hơn: có video play, bbox, controls)
- Clip counter: hiện start time + pulse (không phải live "0:15→0:28" counter)
- Body limit Express tăng lên `8mb` để handle base64 PNG

**Checklist sau TASK 6b-3:**
- [x] Bấm 📷 Photo khi video đang phát → PNG frame + thumbnail lưu DB + S3
- [x] Bbox overlay đang hiện → photo có bbox vẽ vào ảnh (canvas burn-in)
- [x] Bấm 🎬 Start → 🎬(đỏ) Stop → clip doc tạo với startTime/endTime + thumbnail
- [x] Start time + animate-pulse hiện khi đang ghi clip (thay vì live counter)
- [x] Evidence N badge cập nhật sau mỗi lần capture
- [x] Evidence Panel: single column ThumbVertical style, PHOTO/CLIP text badge
- [x] Click [Analyze] → spinner → sau vài giây labels hiện trên card (SSE)
- [x] Clip analyze: YOLO chỉ process frames trong range (startTime/endTime truyền qua)
- [x] Click photo/clip → EvidenceViewer overlay + bbox + Detect toggle
- [x] EvidenceViewer clip: constrain [t0,t1], onPlay seek về t0 nếu đã hết
- [x] Xóa evidence → biến khỏi panel + xóa S3 key
- [x] Evidence KHÔNG xuất hiện trong Media playlist (currentSnapshots filter theo parentMediaId)
- [x] Disabled capture khi không có video đang active (button chỉ render khi resolveType === 'video')
- [x] EvidenceViewer active → CustomVideoControls ẩn, main video click disabled
- [x] Playlist + Evidence panel: full height top-0→bottom-0, content pt-[52px] tránh che button bar

---

### TASK 6c — Video + Sensor Sync (2 mode) ✅

**Hai mode hoạt động:**

| Mode | Điều kiện | Trải nghiệm |
|------|-----------|-------------|
| **Video có Metadata** | Upload video + upload sensor CSV cùng trip, video có `recordedAt` được set | Chart scrubs real-time theo `currentTime` video — đường dọc di chuyển trên biểu đồ |
| **Video thường** | Chỉ upload video (không có sensor), hoặc video không có `recordedAt` | Playlist video hiển thị đơn/nhiều file, không sync chart, chart hiển thị độc lập |

**Cơ chế sync (Video có Metadata):**
- `media.recordedAt: Date` — thời điểm bắt đầu quay (operator nhập khi upload hoặc edit)
- Khi video phát: `chartTimestamp = recordedAt + currentTime_giây * 1000`
- Tìm reading gần nhất trong chartData theo `chartTimestamp`
- Vẽ vertical reference line (ReferenceLine) di chuyển theo `chartTimestamp`
- Chart không cần cuộn — chỉ highlight điểm đang active, tooltip tự hiện

**Cơ chế playlist (Video thường):**
- Media đã sort theo `order` field (backend trả đúng thứ tự)
- Vertical playlist (w-44, đã có) — click để chọn video
- Phát nối tiếp: `<video onEnded={() => setSelIdx(i+1)}>` khi hết video hiện tại
- Thumbnail sproject: hiện ảnh preview frame 1s, video/ảnh phân biệt bằng label
- Reorder: đã có drag-to-reorder trong TripList (ProjectDetailPage) — TripDetailPage không cần thêm

**Media model — thêm field (backend):**
```js
recordedAt: { type: Date, default: null }
// Thời điểm bắt đầu quay video, dùng để sync với SensorData.timestamp
// null = video thường (không sync)
```

**Backend — subtasks:**
1. Thêm field `recordedAt` vào `media.model.js`
2. `PATCH /media/:id` — cho phép update `recordedAt` (operator/admin)
3. `GET /media/trip/:tripId` đã có — đảm bảo sort theo `order` ASC

**Frontend — subtasks:**
1. **MediaUpload modal**: thêm input datetime-local để nhập `recordedAt` khi upload video (optional)
2. **TripDetailPage — Video có Metadata mode:**
   - `useRef` cho `<video>` element, listen `ontimeupdate`
   - Tính `chartTimestamp` từ `selectedMedia.recordedAt + currentTime`
   - Truyền `chartTimestamp` vào chart component → vẽ `<ReferenceLine x={chartTimestamp}>`
   - Dùng `referenceLineX` state, update mỗi `timeupdate` event
3. **TripDetailPage — Video thường mode:**
   - `<video onEnded>` → tự chuyển sang file tiếp theo trong playlist
   - Nếu không có video (chỉ ảnh): hiển thị ảnh full trong center column
4. **Edit recordedAt**: thêm input nhỏ trong TripDetailPage header hoặc trong playlist panel khi click thumbnail → có thể nhập/sửa `recordedAt` inline

**Checklist sau TASK 6c:**
- [x] Media model có field `recordedAt`, API `PATCH /media/:id` update được
- [x] Upload video → có thể nhập `recordedAt` (datetime) trong upload modal (optional, labeled "enables chart sync")
- [x] **Video thường**: nhiều video → phát nối tiếp khi hết video trước (`onEnded` auto-advance)
- [x] **Video thường**: 1 video → phát bình thường, chart hiển thị độc lập bên dưới
- [x] **Video có Metadata**: video phát → đường dọc đỏ trên chart di chuyển theo timestamp (`ReferenceLine`)
- [x] **Video có Metadata**: LIVE SYNC badge xuất hiện góc dưới trái video
- [x] Trip chỉ có sensor (không có media) → center column hiển thị empty state
- [x] Trip không có gì → toàn bộ empty state thân thiện
- [x] Playlist redesign: overlay từ phải thay vì pull-tab, toggle bằng pill button `🎞 N` trên top gradient
- [x] RecordedAtEditor inline trong playlist panel (dưới active video thumbnail)
- [x] Timezone bug fix: input nhập theo local time, display cũng hiển thị local time đúng
- [x] `colorScheme: 'dark'` trên datetime input trong playlist → calendar icon hiện đúng ở light mode
- [x] Test data file: `test-data/sensor-sample-full.csv` (60 readings, 2 anomaly spikes, GPS Đà Nẵng, đủ 12 cột kể cả voltage/battery/humidity)

**Lưu ý kỹ thuật:**
- `recordedAt` lưu UTC trong DB; `datetime-local` input dùng local time getters (`getHours()`, etc.) khi display
- Playlist là absolute overlay (không làm hẹp video), `translate-x-full` → `translate-x-0` animation
- Thumbnail có `recordedAt` hiện chấm đỏ nhỏ ở góc trên phải
- PNG export: SVG serialize + canvas (2x resolution), CSS var grid lines không render nhưng data lines OK

---

### TASK 6d — Multi-file Data Support + File List UI (Refactor)

**Mô tả:** Hiện tại sensor, DVL, sonar đều **overwrite** khi upload lần thứ 2 — chỉ giữ bản cuối. Cần đổi sang **append theo tên file**. Đồng thời ProjectDetailPage và TripDetailPage hiện chỉ hiển thị icon (Activity, Waves) để báo "có data" — cần chuyển sang **hiển thị danh sách file cụ thể** với tên file, số readings, timestamp, nút xóa từng file.

**Bối cảnh thực tế:** ROV tạo nhiều file trong 1 lần lặn:
```
sonar_20260601_164831.xxx      ← 1 file sonar
sonar_20260601_165204.xxx      ← file sonar thứ 2 (cùng trip)
log_20260609_144350.csv        ← sensor log đầu
log_20260609_144536.csv        ← sensor log thứ 2
dvl_20260609_144350.json       ← DVL data
record_20260609_144350.mp4     ← video (media, đã hỗ trợ nhiều ✓)
capture_20260609_144358.png    ← ảnh chụp (media ✓)
```
Timestamp trong tên file: `_YYYYMMDD_HHMMSS` → parse trực tiếp, không cần JSON manifest.

---

**⚠️ TRƯỚC KHI IMPLEMENT — ĐỌC BẮT BUỘC (theo thứ tự):**

Phải đọc kỹ các file sau trước khi viết bất kỳ dòng code nào:

**Backend:**
1. `backend/src/modules/sensor/sensor.model.js` — hiểu schema hiện tại (không có `sourceFile`)
2. `backend/src/modules/sensor/sensor.controller.js` — xác nhận dòng `SensorData.deleteMany({trip})` và logic `getSensorData` trả về gì
3. `backend/src/modules/dvl/dvl.model.js` — schema DVL (không có `sourceFile`)
4. `backend/src/modules/dvl/dvl.controller.js` — xem hàm upload và `getPath` hiện tại
5. `backend/src/modules/sonar/sonar.model.js` — schema SonarFile (đã có `filename`, `recordedAt`)
6. `backend/src/modules/sonar/sonar.controller.js` — xem logic upload và endpoint xóa
7. `backend/src/modules/trips/batch.controller.js` — tìm chỗ skip sonar file thứ 2
8. `backend/src/modules/trips/trip.service.js` — xác nhận hàm `remove` chỉ gọi `Trip.findByIdAndDelete` (KHÔNG cascade)
9. `backend/src/modules/projects/project.service.js` — xác nhận hàm `remove` chỉ xóa Trip docs, KHÔNG xóa SensorData/DVL/Sonar/Media

---

**⚠️ VẤN ĐỀ HIỆN TẠI — CẦN XỬ LÝ TRƯỚC KHI LÀM 6d-1:**

### A. Data cũ orphaned trong MongoDB (legacy schema)

MongoDB Atlas đang có documents trong collection `sensordatas` với field **`project`** thay vì `trip`. Đây là data từ phiên bản schema cũ (khi sensor link tới Project, không phải Trip). Các record này không bao giờ được tìm thấy bởi queries hiện tại (`{trip: tripId}`) — tức là **dead data**.

**Cách xóa** (chạy một lần trên MongoDB Atlas hoặc mongo shell):
```js
// Xóa toàn bộ SensorData cũ có field "project" (không có field "trip")
db.sensordatas.deleteMany({ project: { $exists: true }, trip: { $exists: false } })
```

**Kiểm tra trước khi xóa:**
```js
// Đếm số record orphaned
db.sensordatas.countDocuments({ project: { $exists: true }, trip: { $exists: false } })
// Xem thử 1 record
db.sensordatas.findOne({ project: { $exists: true }, trip: { $exists: false } })
```

### B. Cascade delete THIẾU — BUG LỚN (phải fix trong Phần 6d-0)

Hiện tại khi xóa Trip hoặc Project, dữ liệu liên quan KHÔNG được xóa theo:

| Hành động | Code hiện tại | Hậu quả |
|---|---|---|
| `DELETE /trips/:id` | `Trip.findByIdAndDelete(id)` | SensorData, DVLData, SonarFile, Media, Snapshots → **orphaned** |
| `DELETE /projects/:id` | `Trip.deleteMany({project})` + xóa Project | Trip docs xóa nhưng SensorData/DVL/Sonar/Media của chúng → **orphaned** |

**Fix phải làm trong `trip.service.js` hàm `remove`:**
```js
const remove = async (id) => {
  const SensorData = require('../sensor/sensor.model')
  const DVLData    = require('../dvl/dvl.model')
  const SonarFile  = require('../sonar/sonar.model')
  const Media      = require('../media/media.model')
  const Snapshot   = require('../snapshots/snapshot.model')
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3')
  const s3 = require('../../config/s3')
  const BUCKET = process.env.S3_BUCKET

  // Xóa S3 objects trước (sonar + media + snapshot images)
  const [sonarFiles, mediaFiles, snapshots] = await Promise.all([
    SonarFile.find({ trip: id }).lean(),
    Media.find({ trip: id }).lean(),
    Snapshot.find({ trip: id }).lean(),
  ])

  const s3Keys = [
    ...sonarFiles.map(f => f.s3Key),
    ...mediaFiles.map(m => m.s3Key).filter(Boolean),
    ...snapshots.map(s => s.imageS3Key).filter(Boolean),
    ...snapshots.map(s => s.thumbnailS3Key).filter(Boolean),
  ]
  await Promise.allSettled(
    s3Keys.map(Key => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key })))
  )

  // Xóa tất cả data liên quan
  await Promise.all([
    SensorData.deleteMany({ trip: id }),
    DVLData.deleteMany({ trip: id }),
    SonarFile.deleteMany({ trip: id }),
    Media.deleteMany({ trip: id }),
    Snapshot.deleteMany({ trip: id }),
  ])

  return Trip.findByIdAndDelete(id)
}
```

**Fix phải làm trong `project.service.js` hàm `remove`:**
```js
const remove = async (id) => {
  const trips = await Trip.find({ project: id }).lean()
  // Cascade delete từng trip (dùng lại hàm remove của trip.service để không duplicate logic)
  const tripService = require('../trips/trip.service')
  await Promise.all(trips.map(d => tripService.remove(d._id)))
  // Xóa project
  await Project.findByIdAndDelete(id)
  return { projectDeleted: true, tripsDeleted: trips.length }
}
```

**Lưu ý:** Đọc `snapshot.model.js` để biết đúng field name (`imageS3Key`, `thumbnailS3Key`) trước khi viết code xóa.

**Frontend:**
8. `frontend/src/features/trips/TripList.jsx` — đọc `TripCard` component, xác nhận dòng 122-131 chỉ hiện icon Activity/Waves, và phần expanded (dòng 209-216) chỉ có `<MediaGallery>`
9. `frontend/src/features/trips/TripDetailPage.jsx` — hiểu cấu trúc left column (LocationPanel + CurrentStatus)
10. `frontend/src/features/trips/components/ROVDataUpload.jsx` — xem warning "only the last one" dòng 663-677 và `ResultSummary`
11. `frontend/src/features/trips/components/layout/LocationPanel.jsx` — cấu trúc left panel

---

**Hiện trạng (đã xác nhận từ code):**

| Loại | Code overwrite | Hiển thị file list? |
|------|---------------|---------------------|
| Sensor CSV | `SensorData.deleteMany({trip})` dòng 62 sensor.controller.js | ❌ chỉ icon Activity + sensorCount |
| DVL JSON | `DVLData.deleteMany({trip})` trong dvl.controller.js | ❌ không hiển thị gì |
| Sonar | `SonarFile.deleteMany({trip})` trong sonar.controller.js | ❌ chỉ icon Waves + sonarCount |
| Media (video/ảnh) | Không xóa cũ | ✅ đã hỗ trợ nhiều, có MediaGallery |
| Batch controller | Chỉ lấy sonar file đầu tiên | ❌ cần bỏ hạn chế |

---

**Hướng UI — hiển thị danh sách file:**

**A. ProjectDetailPage — TripCard expanded section (`TripList.jsx`):**

Hiện tại phần expanded (dòng 209-216) chỉ có `<MediaGallery>`. Thêm section "DATA FILES" phía trên MediaGallery:

```
┌─────────────────────────────────────────────────────┐
│ DATA FILES                              [Upload ↑]  │
│ ─────────────────────────────────────────────────── │
│ [Activity] log_20260609_144350.csv  850r · 14:43   [×] │
│ [Activity] log_20260609_144536.csv  320r · 14:45   [×] │
│ [Radio]    dvl_20260609_144350.json   1.2k pts      [×] │
│ [Waves]    sonar_20260601_164831.sonar  234f · 6m22s [×] │
│ ─────────────────────────────────────────────────── │
│ (phần MediaGallery bên dưới như cũ)                 │
└─────────────────────────────────────────────────────┘
```

- Label loại: màu badge giống `TYPE` config trong `ROVDataUpload.jsx` (xanh dương=sensor, tím=DVL, cyan=sonar)
- Nút `[×]` chỉ hiện với `operator`/`admin`; gọi `DELETE /trips/:id/sensor-data?file=xxx`, `DELETE /trips/:id/dvl?file=xxx`, `DELETE /trips/:id/sonar/:sonarId`
- Upload button mở `ROVDataUpload` modal (đã có)
- Nếu không có data files → ẩn section (không hiện header "DATA FILES" trống)

**B. TripDetailPage — left column, dưới LocationPanel và CurrentStatus:**

Left column hiện tại: `LocationPanel` (map) + `CurrentStatus` (KPI cards). Thêm section "DATA FILES" ở dưới cùng:

```
┌──────────────────────────────┐
│ Location (map)               │
├──────────────────────────────┤
│ Current Status (KPI cards)   │
├──────────────────────────────┤
│ DATA FILES               [▼] │  ← collapsible, mặc định collapsed
│ ──────────────────────────── │
│ [A] log_xxx.csv  850r 14:43 [×] │
│ [R] dvl_xxx.json  1.2k  [×]  │
│ [W] sonar_xxx  234f 6m  [×]  │
└──────────────────────────────┘
```

- Width phải vừa w-56 (224px): icon nhỏ (10px), tên file truncate, số gọn
- Collapsible: click header → toggle, mặc định expanded nếu có file
- Scroll nội bộ nếu nhiều file (max-h-40 overflow-y-auto)
- Nút `[×]` xóa file, invalidate queries liên quan
- Khi xóa sensor file: chart tự refresh → gap visualization cập nhật đúng

**API mới cần thêm — `GET /trips/:id/data-files`:**

Trả về danh sách file metadata của 1 trip trong 1 request:
```json
{
  "sensor": [
    { "sourceFile": "log_20260609_144350.csv", "count": 850, "recordedAt": "2026-06-09T14:43:50Z" },
    { "sourceFile": "log_20260609_144536.csv", "count": 320, "recordedAt": "2026-06-09T14:45:36Z" }
  ],
  "dvl": [
    { "sourceFile": "dvl_20260609_144350.json", "count": 1203, "recordedAt": "2026-06-09T14:43:50Z" }
  ],
  "sonar": [
    { "_id": "...", "filename": "sonar_20260601_164831.sonar", "frameCount": 234, "durationMs": 382000, "recordedAt": "2026-06-01T16:48:31Z" }
  ]
}
```
- `sensor`: `SensorData.aggregate([{$match:{trip}},{$group:{_id:'$sourceFile',count:{$sum:1},recordedAt:{$min:'$timestamp'}}}])`
- `dvl`: tương tự aggregate trên `DVLData`
- `sonar`: `SonarFile.find({trip}).lean()`

---

**Shared utility (tạo mới):**

`backend/src/utils/parseTimestamp.util.js`:
```js
// Parse "_YYYYMMDD_HHMMSS" từ tên file → UTC Date, null nếu không match
function parseTimestampFromFilename(filename) {
  const m = filename.match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
}
module.exports = { parseTimestampFromFilename };
```

---

## Phân chia subtask

### Phần 6d-0 — Cascade delete + Cleanup orphaned data (làm TRƯỚC tất cả)

**Đọc trước:** `trip.service.js`, `project.service.js`, `snapshot.model.js`, `media.model.js`

**Làm:**
1. **Xóa orphaned data cũ trên MongoDB Atlas** — chạy 1 lần trong shell hoặc Atlas UI:
   ```js
   // Kiểm tra số lượng trước
   db.sensordatas.countDocuments({ project: { $exists: true }, trip: { $exists: false } })
   // Xóa nếu count > 0
   db.sensordatas.deleteMany({ project: { $exists: true }, trip: { $exists: false } })
   ```
2. **`trip.service.js` hàm `remove`**: thêm cascade xóa SensorData, DVLData, SonarFile, Media (S3 + DB), Snapshots (S3 + DB) trước khi xóa Trip doc — đọc code mẫu ở mục "B" phía trên
3. **`project.service.js` hàm `remove`**: thay `Trip.deleteMany({project:id})` bằng loop gọi `tripService.remove()` để tận dụng cascade — đọc code mẫu ở mục "B" phía trên

**Kiểm tra sau phần này:**
- [ ] `db.sensordatas.countDocuments({ project: { $exists: true }, trip: { $exists: false } })` trả về 0
- [ ] Xóa 1 trip có sensor data → `sensordatas`, `dvldatas`, `sonarfiles` của trip đó đều biến mất khỏi DB
- [ ] Xóa 1 trip có media → file trên S3 bị xóa, `media` docs biến mất khỏi DB
- [ ] Xóa 1 trip có snapshot → `imageS3Key`/`thumbnailS3Key` trên S3 bị xóa, snapshot docs biến mất
- [ ] Xóa 1 project có 3 trips → tất cả 3 trips và toàn bộ data của chúng bị xóa sạch
- [ ] Xóa project/trip không có data → không crash

---

### Phần 6d-1 — Backend: SensorData multi-file + API data-files

**Đọc trước:** `sensor.model.js`, `sensor.controller.js`

**Làm:**
1. Tạo `backend/src/utils/parseTimestamp.util.js`
2. `sensor.model.js`: thêm `sourceFile: { type: String, default: null }`, index `{ trip:1, sourceFile:1, timestamp:1 }`
3. `sensor.controller.js` — hàm `upload`:
   - Nhận `sourceFile` từ `req.body.sourceFile` (tên file gốc, truyền từ frontend)
   - Nếu `sourceFile` đã có trong trip → xóa data cũ của file đó, insert mới (re-upload)
   - Nếu `sourceFile` mới → kiểm tra overlap (logic first-in-first-keep bên dưới) trước khi insert
   - Gán `sourceFile` vào mỗi doc khi insert
   - Bỏ `SensorData.deleteMany({trip})` — KHÔNG xóa toàn bộ nữa
4. `sensor.controller.js` — thêm hàm `clearFile`: xóa `SensorData` theo `{trip, sourceFile}`, cập nhật `sensorCount`
5. `sensor.controller.js` — hàm `clear` (xóa hết): giữ nguyên
6. `sensor.routes.js`: thêm `DELETE /trips/:id/sensor-data?file=...` → `clearFile`
7. `sensor.controller.js` — hàm `getSensorData`: trả thêm field `sourceFile` trong mỗi reading
8. Tạo `GET /trips/:id/data-files` endpoint (trong trips.routes.js hoặc module mới) trả aggregate sensor + DVL + sonar

**Logic overlap (first-in-first-keep):**
```js
// Lấy max timestamp đang có trong DB (tất cả sourceFiles của trip này)
const agg = await SensorData.aggregate([
  { $match: { trip: new mongoose.Types.ObjectId(tripId) } },
  { $group: { _id: null, maxTs: { $max: '$timestamp' } } }
])
const maxTs = agg[0]?.maxTs ?? null

const trimmed = maxTs
  ? docs.filter(d => d.timestamp > maxTs)
  : docs
const droppedCount = docs.length - trimmed.length

// warning phân loại:
// droppedCount > 0 && trimmed.length > 0 → { warning: 'overlap_trimmed', droppedCount }
// droppedCount > 0 && trimmed.length === 0 → { warning: 'file_skipped', droppedCount }
// droppedCount === 0 → không có warning field
```

**Kiểm tra sau phần này:**
- [ ] `SensorData` document có field `sourceFile` trong MongoDB (kiểm tra Atlas)
- [ ] Upload CSV với `sourceFile: "log_A.csv"` → DB có readings với sourceFile="log_A.csv"
- [ ] Upload CSV với `sourceFile: "log_B.csv"` → DB có thêm readings, file A không bị xóa
- [ ] Upload lại "log_A.csv" → DB thay thế đúng data của log_A, log_B không đổi
- [ ] Upload file trùng timestamp với A → response có `warning: 'overlap_trimmed'` và `droppedCount`
- [ ] Upload file nằm hoàn toàn trong range cũ → response có `warning: 'file_skipped'`
- [ ] `DELETE /trips/:id/sensor-data?file=log_A.csv` → xóa đúng data của log_A, log_B còn nguyên
- [ ] `GET /trips/:id/data-files` trả đúng array sensor files với count và recordedAt
- [ ] `GET /trips/:id/sensor-data` response mỗi reading có field `sourceFile`

---

### Phần 6d-2 — Backend: DVL + Sonar + Batch multi-file

**Đọc trước:** `dvl.model.js`, `dvl.controller.js`, `sonar.model.js`, `sonar.controller.js`, `batch.controller.js`

**Làm:**
1. `dvl.model.js`: thêm `sourceFile: { type: String, default: null }`, index `{ trip:1, sourceFile:1, ts:1 }`
2. `dvl.controller.js` — hàm upload:
   - Nhận `sourceFile` từ request
   - Nếu sourceFile đã tồn tại → `DVLData.deleteMany({trip, sourceFile})` trước, rồi insert mới
   - Nếu sourceFile mới → insert thẳng (DVL không cần overlap check — GPS track không có khái niệm overwrite theo time)
   - Gán `sourceFile` cho mỗi point
3. `dvl.controller.js` — hàm `getPath`: query `DVLData.find({trip}).sort({ts:1})` — không đổi nhiều vì đã sort, nhưng cần xác nhận merge đúng khi nhiều file
4. `dvl.controller.js` — thêm `clearFile`: xóa theo `{trip, sourceFile}`; route `DELETE /trips/:id/dvl?file=...`
5. `sonar.controller.js` — hàm upload:
   - Bỏ `SonarFile.deleteMany({trip})` và bỏ xóa S3 cũ trước khi tạo
   - Parse `recordedAt` từ tên file bằng `parseTimestampFromFilename` nếu chưa có
   - `sonarCount` không hardcode = 1 nữa; sau upload: `trip.sonarCount = await SonarFile.countDocuments({trip})`
6. `batch.controller.js`: bỏ logic skip sonar file thứ 2 trở đi; với sensor/DVL: truyền `sourceFile` (tên file gốc) khi gọi controller

**Kiểm tra sau phần này:**
- [ ] Upload 2 DVL file → DB có 2 `sourceFile` khác nhau, `getPath` trả trajectory merge sort theo `ts`
- [ ] Upload lại DVL file cũ cùng tên → thay thế đúng, file kia không đổi
- [ ] Upload 2 sonar file → cả 2 trong DB, `sonarCount = 2`
- [ ] Upload lại sonar file → không tạo duplicate (check theo filename)
- [ ] Batch upload folder có 2 sonar file → cả 2 được xử lý (không bỏ file thứ 2)
- [ ] `GET /trips/:id/data-files` trả đúng cả DVL files và sonar files
- [ ] `sonar.recordedAt` được auto-parse từ tên file khi upload

---

### Phần 6d-3 — Backend: Media auto-parse `recordedAt`

**Đọc trước:** controller confirm upload media trong `backend/src/modules/media/media.controller.js`

**Làm:**
1. Trong hàm `confirmUpload` (hoặc tương đương): sau khi set `media.status = 'ready'`, gọi `parseTimestampFromFilename(media.originalName)` → nếu có result → set `media.recordedAt = result`
2. Nếu không match → `recordedAt` giữ null (không ghi đè giá trị đã nhập tay)

**Kiểm tra sau phần này:**
- [ ] Upload `record_20260609_144350.mp4` → kiểm tra DB: `media.recordedAt = 2026-06-09T14:43:50.000Z`
- [ ] Upload `capture_20260609_144358.png` → `media.recordedAt = 2026-06-09T14:43:58.000Z`
- [ ] Upload `myvideo.mp4` (không có pattern) → `media.recordedAt = null`, không crash
- [ ] Upload `log_20260609_144350.csv` (sensor, không phải media) → không ảnh hưởng

---

### Phần 6d-4 — Frontend: File list trong ProjectDetailPage và TripDetailPage

**Đọc trước:** `TripList.jsx` (dòng 56-220), `TripDetailPage.jsx` (cấu trúc left column), `LocationPanel.jsx`

**Làm:**

**A. TripList.jsx — TripCard expanded section:**
- Thêm query `GET /trips/:id/data-files` trong `TripCard` component (chỉ fetch khi `expanded = true`)
- Thêm `DataFilesSection` component (inline trong file, không tách):
  - Hiển thị danh sách file theo loại (sensor, DVL, sonar) với icon + badge màu
  - Mỗi file: icon type, tên file truncate, count/stats, timestamp HH:MM (từ `recordedAt`), nút `×` (operator/admin)
  - Nút `×` gọi đúng endpoint xóa → invalidate `['data-files', trip._id]` và `['sensor', trip._id]`
  - Nếu không có file nào → ẩn section, không render
  - Đặt section này TRƯỚC `<MediaGallery>` trong expanded, có separator `<hr>`
- Xóa warning cũ "only the last one will be saved" (dòng 663-677 trong `ROVDataUpload.jsx`)

**B. TripDetailPage.jsx — left column:**
- Thêm `DataFilesPanel` component (inline hoặc trong `components/layout/`):
  - Đặt sau `<CurrentStatus>` trong left column
  - Header "DATA FILES" với chevron toggle (mặc định expanded nếu có ít nhất 1 file)
  - Compact: icon 10px, tên file truncate (`max-w-[120px]`), số readings/frames gọn (`850r`, `234f`, `1.2k`)
  - Scroll nội bộ: `max-h-32 overflow-y-auto` nếu nhiều file
  - Nút `×` per-file, xóa và invalidate `['sensor', id]`, `['dvl-path', id]`, `['sonar', id]`, `['data-files', id]`
  - Không hiển thị section nếu không có file nào

**Query key mới:** `['data-files', tripId]` → `GET /trips/:tripId/data-files`, staleTime: 30000

**Kiểm tra sau phần này:**
- [ ] ProjectDetailPage → expand TripCard có sensor data → thấy danh sách file tên cụ thể (không chỉ icon)
- [ ] Xóa file từ TripCard → file biến khỏi list, chart/data cập nhật
- [ ] TripDetailPage → left column dưới Current Status → thấy DATA FILES section với file list
- [ ] TripDetailPage → click `×` xóa sensor file → chart bên dưới tự refresh
- [ ] Không có data files → cả 2 section đều ẩn (không render header trống)
- [ ] Viewer (role viewer) không thấy nút `×` (operator/admin only)
- [ ] Warning cũ "only the last one will be saved" đã xóa khỏi `ROVDataUpload.jsx`

---

### Phần 6d-5 — Frontend: Chart gap visualization + Sonar playlist

**Đọc trước:** `TripDetailPage.jsx` phần chart (BottomChart), `SonarViewer.jsx`

**Làm:**

**A. Sensor chart gap (TripDetailPage.jsx):**
- `useMemo`: `insertGapSentinels(readings)` chèn null sentinel tại ranh giới `sourceFile` thay đổi
- Truyền mảng đã xử lý vào `<BottomChart chartData={...}>` thay vì mảng raw
- `BottomChart` cần `connectNulls={false}` (default AreaChart — xác nhận không có override)
- Tooltip: thêm `sourceFile` vào label nếu có

```js
// useMemo trong TripDetailPage
const chartDataWithGaps = useMemo(() => {
  if (!sensorData?.data?.length) return []
  const readings = sensorData.data
  if (readings.length < 2) return readings
  const result = [readings[0]]
  for (let i = 1; i < readings.length; i++) {
    if (readings[i].sourceFile !== readings[i-1].sourceFile) {
      result.push({ timestamp: readings[i-1].timestamp + 1 })
      result.push({ timestamp: readings[i].timestamp - 1 })
    }
    result.push(readings[i])
  }
  return result
}, [sensorData?.data])
```

**B. Sonar playlist (SonarViewer.jsx):**
- Nhận prop `sonarFiles: []` (array từ `GET /trips/:id/data-files` → `sonar` field)
- Nếu `sonarFiles.length <= 1` → behavior như cũ (load file duy nhất)
- Nếu `sonarFiles.length > 1` → hiện thanh danh sách bên trên viewer: filename + duration, click để chọn
- State `selectedSonarId` = id của file đang active
- Active file có border highlight

**Kiểm tra sau phần này:**
- [ ] Upload 2 CSV → chart hiện 2 đoạn rời, gap giữa 2 file trống (line break, không nối)
- [ ] Readings cùng 1 file dù cách nhau về thời gian → vẫn nối liền (không gap sai)
- [ ] Gap dựa trên `sourceFile` thay đổi, không phải time gap
- [ ] Upload 1 CSV → chart bình thường, không có gap thừa
- [ ] Sonar: 1 file → SonarViewer như cũ
- [ ] Sonar: 2 file → có danh sách trên cùng, click file nào load file đó

---

**Checklist tổng sau TASK 6d:**
- [ ] Upload 2 CSV cùng 1 trip → chart hiển thị 2 đoạn rời, gap đúng chỗ
- [ ] Gap dựa theo sourceFile (không phải time heuristic)
- [ ] Readings cùng 1 file dù cách xa thời gian → nối liền
- [ ] Upload file trùng 1 phần → toast vàng + droppedCount
- [ ] Upload file nằm hoàn toàn trong range cũ → toast vàng "file bị bỏ qua"
- [ ] Không có overlap → toast xanh
- [ ] Upload lại file cùng tên → thay thế đúng file đó
- [ ] Xóa từng file sensor → data biến mất, file còn lại không đổi
- [ ] Upload 2 sonar → playlist sonar hiện 2 file, click chọn được
- [ ] Upload 2 DVL → trajectory merge liên tục
- [ ] Upload `record_20260609_144350.mp4` → `media.recordedAt` auto-set
- [ ] Upload `log_20260609_144350.csv` → chart sync với video cùng timestamp (không cần nhập tay)
- [ ] File không có pattern timestamp → `recordedAt = null`, không crash
- [ ] Batch upload nhiều sonar → tất cả được lưu
- [ ] ProjectDetailPage TripCard expanded: thấy tên file cụ thể (không chỉ icon)
- [ ] TripDetailPage left column: DATA FILES section với per-file delete
- [ ] Xóa file từ TripDetailPage → chart refresh ngay

---

### TASK 6e — Auto-frame Brush theo Video đang chọn

**Mô tả:** Khi user chọn video trong playlist, thanh brush (range selector) ở dưới chart tự động nhảy đến khoảng thời gian của video đó. Kết hợp với TASK 6d (auto-parse `recordedAt` từ tên file) và TASK 6c (chart sync) tạo thành trải nghiệm hoàn chỉnh: chọn video → brush frame đúng khoảng → ReferenceLine chạy trong đó.

**Điều kiện tiên quyết:** TASK 6d phải xong (media có `recordedAt` auto-parse từ tên file).

**Dữ liệu cần:**
- `media.recordedAt` — thời điểm bắt đầu quay (ms UTC)
- `media.duration` — độ dài video (giây, đã có trong Media model)
- `chartData[]` — mảng readings có `.timestamp` (ms), đã sort tăng dần
- Recharts `<Brush startIndex endIndex>` — controlled mode

**Thuật toán:**
```js
function computeBrushRange(selectedMedia, chartData) {
  if (!selectedMedia?.recordedAt || chartData.length === 0) return null

  const videoStart = new Date(selectedMedia.recordedAt).getTime()
  const videoEnd   = videoStart + (selectedMedia.duration ?? 120) * 1000

  const startIdx = chartData.findIndex(d => d.timestamp >= videoStart)
  const endIdx   = chartData.findLastIndex(d => d.timestamp <= videoEnd)

  // Video nằm hoàn toàn ngoài sensor data → show full range
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return null

  // Thêm 10% buffer 2 bên để có context, tối thiểu 3 readings
  const buf = Math.max(Math.floor((endIdx - startIdx) * 0.1), 3)
  return {
    startIndex: Math.max(0, startIdx - buf),
    endIndex:   Math.min(chartData.length - 1, endIdx + buf),
  }
}
```

**Hành vi:**
- Chọn video → brush auto-frame ngay lập tức (không animate chậm)
- User kéo brush tay → state `userOverride = true` → auto-frame không còn chạy cho video đó
- Chọn video khác → reset `userOverride`, auto-frame lại cho video mới
- Video không có `recordedAt` → brush không đổi (giữ nguyên vị trí hiện tại)
- Video nằm ngoài sensor data → brush về full range

**Implementation — 3 chỗ thay đổi:**

**1. `TripDetailPage.jsx`:**
```js
const [brushRange, setBrushRange] = useState(null)          // null = full range
const [brushUserOverride, setBrushUserOverride] = useState(false)

// Recompute khi đổi video
useEffect(() => {
  setBrushUserOverride(false)
  setBrushRange(computeBrushRange(selectedMedia, chartData))
}, [selectedMedia?._id])

// Spread vào BottomChart
<BottomChart
  brushRange={brushRange}
  onBrushChange={(range) => {
    setBrushUserOverride(true)
    setBrushRange(range)
  }}
  ...
/>
```

**2. `BottomChart.jsx`:**
```js
// Nhận props
const { brushRange, onBrushChange } = props

// Spread vào mỗi <Brush>:
<Brush
  {...brushProps}
  startIndex={brushRange?.startIndex}   // undefined = full range
  endIndex={brushRange?.endIndex}
  onChange={onBrushChange}
/>
```

**3. Không cần đổi backend gì.**

**Checklist sau TASK 6e:**
- [ ] Chọn `record_144350.mp4` → brush nhảy đến ~14:43-14:47 ngay lập tức
- [ ] Chọn `record_144536.mp4` → brush nhảy sang ~14:45-14:49
- [ ] Video không có `recordedAt` → brush không thay đổi
- [ ] User kéo brush tay → brush không bị reset khi video vẫn đang phát
- [ ] Chọn video khác sau khi đã kéo tay → auto-frame lại đúng video mới
- [ ] Video nằm ngoài range sensor data → brush về full range, không crash
- [ ] ReferenceLine vẫn scrub đúng trong khoảng brush đã frame
- [ ] Khi không có `recordedAt` trên bất kỳ video nào → brush hoạt động như cũ (full range, kéo tay)

---

### TASK 7 — Polish trước bảo vệ
**Subtasks:**
1. Responsive mobile (375px, 768px) — tất cả trang
2. Empty states đẹp cho tất cả list
3. Skeleton loading nhất quán
4. Error boundary toàn app + 404 page
5. Form validation đầy đủ (required, min/max)
6. Sidebar highlight đúng route hiện tại

---

### TASK 8 — Email Notifications (nâng cao)
**Mô tả:** Gửi email khi project hoàn tất, trip failed. Chạy qua Bull Queue (đã có từ TASK 3) — không block request.

**Subtasks:**
1. Cài `npm i nodemailer`
2. Config Gmail SMTP trong `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
3. `email.service.js`: template HTML đơn giản, hàm `sendTripFailed(user, trip)` + `sendProjectCompleted(user, project)`
4. Enqueue email job vào Bull queue `email` tại: trip `failed`, project `completed`
5. Bull worker xử lý gửi — retry 3 lần nếu thất bại

---

## Quy trình sau mỗi TASK

1. Đọc lại toàn bộ code vừa viết — kiểm tra null checks, edge cases
2. Chạy qua toàn bộ checklist của task đó
3. Liệt kê điểm nào khác với kế hoạch ban đầu
4. Tinh chỉnh từng điểm một
5. **Yêu cầu user chụp screenshot** các màn hình quan trọng để confirm trước khi sang task tiếp

---

## Phân quyền chi tiết (RBAC)

| Tính năng | admin | operator | viewer |
|-----------|-------|----------|--------|
| Quản lý user | ✅ | ❌ | ❌ |
| CRUD ROV | ✅ | Tạo/Sửa | Chỉ xem |
| CRUD Project/Trip | ✅ | Tạo/Sửa | Chỉ xem |
| Upload media | ✅ | ✅ | ❌ |
| Xóa media (bulk) | ✅ | ❌ | ❌ |
| Xem media | ✅ | ✅ | ✅ |
| Export CSV/PDF | ✅ | ✅ | ❌ |
| Upload sensor data | ❌ | ✅ | ❌ |
| Xem audit log | ✅ | ❌ | ❌ |
| Generate AI summary | ✅ | ✅ | ❌ |

---

## MongoDB Indexes cần thêm

```js
// Đã cần ngay
ROV:  { status: 1 }, { createdAt: -1 }
Project: { status: 1 }, { createdAt: -1 }, { rov: 1 }, { startTime: -1 }
Trip: { status: 1 }, { project: 1 }, { createdAt: -1 }
User: { email: 1 } (unique, đã có), { role: 1 }

// Cần khi làm sensor data
SensorData: { trip: 1, timestamp: -1 }

// Cần khi làm notifications
Notification: { userId: 1, isRead: 1, createdAt: -1 }
```

---

## Redis — kế hoạch sử dụng

| Tính năng | Key pattern | TTL | Task |
|-----------|-------------|-----|------|
| Refresh token blacklist | `blacklist:{token}` | 7 ngày | TASK 2 |
| Rate limit `/auth/*` | tự quản lý bởi `rate-limit-redis` | 15 phút | TASK 2 |
| Bull queue: ai-summary | tự quản lý bởi Bull | — | TASK 3 |
| Bull queue: email | tự quản lý bởi Bull | — | TASK 8 |

> Cache GET /rovs, /projects có thể thêm sau nếu cần tối ưu perf — chưa ưu tiên.

---

## Biến môi trường (.env đầy đủ)

```env
NODE_ENV=development
PORT=5000

MONGODB_URI=...
JWT_SECRET=...
JWT_REFRESH_SECRET=...

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-southeast-1
S3_BUCKET=...

REDIS_URL=redis://localhost:6379

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/google/callback

GEMINI_API_KEY=...          # Google AI Studio — free tier

YOLO_SERVICE_URL=http://localhost:8000  # Python FastAPI microservice

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

CLIENT_URL=http://localhost:5173
```

---

## Deployment Architecture

```
Vercel (free)          →  Frontend React (deploy từ git push, CDN tự động)
MongoDB Atlas (free)   →  Database (512MB, đủ cho đồ án)
AWS S3 (pay-per-use)   →  Media files (gần $0 với demo traffic)
                                  ↕
          VPS Contabo ~$6/tháng (4GB RAM)
          ├── nginx          :80/:443   reverse proxy + serve static fallback
          ├── node-backend   :5000      Express API + Bull workers
          ├── yolo-service   :8000      FastAPI + YOLOv8n
          └── redis          :6379      ~30MB RAM, token blacklist + Bull queue
```

**Lý do chọn VPS thay vì nhiều cloud service:**
- Redis chạy local trên VPS: latency ~0.1ms, ~30MB RAM (không cần Upstash)
- YOLOv8n cần ~1-1.5GB RAM để inference — không có free tier nào đủ
- 1 `docker compose up` chạy hết, dễ debug và demo

**docker-compose.yml** (production):
```yaml
services:
  backend:   build: ./backend,   env_file: .env, depends_on: [redis]
  yolo:      build: ./yolo-service, ports: ["8000:8000"]
  redis:     image: redis:alpine, restart: always
  nginx:     image: nginx:alpine, ports: ["80:80","443:443"]
```

**Biến môi trường production** — đổi so với local:
```
REDIS_URL=redis://redis:6379        # tên service trong Docker network
YOLO_SERVICE_URL=http://yolo:8000   # internal Docker network
CLIENT_URL=https://your-domain.vercel.app
```

---

## Chạy local
```bash
# Redis (nếu cần, dùng Docker)
docker run -d -p 6379:6379 redis:alpine

cd backend && npm run dev    # port 5000
cd frontend && npm run dev   # port 5173
```

## Test accounts
```
admin@rov.local    / Admin@123
operator@rov.local / Operator@123
viewer@rov.local   / Viewer@123
```
Seed: `cd backend && node src/scripts/seed.js`

---

## Dark Mode + Design Token System

**Đã hoàn thành — áp dụng toàn bộ frontend.**

### Cách hoạt động
- `tailwind.config.js`: `darkMode: 'class'` + semantic color tokens dùng CSS variable references
- `frontend/src/index.css`: CSS variables trong `:root` (light) và `.dark` (dark)
- `frontend/src/store/theme.store.js`: Zustand `persist` với key `rov-theme`
- `frontend/src/main.jsx`: anti-flash script (đọc localStorage trước React render) + `ThemeSync` component

### Design tokens (Tailwind class → CSS var)
| Token | Light | Dark |
|-------|-------|------|
| `bg-background` | gray-50 | gray-900 |
| `bg-card` | white | gray-800 |
| `text-foreground` | gray-900 | gray-50 |
| `text-muted-foreground` | gray-500 | gray-400 |
| `border-border` | gray-200 | gray-700 |
| `bg-muted` | gray-100 | gray-700 |
| `bg-primary` | blue-600 | blue-500 |
| `bg-destructive` | red-600 | red-500 |

### Quy tắc khi thêm UI mới
- **Container/card**: `bg-card border border-border rounded-xl`
- **Input/select**: `border border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring`
- **Button primary**: `bg-primary text-primary-foreground hover:bg-primary/90`
- **Button danger**: `bg-destructive text-destructive-foreground hover:bg-destructive/90`
- **Status badge**: thêm `dark:bg-{color}-900/40 dark:text-{color}-300` variants
- **Charts (Recharts)**: KHÔNG dùng CSS var cho màu fill — import từ `@/lib/chartColors.js`
- **CartesianGrid stroke**: `'rgb(var(--border))'`

---

## Lưu ý kỹ thuật quan trọng

**Backend:**
- LUÔN dùng `return success(res, data)` — không dùng `res.json()` trực tiếp
- Bulk routes (`/bulk/...`) phải đặt TRƯỚC `/:id` trong Express router
- Controller không chứa business logic — chuyển hết sang service
- Mỗi module: `model.js` + `routes.js` + `controller.js` + `service.js`
- Đăng ký module mới trong `backend/src/app.js`

**Frontend:**
- Query result: `result` = `{ success, message, data }` → payload = `result.data`
- Array từ paginated: `result.data.data` | Users: `result.data.users`
- Thêm route: `frontend/src/router/index.jsx`
- Dashboard dùng `staleTime: 0` — các trang khác `staleTime: 30000`
- Khi gọi AI hoặc operation chậm: luôn có loading state, disable button khi pending

**User model (đã cập nhật):**
- `password` optional (Google user không có password)
- `googleId`, `authProvider` đã thêm
- `comparePassword()` kiểm tra authProvider trước khi so sánh

---

## Đặt tên khái niệm (Nomenclature)

| Tên mới (code) | Tên cũ (code) | Ý nghĩa thực tế |
|---|---|---|
| **Project** | Trip | Chuyến khảo sát lớn — container ngoài cùng, gom nhiều Trip |
| **Trip** | Dive | Một lần lặn/recording session cụ thể |

**Lý do đổi tên:** Thầy hướng dẫn yêu cầu dùng Project/Trip thay vì Trip/Dive để phù hợp với terminology chuẩn của ROV operation.

**Mapping API:**
- `GET /api/v1/projects` (cũ: `/trips`) — danh sách project
- `GET /api/v1/trips` (cũ: `/dives`) — danh sách trip (recording sessions)
- `POST /api/v1/projects/:id/trips` (cũ: `/trips/:id/dives`) — tạo trip trong project

**MongoDB collections:**
- `projects` (cũ: `trips`)
- `trips` (cũ: `dives`)

**Lưu ý migration:** Khi đổi tên, data cũ trên MongoDB Atlas vẫn nằm trong collections `trips` (cũ) và `dives` (cũ). Cần chạy migration hoặc re-seed.

---

## TASK 8 — trip_master.json Manifest Support

ROV xuất file `trip_master.json` đặt ở root thư mục trip khi kết thúc lặn. File này chứa metadata chính xác về từng recording session — timestamp tuyệt đối, loại file, trạng thái kết nối.

---

### Schema thực tế (`trip_master.json`)

**Cấu trúc thư mục ROV — file naming KHÔNG thay đổi so với trước:**
```
trip_20260623_112136/
├── trip_master.json               ← manifest (MỚI)
├── Camera/
│   ├── record_20260623_112414.mp4
│   └── record_20260623_113402.mp4
├── Sensors/
│   ├── log_20260623_112136.csv    ← naming giống cũ
│   └── log_20260623_112414.csv
├── DVL/
│   └── DVL_20260623_112414.json   ← naming giống cũ (DVL_*.json)
├── Sonar/
│   └── sonar_20260623_112414.sonar ← naming giống cũ (sonar_*.sonar)
└── Snapshots/
    └── capture_20260623_113445.png ← MỚI: in-dive auto-snapshot
```

**Batch upload (ZIP) hiện tại đã xử lý đúng tất cả file trên** vì ZIP extraction strip subfolder trước khi classify — `DVL_*.json`, `sonar_*.sonar`, `log_*.csv` đều match classifier hiện tại. Chỉ `trip_master.json` rơi vào `unknown`.

**Schema đầy đủ:**
```json
{
  "schema_version": "1.0",
  "trip": {
    "trip_id": "trip_20260623_112136",
    "vehicle": "ROV_01",
    "created_at": "2026-06-23T04:21:36.0546184Z",
    "status": "completed",
    "integrity": "full",
    "total_duration_ms": 61998
  },
  "recording_config": {
    "video_enabled": true,
    "sonar_enabled": true,
    "dvl_enabled": true,
    "log_enabled": true
  },
  "sessions": [
    {
      "session_id": "session_20260623_112136",
      "start_ms": 0,
      "end_ms": 5578,
      "duration_ms": 5578,
      "status": "completed",
      "assets": [
        {
          "asset_id": "sns_001",
          "type": "sensor_csv",
          "device": "imu_depth_sensor",
          "file": "Sensors/log_20260623_112136.csv",
          "start_ms": 0,
          "end_ms": 5578,
          "status": "completed"
        }
      ],
      "events": [
        { "timestamp_ms": 8, "event": "session_start" },
        { "timestamp_ms": 5581, "event": "session_stop" }
      ]
    },
    {
      "session_id": "session_20260623_112414",
      "start_ms": 0,
      "end_ms": 10755,
      "duration_ms": 10755,
      "status": "completed",
      "assets": [
        {
          "asset_id": "vid_001",
          "type": "video",
          "device": "front_camera",
          "file": "Camera/record_20260623_112414.mp4",
          "start_ms": 9,
          "end_ms": 10755,
          "status": "completed"
        },
        {
          "asset_id": "sns_002",
          "type": "sensor_csv",
          "device": "imu_depth_sensor",
          "file": "Sensors/log_20260623_112414.csv",
          "start_ms": 0,
          "end_ms": 10755,
          "status": "completed"
        },
        {
          "asset_id": "dvl_001",
          "type": "dvl_data",
          "device": "dvl_teledyne",
          "file": "DVL/DVL_20260623_112414.json",
          "start_ms": 0,
          "end_ms": 10755,
          "status": "completed"
        },
        {
          "asset_id": "snr_001",
          "type": "sonar_data",
          "device": "ping_sonar_360",
          "file": "Sonar/sonar_20260623_112414.sonar",
          "start_ms": 12,
          "end_ms": 10755,
          "status": "completed"
        }
      ],
      "events": [
        { "timestamp_ms": 5, "event": "session_start" },
        { "timestamp_ms": 10755, "event": "session_stop" }
      ]
    },
    {
      "session_id": "session_20260623_113402",
      "start_ms": 0,
      "end_ms": 45665,
      "duration_ms": 45665,
      "status": "completed",
      "assets": [
        {
          "asset_id": "vid_001",
          "type": "video",
          "device": "front_camera",
          "file": "Camera/record_20260623_113402.mp4",
          "start_ms": 33,
          "end_ms": 11557,
          "status": "disconnect"
        },
        {
          "asset_id": "vid_002",
          "type": "video",
          "device": "front_camera",
          "file": "Camera/record_20260623_113433.mp4",
          "start_ms": 31077,
          "end_ms": 45665,
          "status": "completed"
        },
        {
          "asset_id": "img_evidence_001",
          "type": "photo",
          "device": "front_camera_snapshot",
          "file": "Snapshots/capture_20260623_113445.png",
          "start_ms": 43000,
          "end_ms": 43000,
          "status": "completed"
        }
      ],
      "events": [
        { "timestamp_ms": 21, "event": "session_start" },
        { "timestamp_ms": 11557, "event": "front_camera_disconnect" },
        { "timestamp_ms": 31077, "event": "front_camera_reconnect" },
        { "timestamp_ms": 45667, "event": "session_stop" }
      ]
    }
  ]
}
```

**Asset types trong manifest:**
| `asset.type` | Ý nghĩa | File pattern | Classifier hiện tại |
|---|---|---|---|
| `sensor_csv` | Sensor log | `Sensors/log_*.csv` | ✓ `log_*.csv` → sensor |
| `dvl_data` | DVL trajectory | `DVL/DVL_*.json` | ✓ `dvl_*.json` → dvl |
| `sonar_data` | Sonar scan | `Sonar/sonar_*.sonar` | ✓ `*.sonar` → sonar |
| `video` | Camera recording | `Camera/record_*.mp4` | ✓ `*.mp4` → video (skip, note "use media upload") |
| `photo` | In-dive auto-snapshot | `Snapshots/capture_*.png` | `*.png` → image (skip, note "use media upload") |

**Kết luận:** Classifier hiện tại đã đúng cho tất cả file types. Không cần thay đổi `classifyFile`.

---

### Cách tính `recordedAt` cho từng asset

**Quan trọng:** `start_ms` trong asset là **relative to SESSION start** (mỗi session reset về 0), không phải trip start. Session start time lấy từ `session_id`.

```js
// session_id = "session_20260623_112414"
// HHMMSS trong session_id là giờ địa phương UTC+7 (giờ Việt Nam)
function parseSessionId(sessionId) {
  const m = sessionId.match(/session_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+07:00`);
}

// recordedAt của asset = sessionStart + asset.start_ms
// Ví dụ: vid_001 trong session_20260623_112414:
// sessionStart = 2026-06-23T04:24:14.000Z
// recordedAt   = 2026-06-23T04:24:14.009Z  (start_ms: 9)
const sessionStart = parseSessionId(session.session_id);
const assetRecordedAt = new Date(sessionStart.getTime() + asset.start_ms);
```

**So sánh với method hiện tại (parse từ filename):**
| Asset | Filename parse | Manifest parse | Độ chính xác |
|---|---|---|---|
| `log_20260623_112414.csv` | `2026-06-23T04:24:14Z` | `2026-06-23T04:24:14.000Z` | Như nhau |
| `DVL_20260623_112414.json` | `2026-06-23T04:24:14Z` | `2026-06-23T04:24:14.000Z` | Như nhau |
| `sonar_20260623_112414.sonar` | `2026-06-23T04:24:14Z` | `2026-06-23T04:24:14.012Z` | Manifest: +12ms |
| `record_20260623_112414.mp4` | (user input) | `2026-06-23T04:24:14.009Z` | **Manifest: tự động, ms precision** |

→ **Lợi ích thực tế của manifest chủ yếu là cho VIDEO** — tự động điền `recordedAt` thay vì user phải nhập tay.

---

### CSV format thực tế (từ ROV data)

```csv
Time;Roll;Pitch;Yaw;Depth;Voltage;HoldDepth;HoldHeading;Manual;Humidity;Temperature;CameraTilt;LightLevel;PowerLevel;WaterTemperature;lat;lng
16:25:16;0,87;0,62;-124,2;-0,1;12;0;0;Manual;51;40;0;0;40;33;16,0544;108,2022
16:25:17;0,87;0,62;-124,2;-0,1;12;0;0;Manual;51;40;0;0;40;33
```

Tất cả đã được xử lý đúng trong `batch.controller.js`:
- Dấu phân cách `;` → `detectDelimiter` ✓
- Số thập phân `,` (European) → `detectDecimalSep` ✓
- `Time` = `HH:MM:SS` + date từ filename → `parseTimeToDate` ✓
- `lat;lng` chỉ có dòng đầu → `reverseGeocode` ✓
- `Temperature` (board) vs `WaterTemperature` (nước) → `COLUMN_MAP` ✓
- `Manual`/`HoldDepth`/`HoldHeading` là string → convert logic ✓

---

### Subtasks thực hiện (minimal — không đổi upload flow)

#### 8-1 — Backend: Detect manifest, return video `recordedAt` suggestions

**File: `backend/src/modules/trips/batch.controller.js`**

1. Thêm `'manifest'` vào `classifyFile` (chỉ 1 dòng):
```js
if (base === 'trip_master.json') return 'manifest';
```

2. Thêm hàm `parseSessionId(sessionId)` (như công thức trên)

3. Trong `uploadBatch`, sau khi build `files[]`:
```js
const manifestEntry = files.find(f => f.filename === 'trip_master.json');
let videoSuggestions = []; // [{ filename, recordedAt (ISO string) }]

if (manifestEntry) {
  try {
    const manifest = JSON.parse(manifestEntry.buffer.toString('utf8'));
    for (const session of manifest.sessions || []) {
      const sessionStart = parseSessionId(session.session_id);
      for (const asset of session.assets || []) {
        if ((asset.type === 'video' || asset.type === 'photo') && sessionStart) {
          const basename = asset.file.split('/').pop();
          videoSuggestions.push({
            filename: basename,
            recordedAt: new Date(sessionStart.getTime() + asset.start_ms).toISOString(),
            type: asset.type,
            status: asset.status,
          });
        }
      }
    }
    results.manifest = { detected: true, videoSuggestions };
  } catch {
    results.manifest = { detected: false, error: 'Failed to parse trip_master.json' };
  }
}
```

4. Trong vòng `for` xử lý files: skip file `trip_master.json` (type = 'manifest') thay vì push vào `results.unknown`.

#### 8-2 — Frontend: Hiển thị video suggestions sau khi upload ZIP

Trong `ROVDataUpload.jsx`, phần hiển thị kết quả upload:
- Nếu `results.manifest?.detected && results.manifest.videoSuggestions.length > 0` → hiện section "📹 Video files found in manifest":
  - Mỗi video: `filename` + `recordedAt` (formatted local time) + badge `DISCONNECT` nếu `status: 'disconnect'`
  - Note: "Upload these files via Media tab with the suggested start time for chart sync"
- Chip nhỏ "Manifest detected" màu xanh ở top result

**Không cần thay đổi gì khác** — sensor/DVL/sonar đã được xử lý đúng, `recordedAt` đã parse đúng từ filename.

---

### Checklist sau TASK 8

- [ ] Upload ZIP có `trip_master.json` → backend parse manifest, không crash
- [ ] `trip_master.json` KHÔNG xuất hiện trong `results.unknown` (bị skip đúng)
- [ ] `results.manifest.videoSuggestions` trả về đúng danh sách video + `recordedAt` ISO string
- [ ] `vid_001` với `status: 'disconnect'` → xuất hiện trong suggestions với badge `DISCONNECT`
- [ ] `photo` type (`capture_*.png`) → xuất hiện trong suggestions (type: 'photo')
- [ ] Upload ZIP không có `trip_master.json` → `results.manifest` undefined, không crash
- [ ] Sensor/DVL/Sonar files trong ZIP → xử lý đúng như cũ (không regression)
- [ ] Frontend: hiện section "Video files found in manifest" với `recordedAt` gợi ý
- [ ] Frontend: hiện chip "Manifest detected" khi `results.manifest.detected === true`
- [ ] Upload `trip_master.json` lẻ (không ZIP) → không crash, rơi vào `unknown`

---

### Không cần implement

- Thay đổi classifier cho DVL/Sonar — naming không đổi, classifier đã đúng
- Lưu `recordedAt` từ manifest vào DVL/Sensor DB — filename đã đủ chính xác (second precision)
- `Media.manifestAssetId`, `Trip.manifestSessionId` — không có giá trị UI/UX
- Events timeline (disconnect/reconnect) — không hiển thị trên UI
- Multi-device: chỉ `front_camera` được support hiện tại


---

## Kế hoạch Kiểm thử (Testing Plan)

### Phân loại theo người thực hiện

| Loại | Công cụ | Ai làm | Script có sẵn |
|---|---|---|---|
| Fake data | Node.js | **Script tự động** | `src/scripts/seed-full.js` |
| Functional Test (API) | Node.js | **Script tự động** | `src/scripts/functional-test.js` |
| API Load Test đơn giản | Node.js | **Bạn tự chạy** | `src/scripts/load-test.js` |
| API Load Test nâng cao | Artillery | **Bạn tự chạy** | `src/scripts/artillery.yml` |
| Frontend Lighthouse | Chrome DevTools | **Bạn tự làm** | — |
| YOLO FPS benchmark | Log trong worker | **Cần viết thêm code** | — |
| UI/UX manual test | Trình duyệt | **Bạn tự làm** | Checklist bên dưới |

---

### 1. Functional Testing — API (TỰ ĐỘNG)

**Chạy:** `cd backend && node src/scripts/functional-test.js`
**Kết quả hiện tại:** 37/37 passed (100%)

**Auth (7 cases):** login đúng, sai password, email không tồn tại, thiếu field, GET /me với token hợp lệ/không có/sai.

**RBAC (6 cases):** Viewer không tạo/xóa được, được đọc. Không auth → 401.

**Validation (5 cases):** Thiếu field required, sai ObjectId format, projectId không tồn tại → 404, sensor readings không phải array, array rỗng.

**CRUD (11 cases):** Tạo/đọc/sửa/xóa Project và Trip, cascade delete, verify 404 sau khi xóa.

**Pagination (6 cases):** limit đúng, cấu trúc paginated response, filter theo status, page không tồn tại → data rỗng.

Bug phát hiện qua test: `POST /projects/:id/trips` với projectId không tồn tại trả 201 thay vì 404 — đã fix bằng cách thêm kiểm tra project tồn tại trong trip.controller.js.

---

### 2. Load Testing (BẠN TỰ CHẠY)

#### Option A — Không cần cài thêm
```
cd backend
node src/scripts/load-test.js
```
20 concurrent x 3 rounds = 60 requests/endpoint

**Kết quả baseline (Free tier Atlas, dev machine):**

| Endpoint | Avg | P95 | Đánh giá |
|---|---|---|---|
| GET /auth/me | 138ms | 448ms | OK |
| GET /media/trip/:id | 161ms | 784ms | OK |
| GET /trips/:id/sensor-data | 301ms | 525ms | Chấp nhận |
| GET /stats/overview | 906ms | 1842ms | Chậm - nhiều aggregation |
| POST /auth/login | 41/60 errors | — | Rate limiter hoạt động đúng |

#### Option B — Artillery (khuyên dùng cho báo cáo)
```
npm install -g artillery
artillery run backend/src/scripts/artillery.yml
artillery run backend/src/scripts/artillery.yml --output report.json
artillery report report.json
```

3 phases: Warm-up (5 users/s x 15s) → Ramp-up (5→30 users/s x 30s) → Peak (30 users/s x 30s).
Scenarios: 70% read data, 20% project detail flow, 10% notifications.

---

### 3. Frontend Performance — Lighthouse (BẠN TỰ LÀM)

Chrome DevTools (F12) → tab Lighthouse → Analyze page load (chọn cả Mobile + Desktop).

**Mục tiêu đồ án:**

| Trang | Performance | Accessibility | Best Practices |
|---|---|---|---|
| Dashboard | ≥ 70 | ≥ 80 | ≥ 80 |
| TripDetailPage (nặng nhất) | ≥ 60 | ≥ 75 | ≥ 80 |
| ProjectsPage | ≥ 75 | ≥ 80 | ≥ 80 |

---

### 4. Manual UI Testing (BẠN TỰ LÀM)

**Responsive:**
- 375px: Header không overflow, Sonar panel hiện không cần toggle, bottom chart hiện
- 768px: Layout stacked đúng thứ tự
- 1440px: Layout 3 cột cockpit, expand/collapse CurrentStatus hoạt động

**Dark mode:** Tất cả trang, chart lines, gauge SVG

**Upload files (cần file thật):**

| Test case | Input | Expected |
|---|---|---|
| Upload CSV hợp lệ | log_YYYYMMDD_HHMMSS.csv | Toast xanh, chart hiện |
| Upload CSV sai format | File thiếu cột Depth | Toast đỏ, báo lỗi rõ |
| Upload CSV trùng tên | File lần 2 | Overwrite, không duplicate |
| Upload 2 CSV khác nhau | 2 file khác tên | Chart 2 đoạn, gap đúng chỗ |
| Upload video .mp4 | Video thật | Playlist hiện, phát được |
| Upload sonar binary | .sonar file | SonarViewer play/pause |
| Upload DVL JSON | dvl_YYYYMMDD.json | TrajectoryViewer hiện path |

**RBAC trên UI:**

| Role | Hành động | Expected |
|---|---|---|
| viewer | TripDetailPage → không thấy nút Upload | Pass |
| viewer | Thử navigate /admin → redirect | Pass |
| operator | Tạo Project mới | Cần test |
| operator | Xóa Project người khác | 403 |
| admin | Xóa bất kỳ resource | Cần test |

**Edge cases:**
- [ ] Upload file lớn (>100MB) → progress bar đúng
- [ ] Dive không có sensor → empty state không crash
- [ ] Mạng chậm (DevTools → Network → Slow 3G) → skeleton loading
- [ ] 2 tab cùng tài khoản → notifications sync qua SSE
- [ ] Logout → dùng lại token cũ → 401 (Redis blacklist)
- [ ] Session hết 15 phút → auto refresh trong background

---

### 5. YOLO Performance Benchmark (CẦN VIẾT THÊM CODE)

Thêm vào `yolo-service/main.py` sau khi xử lý xong:
```python
duration_s = time.perf_counter() - t_start
fps = frame_count / duration_s
logger.info(f"YOLO [{req.model}] {duration_s:.2f}s — {fps:.1f} FPS — {len(labels)} labels")
return {"labels": labels, "processingMs": round(duration_s * 1000), "fps": fps}
```

Thêm vào `media.worker.js`:
```js
const { labels, processingMs, fps } = yoloRes.data;
console.log(`[YOLO] ${media.originalName} — ${processingMs}ms — ${fps} FPS`);
```

**Metrics cần ghi lại cho báo cáo:**

| Input | Duration | FPS | Labels |
|---|---|---|---|
| Ảnh 1080p | _ms | N/A | _ |
| Video 30s (0.5s sample) | _s | _ FPS | _ |
| Video 3 phút (1s sample) | _s | _ FPS | _ |

---

### 6. Postman — Test thủ công endpoint (BẠN TỰ LÀM)

Tạo collection với Pre-request Script auto-login:
```js
// Trong Postman Pre-request Script của folder root:
pm.sendRequest({
    url: pm.environment.get("baseUrl") + "/api/v1/auth/login",
    method: "POST",
    header: { "Content-Type": "application/json" },
    body: { mode: "raw", raw: JSON.stringify({ email: "admin@rov.local", password: "Admin@123" }) }
}, (err, res) => {
    pm.environment.set("token", res.json().data.accessToken);
});
```

Authorization header: `Bearer {{token}}`

---

### Checklist trước bảo vệ đồ án

**Chạy script (5 phút):**
- [ ] `node src/scripts/seed-full.js --reset`
- [ ] `node src/scripts/functional-test.js` → phải 37/37
- [ ] `node src/scripts/load-test.js` → chụp ảnh kết quả

**Lighthouse (15 phút):**
- [ ] Dashboard → chụp ảnh điểm số
- [ ] TripDetailPage → chụp ảnh điểm số
- [ ] ProjectsPage → chụp ảnh điểm số

**Manual (30 phút):**
- [ ] Upload CSV + video vào 1 trip thật → verify chart + playlist
- [ ] Test RBAC với 3 role khác nhau
- [ ] Kiểm tra dark mode + responsive 375px

**Artillery (10 phút, nếu có):**
- [ ] `artillery run backend/src/scripts/artillery.yml --output report.json`
- [ ] `artillery report report.json` → chụp ảnh HTML report

**YOLO benchmark (nếu có thời gian):**
- [ ] Thêm timing log vào main.py + media.worker.js
- [ ] Chạy analyze trên 1 ảnh + 1 video → ghi FPS
