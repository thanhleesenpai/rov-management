# ROV Management System — Project Context

## Mô tả dự án
Web app quản lí ROV (Remotely Operated Vehicle) — đồ án tốt nghiệp.

**Luồng chính:**
- GCS (Ground Control Station) upload data/video lên AWS S3 qua API backend
- Người dùng đăng nhập vào web để xem thông tin ROV, video, quản lí job/trip

## Tech stack
- **Frontend:** React + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Express
- **Database:** MongoDB Atlas (cloud)
- **Storage:** AWS S3 (lưu video, sensor data, file từ GCS)
- **State:** Zustand + React Query
- **Auth:** JWT (access token 15 phút + refresh token 7 ngày)

## Cấu trúc thư mục
```
rov-management/
├── backend/               # Node.js + Express
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/db.js
│   │   ├── middleware/    # auth.middleware.js, error.middleware.js
│   │   ├── utils/         # jwt.util.js, response.util.js
│   │   └── modules/
│   │       ├── auth/      # register, login, logout, refresh, changePassword
│   │       └── users/     # user model + admin CRUD
│   └── .env               # Cần điền MONGODB_URI + JWT keys
│
└── frontend/              # React + Vite
    └── src/
        ├── store/auth.store.js       # Zustand, persist refreshToken
        ├── lib/axios.js              # Auto attach token + auto refresh
        ├── router/index.jsx          # Thêm route mới ở đây
        ├── components/shared/        # Layout, Sidebar, Navbar, ProtectedRoute
        └── features/
            ├── auth/                 # LoginPage, RegisterPage
            └── dashboard/            # DashboardPage (placeholder)
```

## Phân quyền (RBAC)
- `admin` — toàn quyền, quản lí user
- `operator` — tạo/quản lí trip, job, upload data
- `viewer` — chỉ xem

## Trạng thái hiện tại
**Đã hoàn thành: Giai đoạn 0 + 1 + 2 + 3**
- Setup project (backend + frontend)
- Auth: register, login, logout, refresh token, change password
- User management (admin): list, update role, toggle status
- Layout: Sidebar, Navbar, ProtectedRoute
- Pages: Login, Register, Dashboard (placeholder)
- **ROV Registry**: CRUD API `/api/v1/rovs`, danh sách + chi tiết + form tạo/sửa
  - Phân quyền: viewer chỉ đọc, operator tạo/sửa, admin xóa
  - Fields: name, model, serialNumber, status (active/maintenance/retired), specs (Mixed), notes
- **Trip Management**: CRUD API `/api/v1/trips`, danh sách (card) + chi tiết + form tạo/sửa
  - Phân quyền: viewer chỉ đọc, operator tạo/sửa, admin xóa
  - Fields: name, description, rov (ref), location, startTime, endTime, status (planned/ongoing/completed/cancelled), createdBy (ref)
- **Job Management**: CRUD API nested `/api/v1/trips/:tripId/jobs`, actions qua `/api/v1/jobs/:id`
  - Job hiển thị trong TripDetailPage (không có trang riêng)
  - Fields: title, description, status (pending/running/done/failed), trip (ref), createdBy (ref), gcsData.raw (placeholder)

## Test accounts (seed script)
Chạy `cd backend && node src/scripts/seed.js` để tạo:
- `admin@rov.local` / `Admin@123` — role: admin
- `operator@rov.local` / `Operator@123` — role: operator
- `viewer@rov.local` / `Viewer@123` — role: viewer

## Giai đoạn tiếp theo

**Giai đoạn 4 — S3 Upload & Media**
- Presigned URL upload
- Media model, gallery, video player

**Giai đoạn 5 — ROV Sensor Data (chờ GCS)**
- GCS chưa xong, placeholder đã có trong Job model (`gcsData.raw`)

**Giai đoạn 6 — Dashboard & Reports**

## Chạy local
```bash
# Backend (terminal 1)
cd backend && npm run dev   # port 5000

# Frontend (terminal 2)
cd frontend && npm run dev  # port 5173
```

## Lưu ý quan trọng
- `backend/.env` phải có MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET
- Frontend proxy `/api` → `http://localhost:5000` (cấu hình trong vite.config.js)
- Thêm route mới tại `frontend/src/router/index.jsx`
- Thêm module backend tại `backend/src/modules/<tên-module>/`
- Mỗi module gồm: routes.js, controller.js, service.js, (validation.js)
- Dùng `response.util.js` để trả về `success()` / `error()` thống nhất
