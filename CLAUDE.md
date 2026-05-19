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
        ROV info, trip history, sensor charts, media gallery
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
| AI | Gemini 2.5 Flash (Google) | Trip summary sau khi hoàn tất |
| Computer Vision | YOLOv8 (Python FastAPI microservice) | Nhận diện vật thể trong ảnh/video ROV |
| Anomaly Detection | Z-Score (tự implement) | Phát hiện bất thường sensor data |
| Email | Nodemailer + Gmail SMTP | Notify dive failed / trip completed |

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
│       ├── trips/                  # CRUD Trip + filter nâng cao
│       ├── dives/                  # CRUD Dive
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
        ├── trips/                   # TripsPage, TripDetailPage, TripForm
        ├── dives/                   # DivesPage, DiveList, DiveForm
        ├── media/                   # MediaGallery, MediaUpload
        ├── users/                   # UsersPage (admin only)
        └── profile/                 # ProfilePage — tabs: profile, password, settings
```

---

## Phân quyền (RBAC)
| Role | Quyền |
|------|-------|
| `viewer` | Chỉ đọc |
| `operator` | Tạo/sửa trip, dive; upload media |
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
| Paginated (trips, dives, rovs, media) | `{ data: [...], total, page, totalPages }` |
| Users | `{ users: [...], total, page, totalPages }` |
| Stats | `{ tripByStatus, diveByStatus, rovUtilization, activityTimeline, ... }` |
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
- RovDetailPage: 4 stat cards + trip history
- Export CSV + PDF

### Trip Management (đầy đủ)
- CRUD: `GET/POST /trips`, `GET/PATCH/DELETE /trips/:id`
- Filter: status, rovId, fromDate, toDate, search
- Export CSV + PDF

### Dive Management (đầy đủ)
- Tạo: `POST /trips/:tripId/dives` | Actions: `PATCH/DELETE /dives/:id`
- DivesPage: danh sách, filter by status + date range
- Hiển thị chính trong TripDetailPage
- Export CSV + PDF

### Media / AWS S3 (đầy đủ)
- Upload qua presigned URL, confirm sau khi upload xong
- Gallery: xem theo trip, drag-to-reorder, lightbox
- Bulk select + delete (admin)
- Media model: s3Key, url, type, size, status (pending/ready/failed), order

### Dashboard (đầy đủ)
- Stat cards: Total Trips, Running Dives, Active ROVs, Total Users
- Biểu đồ: Trip Status donut, Dives by Status bar, ROV Utilization horizontal bar
- Activity timeline 6 tháng (trips / dives / media)
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
   - Dive status → `done` / `failed` → notify user tạo dive
   - Trip status → `completed` → notify operator liên quan
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
- [x] Đổi dive sang `done` → bell badge đỏ xuất hiện ngay (SSE push, không cần reload)
- [x] Click bell → dropdown đúng thông báo
- [x] Click thông báo → navigate đúng trang, badge giảm
- [x] "Mark all as read" → badge biến mất
- [x] Reload trang → số badge vẫn đúng (lưu DB)

---

### TASK 3 — AI Trip Summary + Bull Queue ⭐
**Tại sao cần:** Tính năng AI bắt buộc cho đồ án. Bull Queue xử lý async — AI call có thể mất 5-15s, không nên block HTTP request.

**3a — Bull Queue setup:**
1. Cài: `npm i bull`
2. Tạo `config/queue.js` — khởi tạo Bull queue dùng `REDIS_URL`
3. Queue `ai-summary`: worker gọi AI API, lưu kết quả, gửi SSE notification khi xong
4. Queue `email`: worker gửi email (dùng cho TASK 8)

**3b — AI Summary backend:**
1. Cài: `npm i openai` (hoặc `@anthropic-ai/sdk`)
2. `modules/ai/ai.service.js`: hàm `generateTripSummary(trip, dives, mediaCount)` → gọi API
   - Prompt: tên trip, location, thời gian, danh sách dives + status, số media
3. Thêm field vào `trip.model.js`:
   - `aiSummary: { content: String, generatedAt: Date, status: 'idle'|'pending'|'done'|'failed' }`
4. `POST /trips/:id/ai-summary` — enqueue Bull job, set `aiSummary.status = 'pending'`, trả 202
5. Bull worker xử lý → lưu `aiSummary.content` + `status = 'done'` → push SSE đến user

**Frontend — subtasks:**
1. Trong `TripDetailPage.jsx`, thêm section "AI Summary" phía dưới Dives
2. Hiển thị content nếu `aiSummary.status === 'done'` + "Generated at ..."
3. Button "Generate Summary" (trip completed + operator/admin) → POST → spinner
4. Poll `GET /trips/:id` mỗi 3s khi `status === 'pending'` để biết khi nào xong
5. Button "Regenerate" nếu đã có summary

**Checklist sau TASK 3:**
- [x] Trip completed → bấm "Generate Summary" → trả 202, spinner xuất hiện
- [x] Sau vài giây → summary tự cập nhật (poll 3s khi pending)
- [x] Reload → summary vẫn còn (lưu DB)
- [x] Trip chưa completed → không thấy button
- [x] Viewer thấy summary nhưng không thấy button Generate

---

### TASK 4 — Audit Log
**Tại sao cần:** Traceable, quan trọng cho hệ thống vận hành thực tế.

**Backend — subtasks:**
1. `AuditLog` model: `action, entity, entityId, userId (ref), details (Mixed), createdAt`
2. `audit.service.js`: hàm `log(userId, action, entity, entityId, details)`
3. Gọi trong các controller: tạo/xóa trip, xóa ROV, đổi role, bulk operations
4. `GET /audit?page&limit&entity&userId` — admin only

**Frontend — subtasks:**
1. Thêm trang `/audit` hoặc tab trong UsersPage
2. Timeline list: avatar + tên user, action, entity, thời gian relative
3. Filter theo entity type

**Checklist sau TASK 4:**
- [x] Tạo trip → log xuất hiện trong audit
- [x] Xóa ROV → log "Deleted ROV X"
- [x] Đổi role user → log ghi đúng, hiện email user bị đổi
- [x] Toggle status user → log activate/disable + email
- [x] Generate AI summary → log ghi đúng
- [x] Viewer/Operator không vào được `/audit`

---

### TASK 5 — Sensor Data Upload (manual via web)
**Mô tả:** Operator upload file CSV/JSON chứa sensor data sau khi ROV về bờ. Không có GCS tự động vì ngoài thực địa không có wifi.

**Lưu ý thiết kế:** Dive = 1 lần lặn → sensor data gắn với Dive, không phải Trip.

**Backend — subtasks:**
1. `SensorData` model: `{ dive, timestamp, depth, temp, pressure, yaw, pitch, roll, voltage, battery_percent, humidity }` — dive là 1 lần lặn
   Index: `{ dive: 1, timestamp: -1 }`; `dive.sensorCount` lưu số readings
2. `POST /dives/:id/sensor-data/upload` — nhận array readings, lưu bulk vào DB
3. Khi upload, đọc `lat`/`lng` từ dòng đầu tiên (nếu có) → lưu vào **Dive** `gpsLocation: { lat, lng }` + gọi **OpenStreetMap Nominatim reverse geocoding** → lưu `dive.locationName` (GPS là vị trí của lần lặn cụ thể đó, không phải toàn trip)
4. `DELETE /dives/:id/sensor-data` — xóa sensor data của dive đó

**Frontend — subtasks:**
1. `SensorUpload` component trong DiveCard expanded section (operator/admin)
2. Parse file phía client → validate → gửi array lên backend
3. Hiển thị số readings, nút "Clear" với confirm dialog
4. Badge sensor count trong dive card header

**Format file được hỗ trợ:**
```csv
timestamp,depth,temp,pressure[,lat,lng,yaw,pitch,roll,voltage,battery_percent,humidity]
2026-05-07T08:00:00Z,10.5,24.3,1.23,16.0544,108.2022,183.2,-1.2,0.8,16.80,100,28.1
```
- `depth`(m), `temp`(°C), `pressure`(bar), `timestamp` — bắt buộc
- `lat`/`lng` — optional, chỉ đọc dòng đầu làm GPS cố định của dive
- `yaw`/`pitch`/`roll`(°) — optional, hiển thị tab Navigation + live gauge
- `voltage`(V), `battery_percent`(%), `humidity`(%) — optional, hiển thị tab System
- File mẫu: `test-data/sensor-sample-full.csv` (60 readings, GPS Đà Nẵng, 2 anomaly spikes)

**Checklist sau TASK 5:**
- [x] Upload file CSV hợp lệ → data lưu DB (gắn với dive, không phải trip)
- [x] Upload file sai format → báo lỗi rõ ràng
- [x] Upload lại → xóa data cũ của dive đó, lưu data mới
- [x] File có lat/lng → dive.gpsLocation và dive.locationName được cập nhật (Nominatim reverse geocoding)
- [x] Viewer không thấy upload section
- [x] AI summary dùng locationName khi có GPS data
- [x] Badge sensor count hiện trong dive card header

---

### TASK 6 — Sensor Data Display + Anomaly Detection + Map ✅
**Mô tả:** API backend trả sensor data + stats + anomalies. Component `SensorChart.jsx` dùng trong TripDetailPage (DiveCard expanded). Raw Leaflet map ghim GPS.

**Backend — subtasks:**
1. `GET /dives/:id/sensor-data` → query SensorData theo dive, trả array readings + stats
2. Aggregate: min/max/avg cho mỗi metric (depth, temp, pressure)
3. Anomaly Detection: Z-Score (|z| > 2.5) cho từng metric
4. Trả về `{ data, stats, anomalies: [{ index, metric, value, zScore, timestamp }] }`
5. `dive.locationName` được dùng trong AI summary prompt (Gemini nhận tên địa danh thay vì tọa độ số)

**Frontend — subtasks:**
1. Component `SensorChart.jsx` — AreaChart Recharts với depth, temp, pressure (dùng trong DiveCard)
2. Highlight điểm bất thường màu đỏ trên biểu đồ (custom dot)
3. Toggle hiện/ẩn từng đường (Legend clickable)
4. Panel "Anomalies Detected" liệt kê các điểm bất thường
5. Map nhỏ (raw Leaflet) ghim 1 Marker tại `dive.gpsLocation` — chỉ hiện nếu có GPS
6. Link từ DiveCard trong TripDetailPage → `/dives/:id`

**Checklist sau TASK 6:**
- [x] Dive có sensor data → chart hiển thị đúng 3 metrics
- [x] Điểm bất thường tự động highlight đỏ trên biểu đồ
- [x] Panel anomalies liệt kê đúng các điểm bất thường
- [x] Toggle từng metric trên Legend hoạt động
- [x] Dive có GPS → map hiện Marker + tên địa danh (raw Leaflet, không dùng react-leaflet vì incompatible với React 18.3)
- [x] Dive không có GPS → map ẩn, không crash
- [x] Dive không có data → empty state thân thiện (SensorChart)
- [x] Link từ DiveCard (TripDetailPage) → `/dives/:id`

---

### TASK 6a — DiveDetailPage Cockpit Layout ✅
**Mô tả:** Trang `/dives/:id` với layout 3 cột kiểu "cockpit" — không cuộn trang, tối ưu cho màn hình 1080p. Hỗ trợ cả light mode và dark mode.

**Layout đã thực hiện:**
```
Header (h-14): status badge · title · trip/location meta · DATA SYNCED · action buttons · Export
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
3. Trong DiveDetailPage: hiển thị labels khi media đang active trong center column
4. SVG bbox overlay toggle (Eye/EyeOff) — ảnh + video, align với object-fit:contain
5. Click label badge video → seek đến frameTime tương ứng
6. SSE auto-refresh sau khi analysis xong (queryClient.invalidateQueries)

**Checklist sau TASK 6b:**
- [x] Upload ảnh → sau vài giây labels tự hiện (SSE push)
- [x] Upload video → sau 10-60s (tùy độ dài) labels tự hiện
- [x] Labels hiển thị đúng trong gallery và DiveDetailPage
- [x] SVG bbox overlay + Eye/EyeOff toggle trong DiveDetailPage và lightbox
- [x] Click label badge → seek video đến frameTime (DiveDetailPage)
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
1. Trong `DiveDetailPage`, `DetectionSVG`: filter `labels` theo `currentTime` trong khoảng `±1s`:
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
- Nút nhỏ (icon ⚙ hoặc Sparkles) trong top overlay của DiveDetailPage, cạnh nút "Detect"
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
1. Component `AIAnalyzePopover` trong DiveDetailPage (inline, không tách file riêng)
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

### TASK 6b-3 — Evidence System (Photo Snapshot + Video Clip)
**Mô tả:** Operator đang xem video, phát hiện vật thể quan trọng → chụp ảnh frame hoặc đánh dấu đoạn clip làm **bằng chứng (evidence)**. Có thể gọi YOLO phân tích riêng từng evidence — tránh phải analyze toàn bộ video dài. Evidence lưu collection riêng, không lẫn vào Media playlist.

**Hai loại evidence:**
| Loại | Lưu gì | YOLO | Xem lại |
|------|---------|------|---------|
| **Photo** | Canvas PNG → S3 (`thumbnailS3Key`) | predict trên PNG | Lightbox ảnh + bbox overlay |
| **Clip** | `{ startTime, endTime }` + thumbnail PNG | track trên video gốc, chỉ frames trong range | Seek parent video đến startTime, auto-stop ở endTime |

**Schema `Snapshot` collection:**
```
type: 'photo' | 'clip'
dive: ObjectId ref Dive
trip: ObjectId ref Trip
createdBy: ObjectId ref User
parentVideoId: ObjectId ref Media   ← video đang xem lúc tạo
startTime: Number                    ← giây trong video (photo: frame; clip: start)
endTime: Number                      ← null cho photo, giây kết thúc cho clip
thumbnailS3Key: String               ← PNG nhỏ hiển thị trong panel (cả 2 loại)
aiLabels: [{ name, confidence, bbox, frameTime, trackId }]
analysisStatus: 'idle' | 'pending' | 'done' | 'failed'
note: String                         ← ghi chú tùy chọn
```
Index: `{ dive: 1, createdAt: -1 }`

**UI — Top overlay video (thêm 2 nút cạnh playlist toggle):**
```
[filename]        [📷 Photo] [▶ Start Clip / ⏹ Stop] [🎞 N] [Evidence N]
```
- Khi đang ghi clip: nút ⏹ Stop + counter nhỏ hiện thời gian đã chọn (ví dụ "0:15 → 0:28") + dấu chấm đỏ nhấp nháy
- "Evidence N": pill badge với tổng số evidence của video hiện tại, click → mở Evidence Panel

**UI — Evidence Panel (drawer từ phải, độc lập playlist):**
```
┌────────────────────────────────┐
│  Evidence (3)              [×] │
├────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐   │
│  │  [PNG]   │  │  [PNG]▶  │   │
│  │  📷 0:12 │  │ 0:15–0:35│   │
│  │  fish ×2 │  │ trash ×1 │   │
│  │ [Analyze]│  │[Analyzing]│   │
│  └──────────┘  └──────────┘   │
├────────────────────────────────┤
│  Empty state: "No evidence yet │
│  — capture a photo or clip"    │
└────────────────────────────────┘
```
- Grid 2 cột; thumbnail + loại icon (📷 / ▶) + timestamp + top 2 aiLabels nếu đã analyze
- Clip card hiện duration (ví dụ "20s")
- Nút **[Analyze]** trên mỗi card → gọi YOLO riêng cho evidence đó
- Nút **[Analyze]** chuyển spinner khi `analysisStatus === 'pending'`
- Hover card → nút ×  xóa (admin/operator)
- Click photo card → lightbox PNG + bbox overlay
- Click clip card → seek parent video đến `startTime`, autoplay đến `endTime` rồi pause

**Backend — subtasks:**
1. Tạo `modules/snapshots/snapshot.model.js` + `snapshot.routes.js` + `snapshot.controller.js`
2. `POST /snapshots` — nhận `{ type, diveId, tripId, parentVideoId, startTime, endTime?, dataUrl (base64 PNG thumbnail) }`
   - Upload thumbnail S3: `Buffer.from(dataUrl.split(',')[1], 'base64')` → `PutObjectCommand`
   - Tạo doc, trả snapshot mới
3. `GET /snapshots/dive/:diveId` — sort `startTime ASC`
4. `POST /snapshots/:id/analyze` — enqueue Bull job `snapshot-analysis`:
   - Photo: `{ snapshotId, type: 'photo', s3Url: thumbnailS3Url, model, confidence }`
   - Clip: `{ snapshotId, type: 'clip', parentVideoUrl, startTime, endTime, model, confidence }`
   - Set `analysisStatus: 'pending'`
   - Trả 202
5. Bull worker `snapshot.worker.js`:
   - Photo → `POST yolo-service/detect { mediaUrl: thumbnailUrl, mediaType: 'image/png' }`
   - Clip → `POST yolo-service/detect { mediaUrl: parentVideoUrl, mediaType: 'video/mp4', startTime, endTime }`
   - Lưu `aiLabels`, set `analysisStatus: 'done'` → SSE push
6. `DELETE /snapshots/:id` — xóa doc + S3 thumbnail
7. Đăng ký route trong `app.js`

**YOLO service — thay đổi cần thiết (thực hiện trong 6b-4):**
- `DetectRequest` thêm `startTime: float = None`, `endTime: float = None`
- `_detect_video`: nếu có range → skip frames ngoài `[startTime, endTime]`

**Frontend — subtasks:**
1. **Photo capture:** `ctx.drawImage(videoRef.current)` → nếu `showDetections` vẽ thêm bbox → `canvas.toDataURL('image/png')` → `POST /snapshots`
2. **Clip capture:** "Start Clip" → lưu `clipStart = currentTime` → "Stop Clip" → thumbnail = canvas frame tại `clipStart` → `POST /snapshots { type: 'clip', startTime: clipStart, endTime: currentTime, dataUrl }`
3. **Clip playback:** click card → `videoRef.current.currentTime = startTime` + `video.play()` → `ontimeupdate` kiểm tra nếu `currentTime >= endTime` → `video.pause()`
4. **Evidence Panel:** query `GET /snapshots/dive/:diveId`, grid 2 cột, nút Analyze per card
5. **Analyze per snapshot:** click [Analyze] → `POST /snapshots/:id/analyze` → SSE invalidate → labels hiện trên card
6. Top overlay: thêm pill "Evidence N", nút 📷, nút ▶/⏹ với counter

**Checklist sau TASK 6b-3:**
- [ ] Bấm 📷 Photo khi video đang phát → PNG frame + thumbnail lưu DB + S3
- [ ] Bbox overlay đang hiện → photo có bbox vẽ vào ảnh
- [ ] Bấm ▶ Start → ⏹ Stop → clip doc tạo với startTime/endTime + thumbnail
- [ ] Counter "0:15 → 0:28" + chấm đỏ hiện khi đang ghi clip
- [ ] Evidence N badge cập nhật sau mỗi lần capture
- [ ] Mở Evidence Panel → grid 2 cột đúng, phân biệt photo/clip icon
- [ ] Click [Analyze] → spinner → sau vài giây labels hiện trên card (SSE)
- [ ] Clip analyze: YOLO chỉ process frames trong range, nhanh hơn full video
- [ ] Click photo → lightbox PNG + bbox overlay
- [ ] Click clip → seek video đến startTime, autoplay đến endTime rồi pause
- [ ] Xóa evidence → biến khỏi panel + xóa S3 thumbnail
- [ ] Evidence KHÔNG xuất hiện trong Media playlist
- [ ] Disabled capture khi không có video đang active

---

### TASK 6c — Video + Sensor Sync (2 mode) ✅

**Hai mode hoạt động:**

| Mode | Điều kiện | Trải nghiệm |
|------|-----------|-------------|
| **Video có Metadata** | Upload video + upload sensor CSV cùng dive, video có `recordedAt` được set | Chart scrubs real-time theo `currentTime` video — đường dọc di chuyển trên biểu đồ |
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
- Thumbnail strip: hiện ảnh preview frame 1s, video/ảnh phân biệt bằng label
- Reorder: đã có drag-to-reorder trong DiveList (TripDetailPage) — DiveDetailPage không cần thêm

**Media model — thêm field (backend):**
```js
recordedAt: { type: Date, default: null }
// Thời điểm bắt đầu quay video, dùng để sync với SensorData.timestamp
// null = video thường (không sync)
```

**Backend — subtasks:**
1. Thêm field `recordedAt` vào `media.model.js`
2. `PATCH /media/:id` — cho phép update `recordedAt` (operator/admin)
3. `GET /media/dive/:diveId` đã có — đảm bảo sort theo `order` ASC

**Frontend — subtasks:**
1. **MediaUpload modal**: thêm input datetime-local để nhập `recordedAt` khi upload video (optional)
2. **DiveDetailPage — Video có Metadata mode:**
   - `useRef` cho `<video>` element, listen `ontimeupdate`
   - Tính `chartTimestamp` từ `selectedMedia.recordedAt + currentTime`
   - Truyền `chartTimestamp` vào chart component → vẽ `<ReferenceLine x={chartTimestamp}>`
   - Dùng `referenceLineX` state, update mỗi `timeupdate` event
3. **DiveDetailPage — Video thường mode:**
   - `<video onEnded>` → tự chuyển sang file tiếp theo trong playlist
   - Nếu không có video (chỉ ảnh): hiển thị ảnh full trong center column
4. **Edit recordedAt**: thêm input nhỏ trong DiveDetailPage header hoặc trong playlist panel khi click thumbnail → có thể nhập/sửa `recordedAt` inline

**Checklist sau TASK 6c:**
- [x] Media model có field `recordedAt`, API `PATCH /media/:id` update được
- [x] Upload video → có thể nhập `recordedAt` (datetime) trong upload modal (optional, labeled "enables chart sync")
- [x] **Video thường**: nhiều video → phát nối tiếp khi hết video trước (`onEnded` auto-advance)
- [x] **Video thường**: 1 video → phát bình thường, chart hiển thị độc lập bên dưới
- [x] **Video có Metadata**: video phát → đường dọc đỏ trên chart di chuyển theo timestamp (`ReferenceLine`)
- [x] **Video có Metadata**: LIVE SYNC badge xuất hiện góc dưới trái video
- [x] Dive chỉ có sensor (không có media) → center column hiển thị empty state
- [x] Dive không có gì → toàn bộ empty state thân thiện
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
**Mô tả:** Gửi email khi trip hoàn tất, dive failed. Chạy qua Bull Queue (đã có từ TASK 3) — không block request.

**Subtasks:**
1. Cài `npm i nodemailer`
2. Config Gmail SMTP trong `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
3. `email.service.js`: template HTML đơn giản, hàm `sendDiveFailed(user, dive)` + `sendTripCompleted(user, trip)`
4. Enqueue email job vào Bull queue `email` tại: dive `failed`, trip `completed`
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
| CRUD Trip/Dive | ✅ | Tạo/Sửa | Chỉ xem |
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
Trip: { status: 1 }, { createdAt: -1 }, { rov: 1 }, { startTime: -1 }
Dive: { status: 1 }, { trip: 1 }, { createdAt: -1 }
User: { email: 1 } (unique, đã có), { role: 1 }

// Cần khi làm sensor data
SensorData: { dive: 1, timestamp: -1 }

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

> Cache GET /rovs, /trips có thể thêm sau nếu cần tối ưu perf — chưa ưu tiên.

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
