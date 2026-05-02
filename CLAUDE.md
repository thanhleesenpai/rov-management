# ROV Management System — Project Context

## Mô tả dự án
Web app quản lí ROV (Remotely Operated Vehicle) — đồ án tốt nghiệp BKHN.

**Luồng chính:**
```
GCS (thiết bị ngoài thực địa)
    │  HTTP POST — upload sensor data + GPS sau/trong chuyến lặn
    ▼
Backend API (Node.js)
    ├── Lưu sensor data (nhiệt độ, độ sâu, áp suất, GPS) vào MongoDB
    └── Lưu video/ảnh lên AWS S3
    
Web App (React)
    └── Người dùng đăng nhập xem dữ liệu đã lưu:
        ROV info, trip history, sensor charts, media gallery
```
**Không có realtime stream từ GCS** — GCS upload xong → backend lưu → user vào xem.

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
| AI | OpenAI API hoặc Claude API | Trip summary sau khi hoàn tất |
| Email | Nodemailer + Gmail SMTP | Notify job failed / trip completed |

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
│       ├── jobs/                   # CRUD Job
│       ├── media/                  # presigned upload, gallery, reorder, bulkDelete
│       ├── stats/                  # overview aggregation
│       ├── notifications/          # SSE stream, CRUD notifications
│       ├── ai/                     # ai.service.js, Bull worker
│       └── gcs/                    # ingest endpoint, apikey middleware
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
        ├── jobs/                    # JobsPage, JobList, JobForm
        ├── media/                   # MediaGallery, MediaUpload
        ├── users/                   # UsersPage (admin only)
        └── profile/                 # ProfilePage — tabs: profile, password, settings
```

---

## Phân quyền (RBAC)
| Role | Quyền |
|------|-------|
| `viewer` | Chỉ đọc |
| `operator` | Tạo/sửa trip, job; upload media |
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
| Paginated (trips, jobs, rovs, media) | `{ data: [...], total, page, totalPages }` |
| Users | `{ users: [...], total, page, totalPages }` |
| Stats | `{ tripByStatus, jobByStatus, rovUtilization, activityTimeline, ... }` |
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

### Job Management (đầy đủ)
- Tạo: `POST /trips/:tripId/jobs` | Actions: `PATCH/DELETE /jobs/:id`
- JobsPage: danh sách, filter by status + date range
- Hiển thị chính trong TripDetailPage
- Export CSV + PDF

### Media / AWS S3 (đầy đủ)
- Upload qua presigned URL, confirm sau khi upload xong
- Gallery: xem theo trip, drag-to-reorder, lightbox
- Bulk select + delete (admin)
- Media model: s3Key, url, type, size, status (pending/ready/failed), order

### Dashboard (đầy đủ)
- Stat cards: Total Trips, Running Jobs, Active ROVs, Total Users
- Biểu đồ: Trip Status donut, Jobs by Status bar, ROV Utilization horizontal bar
- Activity timeline 6 tháng (trips / jobs / media)
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
   - Job status → `done` / `failed` → notify user tạo job
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
- [x] Đổi job sang `done` → bell badge đỏ xuất hiện ngay (SSE push, không cần reload)
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
2. `modules/ai/ai.service.js`: hàm `generateTripSummary(trip, jobs, mediaCount)` → gọi API
   - Prompt: tên trip, location, thời gian, danh sách jobs + status, số media
3. Thêm field vào `trip.model.js`:
   - `aiSummary: { content: String, generatedAt: Date, status: 'idle'|'pending'|'done'|'failed' }`
4. `POST /trips/:id/ai-summary` — enqueue Bull job, set `aiSummary.status = 'pending'`, trả 202
5. Bull worker xử lý → lưu `aiSummary.content` + `status = 'done'` → push SSE đến user

**Frontend — subtasks:**
1. Trong `TripDetailPage.jsx`, thêm section "AI Summary" phía dưới Jobs
2. Hiển thị content nếu `aiSummary.status === 'done'` + "Generated at ..."
3. Button "Generate Summary" (trip completed + operator/admin) → POST → spinner
4. Poll `GET /trips/:id` mỗi 3s khi `status === 'pending'` để biết khi nào xong
5. Button "Regenerate" nếu đã có summary

**Checklist sau TASK 3:**
- [ ] Trip completed → bấm "Generate Summary" → trả 202, spinner xuất hiện
- [ ] Sau vài giây → summary tự cập nhật (poll hoặc SSE)
- [ ] Reload → summary vẫn còn (lưu DB)
- [ ] Trip chưa completed → không thấy button
- [ ] Viewer thấy summary nhưng không thấy button Generate

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
- [ ] Tạo trip → log xuất hiện trong audit
- [ ] Xóa ROV → log "Deleted ROV X"
- [ ] Đổi role user → log ghi đúng
- [ ] Viewer/Operator không vào được `/audit`

---

### TASK 5 — GCS Ingest Endpoint
**Mô tả:** Endpoint nhận data từ GCS upload lên sau/trong chuyến lặn. GCS gọi HTTP POST bình thường, không phải stream.

**Backend — subtasks:**
1. Tạo `backend/src/middleware/apikey.middleware.js` — kiểm tra header `X-API-Key` (khác với JWT)
2. `POST /gcs/ingest` nhận body:
   ```json
   { "jobId": "...", "readings": [{ "timestamp": "...", "depth": 12.5, "temp": 24.1, "pressure": 1.2, "lat": 21.02, "lng": 105.8 }] }
   ```
3. Lưu vào collection `SensorData` riêng (không nhét vào Job để tránh document quá lớn)
4. `SensorData` model: `{ job, trip, timestamp, depth, temp, pressure, lat, lng }`
5. Thêm `GCS_API_KEY` vào `.env`
6. Đăng ký route trong `app.js`

**Checklist sau TASK 5:**
- [ ] Gọi `POST /gcs/ingest` với API key đúng → 200, data lưu DB
- [ ] Gọi không có API key → 401
- [ ] Gọi với jobId không tồn tại → 404
- [ ] Nhiều readings trong 1 request → tất cả lưu đúng

---

### TASK 6 — Sensor Data Display
**Mô tả:** Hiển thị biểu đồ sensor data đã lưu trong TripDetailPage. Dùng mock data nếu GCS chưa xong.

**Backend — subtasks:**
1. `GET /trips/:id/sensor-data` → query SensorData theo trip, trả array readings
2. Aggregate: min/max/avg cho mỗi metric

**Frontend — subtasks:**
1. Component `SensorChart.jsx` — LineChart Recharts với nhiệt độ, độ sâu, áp suất
2. Toggle hiện/ẩn từng đường (Legend clickable)
3. Hiển thị trong TripDetailPage khi có data
4. Map route: vẽ đường đi ROV từ GPS log trên bản đồ (Leaflet.js + OpenStreetMap, miễn phí)
5. Script seed mock sensor data để demo khi GCS chưa xong

**Checklist sau TASK 6:**
- [ ] Trip có sensor data → chart hiển thị đúng các metrics
- [ ] Toggle từng metric trên Legend hoạt động
- [ ] Trip có GPS data → map hiển thị route
- [ ] Trip không có data → empty state thân thiện

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
**Mô tả:** Gửi email khi trip hoàn tất, job failed. Chạy qua Bull Queue (đã có từ TASK 3) — không block request.

**Subtasks:**
1. Cài `npm i nodemailer`
2. Config Gmail SMTP trong `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
3. `email.service.js`: template HTML đơn giản, hàm `sendJobFailed(user, job)` + `sendTripCompleted(user, trip)`
4. Enqueue email job vào Bull queue `email` tại: job `failed`, trip `completed`
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
| CRUD Trip/Job | ✅ | Tạo/Sửa | Chỉ xem |
| Upload media | ✅ | ✅ | ❌ |
| Xóa media (bulk) | ✅ | ❌ | ❌ |
| Xem media | ✅ | ✅ | ✅ |
| Export CSV/PDF | ✅ | ✅ | ❌ |
| Ingest GCS data | API key riêng | — | — |
| Xem audit log | ✅ | ❌ | ❌ |
| Generate AI summary | ✅ | ✅ | ❌ |

---

## MongoDB Indexes cần thêm

```js
// Đã cần ngay
ROV:  { status: 1 }, { createdAt: -1 }
Trip: { status: 1 }, { createdAt: -1 }, { rov: 1 }, { startTime: -1 }
Job:  { status: 1 }, { trip: 1 }, { createdAt: -1 }
User: { email: 1 } (unique, đã có), { role: 1 }

// Cần khi làm sensor data
SensorData: { job: 1, timestamp: -1 }

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

OPENAI_API_KEY=...          # hoặc ANTHROPIC_API_KEY
GCS_API_KEY=...             # API key cho GCS ingest endpoint

CLIENT_URL=http://localhost:5173
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

**User model hiện tại (cần update khi làm Google OAuth):**
- `password` required → phải đổi thành optional
- Cần thêm field `googleId` và `authProvider`
- `comparePassword()` method cần kiểm tra authProvider trước khi so sánh
