# ROV Management System — Lộ trình & Kiến trúc

## Tổng quan hệ thống

Web app quản lý ROV (Remotely Operated Vehicle) phục vụ vận hành thực địa:
- GCS (Ground Control Station) upload dữ liệu/video lên cloud qua API
- Người dùng theo dõi hành trình, công việc, dữ liệu cảm biến và media từ web

---

## Kiến trúc công nghệ

### Hiện tại (Monolith — phù hợp với đồ án)

```
Browser (React)
    │
    ▼
Nginx / Vite dev proxy
    │
    ▼
Node.js + Express (API)
    ├── MongoDB Atlas      — dữ liệu chính (user, rov, project, job, media)
    ├── AWS S3             — lưu file video, ảnh, sensor data raw
    └── Redis              — cache, job queue, token blacklist (giai đoạn 4+)
```

### Hướng phát triển sau đồ án (Microservice)

```
API Gateway
    ├── Auth Service
    ├── ROV & Project Service
    ├── Media Service (S3, transcode)
    ├── Telemetry Service (GCS data stream)
    └── Notification Service
            └── Kafka / Redis Pub-Sub
```

---

## Stack công nghệ chi tiết

| Lớp | Công nghệ | Lý do chọn |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | Nhanh, ecosystem lớn |
| UI Components | shadcn/ui | Accessible, dễ tùy biến |
| State | Zustand + React Query | Zustand cho auth, React Query cho server state |
| Backend | Node.js + Express | Non-blocking I/O, phù hợp real-time |
| Database | MongoDB Atlas | Flexible schema cho sensor data dạng Mixed |
| Cache & Queue | Redis + Bull | Session blacklist, job queue upload/process |
| Storage | AWS S3 | Lưu video, ảnh, file GCS |
| Auth | JWT (access 15m + refresh 7d) | Stateless, dễ scale |
| Realtime | Socket.io | Notification, telemetry live |

---

## Lộ trình thực hiện

### ✅ Giai đoạn 0–1: Nền tảng
- Project setup, cấu trúc thư mục module-based
- Auth đầy đủ: register, login, logout, refresh token, change password
- RBAC 3 role: admin / operator / viewer
- Layout responsive: sidebar thu gọn, navbar, profile page

### ✅ Giai đoạn 2: ROV Registry
- CRUD ROV với phân quyền
- Search + filter + **server-side pagination** (`?page&limit&search&status`)
- Chi tiết ROV: specs, ghi chú

### ✅ Giai đoạn 3: Project & Job Management
- Project CRUD + search/filter/pagination
- Job nested trong Project, hiển thị ở cả /projects/:id và /jobs
- Job CRUD + filter theo project/status/search
- Server-side pagination toàn bộ

### 🔄 Giai đoạn 4: S3 Upload & Media
**Backend:**
- `GET /media/presigned-url` — tạo presigned URL để client upload thẳng lên S3
- `POST /media` — lưu metadata sau khi upload xong
- `GET /jobs/:id/media` — danh sách file của 1 job
- Bull queue + Redis — xử lý background (resize ảnh thumbnail, extract video info)

**Frontend:**
- Upload component: drag & drop, progress bar
- Media gallery theo job
- Video player (HLS hoặc MP4 trực tiếp từ S3)
- Image lightbox

**Công nghệ thêm:**
- `multer` (nếu upload qua backend) hoặc presigned URL (upload thẳng S3)
- `bull` + `ioredis` — job queue
- `fluent-ffmpeg` — extract video duration/thumbnail (optional)

### ⏳ Giai đoạn 5: GCS Sensor Data
**Backend:**
- `POST /gcs/ingest` — endpoint nhận batch data từ GCS (API key auth riêng)
- Lưu vào `gcsData.raw` (Mixed) hoặc time-series collection riêng
- Stream data qua Socket.io đến frontend

**Frontend:**
- Chart sensor data theo thời gian (thư viện: Recharts hoặc Chart.js)
- Live telemetry panel trong ProjectDetailPage

**Công nghệ thêm:**
- `socket.io` — realtime push
- `recharts` — biểu đồ sensor

### ⏳ Giai đoạn 6: Notification
**Backend:**
- `Notification` model: `{ user, type, message, read, createdAt }`
- Trigger: job status thay đổi, project sắp bắt đầu (cron), upload hoàn tất
- `GET /notifications` + `PATCH /notifications/:id/read`
- Socket.io push khi có notification mới

**Frontend:**
- Bell icon dropdown thực sự (hiện tại đã có UI placeholder)
- Trang /notifications với lịch sử
- Mark as read, xóa thông báo

### ⏳ Giai đoạn 7: Dashboard & Reports
**Backend:**
- Aggregate API: project theo tháng, job success rate, ROV utilization
- `GET /reports/export?type=project&id=xxx` — xuất PDF

**Frontend:**
- Dashboard có biểu đồ thực: bar chart projects/tháng, pie chart job status
- Project timeline (Gantt đơn giản)
- Export PDF/CSV báo cáo project

**Công nghệ thêm:**
- `recharts` hoặc `chart.js`
- `puppeteer` hoặc `pdfkit` — tạo PDF server-side

### 💡 Giai đoạn 8: Tính năng nâng cao (nếu còn thời gian)

#### Chatbot hỗ trợ vận hành
- Tích hợp Claude API (hoặc OpenAI)
- Trả lời câu hỏi về trạng thái ROV, lịch sử project
- Tóm tắt báo cáo job bằng ngôn ngữ tự nhiên
- Stack: `@anthropic-ai/sdk`, streaming response qua SSE

#### Map Tracking
- Hiển thị vị trí project trên bản đồ
- Vẽ route di chuyển của ROV theo GPS log từ GCS
- Stack: `Leaflet.js` hoặc `MapLibre GL` (free) / `Google Maps API`

#### Audit Log
- Ghi lại toàn bộ action: ai tạo/sửa/xóa gì, lúc nào
- `AuditLog` model: `{ user, action, resource, resourceId, changes, ip, createdAt }`
- Trang xem lịch sử (admin only)

#### Email Notification
- Gửi email khi project hoàn tất, job failed
- Stack: `nodemailer` + Gmail SMTP hoặc `SendGrid`

---

## MongoDB Indexes cần thêm

```js
// Đã cần ngay — ảnh hưởng query hiện tại
ROV:  { status: 1 }, { createdAt: -1 }
Project: { status: 1 }, { createdAt: -1 }, { rov: 1 }
Job:  { status: 1 }, { project: 1 }, { createdAt: -1 }
User: { email: 1 } (unique — đã có), { role: 1 }

// Cần khi làm giai đoạn 5
SensorData: { job: 1, timestamp: -1 }
```

---

## Redis — kế hoạch sử dụng

| Tính năng | Key pattern | TTL |
|---|---|---|
| Refresh token blacklist (logout) | `blacklist:{token}` | 7 ngày |
| Cache GET /rovs | `cache:rovs:{query_hash}` | 60s |
| Cache GET /projects | `cache:projects:{query_hash}` | 30s |
| Rate limit (production) | `ratelimit:{ip}` | 15 phút |
| Bull queue jobs | tự quản lý | — |

---

## Phân quyền mở rộng

| Tính năng | admin | operator | viewer |
|---|---|---|---|
| Quản lý user | ✅ | ❌ | ❌ |
| CRUD ROV | ✅ | Tạo/Sửa | Chỉ xem |
| CRUD Project/Job | ✅ | Tạo/Sửa | Chỉ xem |
| Upload media | ✅ | ✅ | ❌ |
| Xem media | ✅ | ✅ | ✅ |
| Ingest GCS data | API key riêng | — | — |
| Xem audit log | ✅ | ❌ | ❌ |
| Export report | ✅ | ✅ | ❌ |

---

## Cấu trúc thư mục đích đến

```
rov-management/
├── backend/src/
│   ├── config/
│   │   ├── db.js
│   │   └── redis.js          # giai đoạn 4
│   ├── middleware/
│   ├── utils/
│   ├── queues/               # giai đoạn 4 — Bull workers
│   │   └── media.queue.js
│   └── modules/
│       ├── auth/
│       ├── users/
│       ├── rovs/
│       ├── projects/
│       ├── jobs/
│       ├── media/            # giai đoạn 4
│       ├── notifications/    # giai đoạn 6
│       ├── reports/          # giai đoạn 7
│       └── gcs/              # giai đoạn 5 — ingest endpoint
│
└── frontend/src/
    ├── components/shared/
    ├── features/
    │   ├── auth/
    │   ├── dashboard/
    │   ├── rovs/
    │   ├── projects/
    │   ├── jobs/
    │   ├── media/            # giai đoạn 4
    │   ├── notifications/    # giai đoạn 6
    │   └── reports/          # giai đoạn 7
    └── hooks/
```

---

## Chạy local

```bash
# Redis (cần Docker)
docker run -d -p 6379:6379 redis:alpine

# Backend
cd backend && npm run dev   # port 5000

# Frontend
cd frontend && npm run dev  # port 5173
```

### Biến môi trường backend (.env)
```
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
```
