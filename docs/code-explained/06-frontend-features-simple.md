# 06 — Frontend Features (Auth, Dashboard, Errors, Media, Profile, Projects, ROVs, Users, Audit)

Tài liệu này giải thích chi tiết các file "feature" đơn giản/độc lập trong `frontend/src/features/`. Các file liên quan tới **Trip** (TripList, TripsPage, TripDetailPage, ROVDataUpload, SonarViewer...) được document riêng ở `07-frontend-trips.md` — ở đây chỉ nhắc ngắn gọn khi có nhúng.

Bối cảnh chung (từ `CLAUDE.md`):
- Backend response luôn có dạng `{ success, message, data }`. Axios interceptor (`frontend/src/lib/axios.js`) trả thẳng `response.data`, nên kết quả của `await api.get(...)` là object `{ success, message, data }`.
- Payload thực tế nằm ở `result.data`:
  - Paginated (`projects`, `trips`, `rovs`, `media`): `{ data: [...], total, page, totalPages }`
  - Users: `{ users: [...], total, page, totalPages }`
  - Stats: object chứa nhiều field aggregation (`projectByStatus`, `tripByStatus`, `rovUtilization`, `activityTimeline`, ...)
  - Single object: chính object đó (vd `{ _id, name, ... }`)
- RBAC 3 role: `viewer` (chỉ đọc), `operator` (tạo/sửa project & trip, upload media), `admin` (toàn quyền + quản lý user + xóa).
- Nomenclature: **Project** = chuyến khảo sát lớn (route `/projects`), **Trip** = một lần lặn cụ thể bên trong Project (route `/trips`).

---

## Tổng quan các trang Feature đơn giản

| Route | Trang (component) | Mô tả 1 dòng |
|---|---|---|
| `/login` | `auth/LoginPage.jsx` | Đăng nhập bằng email/password hoặc Google OAuth |
| `/register` | `auth/RegisterPage.jsx` | Đăng ký tài khoản mới (role mặc định `viewer`) |
| `/auth/callback` | `auth/AuthCallback.jsx` | Nhận token từ Google OAuth redirect, lưu vào store rồi vào dashboard |
| `/dashboard` | `dashboard/DashboardPage.jsx` | Trang tổng quan: stat cards, 3 biểu đồ, danh sách project gần đây |
| `*` (not matched, ngoài Layout) | `errors/NotFoundPage.jsx` | Trang 404 tĩnh khi route không khớp bất kỳ pattern nào |
| Bên trong `Layout` khi `errorElement` trigger | `errors/RouteError.jsx` | Error boundary của react-router cho các route con trong Layout |
| — (component dùng chung) | `media/MediaGallery.jsx` | Hiển thị thư viện media (ảnh/video/doc) của 1 trip — dùng trong TripCard/TripDetailPage |
| — (component dùng chung) | `media/MediaUpload.jsx` | Modal upload file media qua presigned URL S3 |
| `/profile` | `profile/ProfilePage.jsx` | Trang tài khoản cá nhân: đổi tên/avatar, đổi mật khẩu, cài đặt |
| `/projects` | `projects/ProjectsPage.jsx` | Danh sách project — search/filter/pagination/export |
| `/projects/:id` | `projects/ProjectDetailPage.jsx` | Chi tiết 1 project — info, AI Summary, nhúng `<TripList>` |
| — (form con) | `projects/components/ProjectForm.jsx` | Modal tạo/sửa project, location search + map picker |
| — (component cũ, có thể không còn dùng) | `projects/components/SensorUpload.jsx` | Modal upload sensor CSV/JSON — xem ghi chú "Điểm đáng chú ý" bên dưới |
| `/rovs` | `rovs/RovsPage.jsx` | Danh sách ROV — search/filter/pagination/export |
| `/rovs/:id` | `rovs/RovDetailPage.jsx` | Chi tiết 1 ROV — KPI + lịch sử project |
| — (form con) | `rovs/components/RovForm.jsx` | Modal tạo/sửa ROV |
| `/users` | `users/UsersPage.jsx` | Quản lý user (admin) — search/filter/edit/bulk activate-disable-role |
| `/audit` (admin only) | `audit/AuditPage.jsx` | Xem audit log toàn hệ thống |

---

## Tổng quan luồng Google OAuth ở Frontend (AuthCallback)

1. User bấm "Continue with Google" ở `LoginPage.jsx` hoặc `RegisterPage.jsx` → `window.location.href = GOOGLE_AUTH_URL` (redirect thẳng ra ngoài React, không dùng React Router) tới `GET {VITE_API_URL}/auth/google`.
2. Backend redirect sang Google consent screen → callback `GET /auth/google/callback` → backend tạo/tìm user → redirect về frontend `/auth/callback?accessToken=...&refreshToken=...` (hoặc `?error=...` nếu thất bại).
3. `AuthCallback.jsx` chạy trong `useEffect`:
   - Đọc `accessToken`, `refreshToken`, `error` từ query string bằng `useSearchParams`.
   - Nếu thiếu token hoặc có `error` → `navigate('/login?error=oauth_failed')`.
   - Nếu hợp lệ: **lưu tạm** token vào Zustand store bằng `useAuthStore.setState({ accessToken, refreshToken })` (cách này set thẳng state, không qua action `setAuth`, vì lúc này chưa có object `user`).
   - Gọi `GET /auth/me` (axios instance tự đính token vừa lưu vào header nhờ interceptor) để lấy thông tin user đầy đủ.
   - Thành công: gọi `setAuth(res.data, accessToken, refreshToken)` (action chính thức của store — lưu cả `user` + 2 token) rồi `navigate('/dashboard', { replace: true })`.
   - Thất bại (`/auth/me` lỗi, vd token invalid): quay lại `/login?error=oauth_failed`.
4. `LoginPage.jsx` đọc `searchParams.get('error')`:
   - `oauth_failed` → hiện banner đỏ "Google sign-in failed. Please try again."
   - `account_disabled` → hiện banner đỏ "Account has been disabled" (dùng khi backend redirect kèm lỗi này, vd tài khoản Google bị admin disable).

Giao diện `AuthCallback` khi đang xử lý: nền tối `bg-gray-900`, icon `Anchor`, text "Signing you in..." + spinner — không có thao tác người dùng, thuần tự động.

---

## Tổng quan Export CSV/PDF

Toàn bộ export dùng chung `frontend/src/lib/export.js` — 2 hàm helper nội bộ:
- `toCSV(headers, rows)` + `downloadCSV(filename, csv)`: build CSV string (tự escape dấu phẩy/`"`/xuống dòng), thêm BOM `﻿` để Excel đọc đúng UTF-8, tạo Blob rồi trigger download qua thẻ `<a>` ẩn.
- `downloadPDF(filename, title, headers, rows)`: render 1 bảng HTML ẩn (`opacity:0`, width cố định 1060px) → chụp bằng `html2canvas` (scale 2x để nét) → cắt thành nhiều trang A4 landscape bằng `jsPDF`, mỗi trang là 1 slice canvas — cho phép bảng dài nhiều trang không bị cắt ngang dòng.

4 cặp hàm export theo entity, dùng ở đúng 4 trang danh sách tương ứng:

| Hàm | Dùng tại | Cột xuất |
|---|---|---|
| `exportProjectsCSV` / `exportProjectsPDF` | `ProjectsPage.jsx` | Name, ROV, Location, Status, Start/End Time, Created By (CSV có thêm Created By) |
| `exportTripsCSV` / `exportTripsPDF` | (dùng ở TripsPage — tài liệu 07) | Title, Project, Status, Created By, Created At |
| `exportRovsCSV` / `exportRovsPDF` | `RovsPage.jsx` | Name, Model, Serial Number, Status, Notes |
| `exportUsersCSV` / `exportUsersPDF` | `UsersPage.jsx` | Full Name, Email, Role, Status, Last Login |

**Cách gọi chung ở mọi trang danh sách** (pattern lặp lại ở ProjectsPage/RovsPage/UsersPage):
1. Component có nút `ExportMenu` (dropdown CSV/PDF, `@/components/shared/ExportMenu`) nhận 2 callback `onExportCSV`, `onExportPDF`.
2. Mỗi callback gọi lại API list **KHÔNG phân trang** (`limit: 1000` hoặc `limit: 100`) với cùng bộ filter/search hiện tại của trang — đảm bảo export đúng dữ liệu đang lọc, không chỉ trang hiện tại.
3. Lấy mảng từ `res.data.data` (projects/rovs) hoặc `res.data.users` (users) rồi truyền vào hàm export tương ứng.
4. File tải về tự động, tên file có dạng `{entity}_{YYYY-MM-DD}.csv/pdf` (hàm `dateTag()`).

`AuditPage.jsx` **không có** export — chỉ xem trực tiếp trên UI.

---

## Auth

### `frontend/src/features/auth/AuthCallback.jsx`
- **Chức năng chính:** Trang trung gian xử lý redirect từ Google OAuth callback, route `/auth/callback` (không nằm trong `Layout`/`ProtectedRoute`, đứng độc lập trong router).
- **Props/API chính:** Không nhận props. Dùng `useSearchParams()` để đọc query, `useAuthStore(s => s.setAuth)` để lấy action lưu auth. Gọi `GET /auth/me`.
- **Logic chi tiết:** Xem chi tiết ở section "Tổng quan luồng Google OAuth" phía trên. Điểm kỹ thuật đáng chú ý: dùng `useAuthStore.setState(...)` trực tiếp (không qua action) để tạm gắn token trước khi gọi `/auth/me`, vì instance axios cần token trong store để tự đính `Authorization` header.
- **RBAC trên UI:** Không áp dụng (trang trung gian, chưa xác thực role).
- **Kết nối với file khác:** `@/store/auth.store`, `@/lib/axios`. Được điều hướng tới bởi `LoginPage`/`RegisterPage` (qua redirect ngoài React) và điều hướng đi tới `/dashboard` hoặc `/login?error=oauth_failed`.
- **Điểm đáng chú ý:** UI tối giản, không cho phép user tương tác (không nút bấm) — nếu bị treo (network chậm) sẽ đứng ở "Signing you in..." vô thời hạn (không có timeout).

### `frontend/src/features/auth/LoginPage.jsx`
- **Chức năng chính:** Trang đăng nhập, route `/login`.
- **Props/API chính:** `useForm()` (react-hook-form) quản lý `email`, `password`. State cục bộ: `serverError`, `loading`, `showPassword`. Gọi `POST /auth/login`.
- **Logic chi tiết:**
  - Validate bằng react-hook-form: `email` và `password` đều `required`. Không có validate format email/password ở client (để backend xử lý).
  - `onSubmit`: gọi `api.post('/auth/login', data)` → response thẳng ra `{ user, accessToken, refreshToken }` (không bọc thêm `data.data` — vì axios interceptor tự bóc lớp `{success,message,data}` ra rồi, và authController trả `data` với 3 field này ở top-level).
  - Thành công: `setAuth(user, accessToken, refreshToken)` (Zustand) → `navigate('/dashboard')`.
  - Lỗi: ưu tiên `err.errors?.[0]?.msg` (lỗi validate dạng mảng từ backend, ví dụ express-validator) → fallback `err.message` → fallback thông báo mặc định.
  - Đọc `searchParams.get('error')` để hiện banner lỗi từ OAuth (`oauth_failed`, `account_disabled`) — xem section OAuth phía trên.
  - `GoogleButton`: redirect cứng bằng `window.location.href` tới `${VITE_API_URL}/auth/google` (không dùng React Router vì phải rời khỏi SPA để tới Google).
- **RBAC trên UI:** Không áp dụng — trang public.
- **Kết nối với file khác:** `@/components/bespoke/MarineButton`, `MarineInput`; `@/store/auth.store`; `@/lib/axios`. Link sang `/register`.
- **Điểm đáng chú ý:** Toggle hiện/ẩn password bằng icon `Eye`/`EyeOff` đặt tuyệt đối trong input. Nút Google đặt trên cùng, có divider "or sign in with email" ngăn cách 2 luồng.

### `frontend/src/features/auth/RegisterPage.jsx`
- **Chức năng chính:** Trang đăng ký tài khoản mới, route `/register`.
- **Props/API chính:** `useForm()` quản lý `fullName`, `email`, `password`, `confirmPassword`. Gọi `POST /auth/register`.
- **Logic chi tiết:**
  - Validate: `fullName` required; `email` required; `password` required + `minLength: 6`; `confirmPassword` required + `validate` so khớp với `watch('password')` ("Passwords do not match").
  - `onSubmit`: gọi `api.post('/auth/register', { email, password, fullName })` (không gửi `confirmPassword` lên server) → thành công thì `navigate('/login')` (không tự đăng nhập).
  - Lỗi hiển thị `err.message` trong banner đỏ.
  - Cũng có `GoogleButton` giống LoginPage, cùng redirect tới `/auth/google`.
- **RBAC trên UI:** Không áp dụng — trang public. Role mặc định của user mới do backend gán (`viewer`, theo CLAUDE.md).
- **Kết nối với file khác:** Giống LoginPage — `MarineButton`, `MarineInput`, `@/lib/axios`. Link sang `/login`.
- **Điểm đáng chú ý:** 2 toggle show/hide riêng biệt cho password và confirm password (`showPassword`, `showConfirm`).

---

## Dashboard

### `frontend/src/features/dashboard/DashboardPage.jsx`
- **Chức năng chính:** Trang tổng quan hệ thống, route `/dashboard` — hiển thị stat cards, 3 nhóm biểu đồ Recharts và bảng project gần đây. Đây là trang phức tạp nhất trong nhóm file được review ở tài liệu này.
- **Props/API chính:** Không nhận props (đọc từ store + query trực tiếp). Dùng nhiều `useQuery` song song:
  - `['rovs', { status: 'active' }]` → `GET /rovs?status=active&limit=1` — chỉ lấy `total` (đếm số ROV active), không cần data thật.
  - `['projects', { limit: 5 }]` → `GET /projects?limit=5` — lấy 5 project mới nhất cho bảng "Recent Projects".
  - `['trips', { status: 'running' }]` → `GET /trips?status=running&limit=1` — đếm số trip đang chạy.
  - `['projects', { limit: 1 }]` → `GET /projects?limit=1` — đếm tổng số project (`allProjects.total`).
  - `['users']` → `GET /users` — chỉ chạy khi `isAdmin` (`enabled: isAdmin`), lấy tổng số user.
  - `['stats', 'overview']` → `GET /stats/overview` — nguồn dữ liệu chính cho toàn bộ biểu đồ, có `retry: 1`.
  - Tất cả query stat card dùng `staleTime: 0, refetchOnWindowFocus: true` — luôn coi là stale, tự refetch khi quay lại tab (đúng theo quy ước CLAUDE.md "Dashboard dùng staleTime: 0").
- **Logic chi tiết — Stat cards:**
  - 4 thẻ (3 thẻ nếu không phải admin): Total Projects (`allProjects.total`, icon `Map`, click → `/projects`), Running Trips (`trips.total`, icon `Briefcase`, click → `/trips`), Active ROVs (`rovs.total`, icon `Anchor`, click → `/rovs`), và nếu admin thêm Total Users (`users.total`, icon `Users`, click → `/users`).
  - Khi `value === null` (query chưa resolve) → hiện `<Skeleton>` thay vì số 0 (tránh nhấp nháy "0 → N").
- **Logic chi tiết — 3 biểu đồ hàng 1 (từ field nào của `stats`):**
  1. **Project Status** (`StatusPie`, PieChart donut): dữ liệu = `stats.projectByStatus` — object dạng `{ planned: n, ongoing: n, completed: n, cancelled: n }`. Component `StatusPie` convert thành mảng `entries` (`Object.entries` → capitalize tên, gắn màu từ `PROJECT_COLORS` trong `@/lib/chartColors`), lọc bỏ `value === 0`. Vẽ `PieChart` với `innerRadius=48, outerRadius=60` (donut), kèm legend thủ công bên phải hiển thị tên + số.
  2. **Trips by Status** (BarChart dọc): dữ liệu build tay từ `stats.tripByStatus` thành mảng 4 phần tử cố định thứ tự `Pending, Running, Done, Failed`, màu lấy từ `TRIP_COLORS`. Mỗi cột tô màu riêng qua `<Cell>`.
  3. **ROV Utilization** (BarChart ngang, `layout="vertical"`): dữ liệu = `stats.rovUtilization` — mảng object dạng `{ name, projects }` (số project mỗi ROV từng tham gia). Nếu mảng rỗng → text "No data". Màu cột lấy tuần tự từ `ROV_PALETTE` theo index (`i % ROV_PALETTE.length`).
- **Logic chi tiết — Activity Timeline (hàng 2):** AreaChart nhiều lớp (3 `<Area>` chồng), dữ liệu = `stats.activityTimeline` — mảng 6 tháng gần nhất, mỗi phần tử có `{ name, projects, trips, media }`. Mỗi field vẽ 1 Area riêng với gradient riêng (`grad-projects`, `grad-trips`, `grad-media`, định nghĩa trong `<defs>`), màu từ `LINE_COLORS`. Có `<Legend>` cho phép người dùng biết field nào ứng màu nào (không có click-to-toggle như SensorChart bên Trip).
- **Chi tiết khác:**
  - `CustomTooltip` dùng chung cho mọi chart — custom render thay Tooltip mặc định của Recharts, style theo `bg-popover/95 backdrop-blur-sm`.
  - `gridColor` đổi theo `useThemeStore().isDark` — light dùng `#e2e8f0`, dark dùng `#1e293b` (gridline gần như vô hình, đúng thiết kế "near-invisible gridlines").
  - `ChartCard` wrapper chung cho 3 card hàng 1 + card Activity Timeline: tự hiện `<Skeleton>` khi `loading`, hoặc text lỗi đỏ khi `error` (tương ứng `statsLoading`/`statsError` từ query `stats`).
- **RBAC trên UI:** Chỉ admin thấy thẻ "Total Users" (điều kiện `isAdmin` = `user?.role === 'admin'`); query `users` cũng chỉ chạy khi admin (tránh gọi API thừa/bị 403 với role thấp hơn).
- **Kết nối với file khác:** `@/store/auth.store`, `@/store/theme.store`, `@/components/shared/Skeleton`, `@/components/shared/EmptyState`, `@/lib/chartColors` (bảng màu dùng chung toàn app cho chart), `@/components/bespoke/MarineTable*`, `@/components/bespoke/MarineButton`. Gọi API: `/rovs`, `/projects`, `/trips`, `/users`, `/stats/overview`.
- **Điểm đáng chú ý:**
  - Bảng "Recent Projects" có 2 layout: desktop (`hidden xl:block`, dùng `MarineTable`) và mobile card list (`xl:hidden`) — pattern lặp lại xuyên suốt toàn bộ app cho mọi trang danh sách.
  - Empty state khi không có project nào: `<EmptyState icon={Map} title="No projects yet" />`.
  - Loading state cho bảng project: 3 `<Skeleton>` cao `h-14` xếp dọc, hiện khi `projects === undefined || allProjects === undefined` (chờ cả 2 query).
  - Link ROV trong bảng dùng `.replace(/^ROV\s+/i, '')` để cắt bớt prefix "ROV " khỏi tên hiển thị cho gọn (badge chữ "ROV" đã có sẵn cạnh đó).

---

## Errors

### `frontend/src/features/errors/NotFoundPage.jsx`
- **Chức năng chính:** Trang 404 tĩnh, dùng làm phần tử cho path `*` ở tầng ngoài cùng router (`createBrowserRouter`) — bắt mọi URL không khớp bất kỳ route nào kể cả `/login`, `/register`.
- **Props/API chính:** Không có state/query. Chỉ dùng `useNavigate()`.
- **Logic chi tiết:** Hiển thị icon `Anchor`, tiêu đề "404", mô tả "This page doesn't exist or you don't have access.", nút "Back to Dashboard" → `navigate('/dashboard')`.
- **RBAC trên UI:** Không áp dụng.
- **Kết nối với file khác:** Đăng ký trực tiếp trong `router/index.jsx` ở path `*`.
- **Điểm đáng chú ý:** Dùng màu cứng (`bg-gray-50`, `text-gray-800`, `bg-blue-600`...) chứ **không** dùng design token (`bg-background`, `text-foreground`...) — khác với `RouteError.jsx` đã migrate sang token hệ thống. Có thể là điểm chưa đồng bộ dark-mode (trang này sẽ luôn hiện nền sáng dù đang bật dark mode).

### `frontend/src/features/errors/RouteError.jsx`
- **Chức năng chính:** Error boundary cho route con bên trong `Layout` (khai báo qua `errorElement` ở router cấp `/`) — bắt lỗi runtime (throw trong loader/component) hoặc lỗi 404/HTTP status do react-router tạo ra khi render thất bại trong các trang con đã qua `ProtectedRoute`.
- **Props/API chính:** `useRouteError()` (react-router hook) lấy lỗi hiện tại; `useNavigate()` để quay về dashboard.
- **Logic chi tiết:**
  - Đọc `error?.status` — nếu `=== 404` thì `is404 = true`, đổi text hiển thị thành "Page not found"; ngược lại hiện "Something went wrong".
  - Hiển thị `error?.statusText || error?.message || 'An unexpected error occurred.'` làm mô tả chi tiết.
  - Nút "Back to Dashboard" (icon `Home`) → `navigate('/dashboard')`.
- **RBAC trên UI:** Không áp dụng.
- **Kết nối với file khác:** Gắn ở `router/index.jsx` (`errorElement={<RouteError />}` ở object route path `/`). Ví dụ thực tế: `ProjectDetailPage.jsx` khi `isError || !project` sẽ `throw new Error('Project not found')` — lỗi này bị `RouteError` bắt và hiển thị (`is404` = false vì đây là `Error` thường không có `.status`, nên sẽ hiện "Something went wrong" kèm message "Project not found").
- **Điểm đáng chú ý:** Dùng đúng design token (`bg-background`, `text-foreground`, `bg-destructive/10`...) — khác NotFoundPage. Đây là error boundary "trong app" (khi đã đăng nhập), còn NotFoundPage là "ngoài app" (route không khớp gì cả, kể cả routes public).

---

## Media (dùng chung bởi Project/Trip)

### `frontend/src/features/media/MediaGallery.jsx`
- **Chức năng chính:** Component hiển thị thư viện media (video/ảnh/document) của **1 trip cụ thể** — dùng trong phần expanded của TripCard (ProjectDetailPage → TripList, xem tài liệu 07) và có thể trong TripDetailPage. Không phải 1 trang độc lập, không có route riêng.
- **Props/API chính:**
  - Prop: `tripId` (bắt buộc).
  - Query: `['media', tripId]` → `GET /media/trip/{tripId}` — trả thẳng mảng media (không phân trang; endpoint `data` = array các media object).
  - Query phụ mỗi card: `useMediaUrl(mediaId)` → `['media-url', mediaId]` → `GET /media/{mediaId}/url` — lấy presigned URL để load ảnh/video/preview (staleTime 50 phút — presigned URL S3 thường sống lâu hơn, tránh gọi lại liên tục).
  - Mutation xóa: `deleteMutation` → `DELETE /media/{id}`; `bulkDeleteMutation` → `DELETE /media/bulk` (body `{ ids }`).
- **Logic chi tiết:**
  - **Tabs lọc loại file**: `All / Videos / Images / Docs` (tab nào không có file loại đó thì ẩn khỏi thanh, trừ "All"). Hàm `resolveType(media)` xác định loại dựa vào `media.type` backend trả, fallback đoán theo phần mở rộng file (`VIDEO_EXTS`, `IMAGE_EXTS`, PDF → document, còn lại → "other").
  - **Card theo loại**: `ImageCard` (ảnh tĩnh + spinner load), `VideoCard` (video autoplay khi hover trên desktop, tap-to-preview trên touch — dò bằng `matchMedia('(hover: none)')`), `DocCard` (icon FileText + tên file cho PDF/other).
  - **Reorder kéo-thả**: dùng `@dnd-kit/sortable` (`SortableContext` + `useSortable` trong `SortableCard`) — chỉ bật khi `canDrag` (role admin/operator) và không ở `selectMode`. Kéo thả để đổi `order` (logic gọi API reorder không nằm trực tiếp trong file này — khả năng xử lý ở component cha hoặc DnD context toàn cục, `useDndContext()` được dùng để phát hiện kéo item xuyên trip khác — `CrossJobGhost` render placeholder mờ khi kéo media từ trip khác thả vào gallery hiện tại).
  - **Select mode + Bulk delete**: bấm "Select" → `selectMode = true`, mỗi card hiện `SelectOverlay` (check tròn). "Select all"/"Deselect all" toggle hết. Khi có ít nhất 1 item được chọn → nút "Delete (N)" → `ConfirmDialog` → `bulkDeleteMutation`.
  - **Lightbox**: click card (ngoài select mode) → mở `Lightbox` (phóng to ảnh/video full màn hình), điều hướng bằng phím mũi tên trái/phải hoặc nút, có dải thumbnail phía dưới nếu nhiều file, `Escape` để đóng. Nếu media đang `analysisStatus === 'pending'` (YOLO đang phân tích — TASK 6b) hiện dòng "Analyzing…" với spinner.
  - **Bbox overlay (YOLO detections)**: `LbDetectionSVG` vẽ SVG rectangle theo `media.labels[].bbox` (tọa độ tỉ lệ 0-1) đè lên ảnh/video trong Lightbox — chỉ hiện khi `showDetections = true` (nhưng file không thấy nút toggle bật `showDetections` trong Lightbox — có thể control này nằm ở nơi khác hoặc là tính năng đang phát triển dở/ẩn tạm).
  - **Download**: nút download trong overlay của mỗi card, dùng hàm `triggerDownload` tạo thẻ `<a download>` ẩn.
- **RBAC trên UI:**
  - `canDelete = user?.role === 'admin'` — chỉ admin thấy nút xóa từng file, nút "Select" (bulk), và nút xóa trong overlay.
  - `canDrag = ['admin','operator'].includes(role)` — chỉ admin/operator kéo-thả sắp xếp lại được.
  - Viewer: chỉ xem, tải về, mở lightbox — không có nút Select/Delete/Reorder.
- **Kết nối với file khác:** `@/lib/axios`, `@/store/auth.store`, `@/components/shared/ConfirmDialog`, `@dnd-kit/sortable`, `@dnd-kit/core`, `@dnd-kit/utilities`. Dùng trong TripList (tài liệu 07). Gọi API: `GET /media/trip/:tripId`, `GET /media/:id/url`, `DELETE /media/:id`, `DELETE /media/bulk`.
- **Điểm đáng chú ý:**
  - Empty state đơn giản: text "No files uploaded yet." khi `allMedia.length === 0`.
  - Loading skeleton: lưới 3 ô vuông `animate-pulse`.
  - `media.recordedAt` (TASK 6c) hiện badge "SYNCED" màu emerald góc trên-trái của `VideoCard` — báo hiệu video này có mốc thời gian để sync với sensor chart.
  - `media.analysisStatus === 'pending'` hiện icon spinner nhỏ góc trên-phải của card — feedback trực quan job YOLO đang chạy nền (Bull queue).

### `frontend/src/features/media/MediaUpload.jsx`
- **Chức năng chính:** Modal upload nhiều file media (video/ảnh/PDF) lên S3 thông qua presigned URL, dùng chung cho Project/Trip (component nhận `tripId`/`projectId` từ props). Không phải trang, là modal popup.
- **Props/API chính:**
  - Props: `tripId`, `projectId`, `onClose`.
  - State: `files` — mảng object `{ file, status, progress, error, recordedAt }` với `status` ∈ `idle|uploading|done|error`.
  - Không dùng `useQuery`; dùng `useQueryClient()` để invalidate `['media', tripId]` sau khi upload xong.
  - API theo từng file (hàm `uploadFile`): `POST /media/presigned-url` (body: `tripId, projectId, fileName, mimeType, size, recordedAt?`) → nhận `{ uploadUrl, media }` → `PUT` thẳng file lên `uploadUrl` (S3, qua `XMLHttpRequest` để lấy % progress) → `PATCH /media/{media._id}/confirm` để backend đánh dấu `status: 'ready'`.
- **Logic chi tiết:**
  - Dùng `react-dropzone` (`useDropzone`) — kéo thả hoặc click chọn file, giới hạn `maxSize = 500MB`, `accept` chỉ nhận video/ảnh/PDF/m4a theo MIME + extension.
  - `onDrop`: tách file bị `rejected` (quá lớn hoặc sai định dạng) → toast lỗi tương ứng. Tách riêng các file có phần mở rộng ROV data (`.sonar`, `.csv`, `.json`) ra khỏi danh sách upload — báo `toast.warning` yêu cầu dùng nút "Upload ROV Data" riêng (đây chính là điểm phân luồng giữa Media thường và ROVDataUpload — tài liệu 07). Các file media hợp lệ còn lại được thêm vào `files` state với `status: 'idle'`.
  - `resolveMime(file)`: một số trình duyệt Windows trả `file.type` rỗng cho `.mov`/`.avi` → fallback tra bảng `EXT_MIME` theo đuôi file.
  - `uploadAll()`: lặp tuần tự (không song song) qua từng file có `status === 'idle'`, set `uploading` → gọi `uploadFile` → cập nhật `progress` theo callback `onProgress` → `done` hoặc `error` kèm message. Sau khi chạy hết: invalidate query `['media', tripId]`, toast tổng kết (`X uploaded` / `X uploaded, Y failed`).
  - **`recordedAt` cho video** (TASK 6c): nếu file là video và đang `idle`, hiện thêm input `datetime-local` (step giây) để nhập thời điểm bắt đầu quay — optional, dùng để đồng bộ chart sensor sau này. Giá trị này được gửi kèm khi tạo presigned URL (`new Date(recordedAt).toISOString()`).
- **RBAC trên UI:** Bản thân file không tự kiểm tra role — nút mở modal này (từ component cha, vd TripCard) chỉ hiện với `operator`/`admin` theo CLAUDE.md, còn `MediaUpload` giả định đã được bảo vệ từ nơi gọi nó.
- **Kết nối với file khác:** `@/lib/axios`. API: `POST /media/presigned-url`, `PATCH /media/:id/confirm`. Được mở từ TripCard trong TripList/ProjectDetailPage (chi tiết ở tài liệu 07).
- **Điểm đáng chú ý:**
  - Không cho đóng modal (`disabled={isUploading}`) khi đang có file đang tải để tránh mất tiến trình.
  - Nút Cancel/Close đổi label thành "Close" khi tất cả file đã `done`.
  - Progress bar cấp từng file (không có progress bar tổng).
  - Không tự động retry file lỗi — user phải xóa và kéo lại (không có nút "Retry" trên UI hiện tại).

---

## Profile

### `frontend/src/features/profile/ProfilePage.jsx`
- **Chức năng chính:** Trang quản lý tài khoản cá nhân, route `/profile`, có 3 tab: "My Profile", "Change Password", "Settings".
- **Props/API chính:**
  - Đọc `activeTab` từ query string (`useSearchParams`, mặc định `'profile'`) — cho phép link trực tiếp tới `/profile?tab=password`.
  - `useAuthStore()` lấy `user`, `updateUser` (action ghi đè user trong store sau khi sửa).
  - `updateMutation`: `PATCH /auth/me` (đổi `fullName` hoặc `avatar`) — dùng chung cho cả `ProfileTab` (đổi tên) và `AvatarUpload` (đổi avatar, gọi trực tiếp `api.patch` không qua mutation này vì cần xử lý trình tự upload S3 trước).
  - `PasswordTab` có `mutation` riêng: `PATCH /auth/change-password` (body `{ currentPassword, newPassword }`).
- **Logic chi tiết:**
  - **Tab "My Profile" (`ProfileTab`)**: form nội bộ chỉ có `fullName` (email/role/createdAt hiển thị disabled, không sửa được — "Email cannot be changed"). Nút "Save Changes" disable khi đang pending, khi `fullName` không đổi, hoặc rỗng. Khi lưu thành công → `updateUser(res.data)` cập nhật Zustand + toast "Profile updated".
  - **`AvatarUpload`**: click vào avatar tròn → chọn file ảnh (validate `image/*`, tối đa 5MB) → `POST /auth/me/avatar/presigned` lấy `{ uploadUrl, s3Key }` → `fetch(uploadUrl, {method:'PUT', body:file})` upload thẳng S3 → `PATCH /auth/me { avatar: s3Key }` (backend trả lại presigned URL mới, đã ký, để hiển thị luôn) → `updateStore({avatar: url})`. Có overlay hover hiện icon `Camera` hoặc spinner khi đang upload. Avatar rỗng thì hiện initials (2 ký tự cuối các từ trong tên, viết hoa) trên nền `bg-primary`.
  - **Tab "Change Password" (`PasswordTab`)**: form độc lập 3 trường (`currentPassword`, `newPassword`, `confirmPassword`), mỗi trường có toggle show/hide riêng. Validate client: `newPassword !== confirmPassword` → lỗi "New passwords do not match"; `newPassword.length < 6` → lỗi "New password must be at least 6 characters". Gửi lên server chỉ `currentPassword` + `newPassword`. Thành công → reset form + toast; lỗi → hiện `err.message` trong banner đỏ phía trên form (thường là "Current password incorrect" từ backend).
  - **Tab "Settings" (`SettingsTab`)**: UI placeholder — chọn ngôn ngữ (`en`/`vi`, chỉ lưu state cục bộ, KHÔNG gọi API, KHÔNG persist), toggle "Email Notifications" (checkbox thuần CSS, `defaultChecked`, không có handler — chưa nối logic thật). Ghi chú rõ trong code "More settings coming soon."
- **RBAC trên UI:** `isGoogleUser = user?.authProvider === 'google'` → nếu đúng, tab "Change Password" bị lọc khỏi `visibleTabs` (Google user không có password nội bộ để đổi) — đúng theo checklist TASK 1 trong CLAUDE.md.
- **Kết nối với file khác:** `@/store/auth.store`, `@/lib/axios`, `MarineSelect`, `MarineButton`, `MarineInput`. API: `PATCH /auth/me`, `PATCH /auth/change-password`, `POST /auth/me/avatar/presigned`.
- **Điểm đáng chú ý:**
  - Role hiển thị dưới tên bằng badge màu (`ROLE_STYLE`: admin=tím, operator=xanh dương, viewer=xám) — chỉ đọc, không sửa được ở đây (đổi role là việc của admin trong `UsersPage`).
  - Không có skeleton loading — `user` luôn có sẵn từ store khi vào trang (đã qua `ProtectedRoute`).
  - Đây là ví dụ điển hình về pattern tabs qua query string thay vì local state thuần, giúp back/forward trình duyệt hoạt động đúng và có thể share link tab cụ thể.

---

## Projects

### `frontend/src/features/projects/ProjectsPage.jsx`
- **Chức năng chính:** Danh sách toàn bộ Project, route `/projects` — search, filter nâng cao, phân trang, export, tạo/sửa/xóa.
- **Props/API chính:**
  - State: `showForm`, `editing`, `confirmDelete`, `search`, `filterStatus`, `filterRov`, `fromDate`, `toDate`, `page` (`LIMIT = 10`).
  - `debouncedSearch` qua hook `useDebounce(search)` (tránh gọi API mỗi keystroke).
  - Query chính: `['projects', {page, search, status, rovId, fromDate, toDate}]` → `GET /projects` với đầy đủ params filter, `keepPreviousData: true` (giữ dữ liệu cũ khi đang tải trang mới, tránh giật layout), `refetchInterval: 60000` (tự làm mới mỗi phút).
  - Query phụ: `['rovs','all']` → `GET /rovs?limit=100` để đổ danh sách vào dropdown filter ROV.
  - `deleteMutation`: `DELETE /projects/{id}`.
- **Logic chi tiết:**
  - **Search**: input text tìm theo tên/location (param `search`, xử lý phía backend). Mỗi lần đổi giá trị filter/search đều `setPage(1)` để tránh kẹt ở trang không tồn tại.
  - **Filter nâng cao**: dropdown Status (planned/ongoing/completed/cancelled), dropdown ROV (danh sách động), 2 `MarineDatePicker` cho khoảng ngày (`fromDate`→`toDate`, có `min={fromDate}` ràng buộc logic ngày sau ngày trước).
  - **Clear filters**: nút đỏ chỉ hiện khi `hasActiveFilter` (bất kỳ filter status/rov/fromDate/toDate nào khác rỗng) — reset tất cả về `''` + về trang 1.
  - **Export CSV/PDF**: `fetchAllProjects()` gọi lại `/projects` với `limit: 1000` + cùng bộ filter hiện tại (không phân trang) → truyền `res.data.data` vào `exportProjectsCSV`/`exportProjectsPDF` (từ `@/lib/export`).
  - **Phân trang**: component `<Pagination>` dùng `data.page`, `data.totalPages`, `data.total`, `limit`.
  - **CRUD**: nút "New Project" mở `<ProjectForm>` (không có `projectData` → chế độ tạo mới); action menu mỗi dòng có "Edit" (mở form với `projectData = project`) và "Delete" (mở `ConfirmDialog`, cảnh báo rõ "All associated trips in this project will also be deleted").
- **RBAC trên UI:**
  - `canEdit = ['admin','operator'].includes(role)` — hiện nút "New Project", "Edit".
  - `canDelete = role === 'admin'` — chỉ admin thấy "Delete".
  - Viewer: chỉ xem danh sách, search/filter/export, click vào để xem chi tiết — không có nút sửa/xóa/tạo.
- **Kết nối với file khác:** `ProjectForm` (component con), `@/components/shared/{CardSkeleton, ConfirmDialog, Pagination, ExportMenu, EmptyState}`, `MarineInput/Select/DatePicker/Table*/Button`, `@/lib/export`, `@/hooks/useDebounce`. API: `GET/DELETE /projects`, `GET /rovs`.
- **Điểm đáng chú ý:**
  - 2 layout song song: bảng desktop (`xl:block`) và card list mobile (`xl:hidden`) — pattern chuẩn toàn app.
  - Cột "Location" ưu tiên `project.locationName` (tên địa danh reverse-geocode từ GPS, TASK 5/6) trước `project.location` (text nhập tay).
  - Empty state có 2 biến thể: "No projects match your filters" (khi đang filter/search mà rỗng) vs "No projects yet" (khi thực sự chưa có project nào, kèm nút "Create Project" nếu `canEdit`).

### `frontend/src/features/projects/components/ProjectForm.jsx`
- **Chức năng chính:** Modal tạo mới / chỉnh sửa 1 Project — bao gồm tìm kiếm địa điểm qua OpenStreetMap Nominatim và chọn tọa độ trên bản đồ Leaflet.
- **Props/API chính:**
  - Props: `projectData` (nếu có → chế độ edit), `onClose`.
  - State: `form` (`name, description, rov, startTime, endTime, status`), `locationData` (`name, lat, lng`), `error`, `pendingSave` (dùng cho cảnh báo đổi vị trí quá xa).
  - Query: `['rovs','active']` → `GET /rovs?limit=100&status=active` — chỉ cho chọn ROV đang active khi tạo/sửa project.
  - Mutation: `isEdit ? PATCH /projects/{id} : POST /projects`.
- **Logic chi tiết:**
  - **`LocationSearch`** (component con): input tìm kiếm địa điểm, debounce 400ms, gọi trực tiếp Nominatim API (`https://nominatim.openstreetmap.org/search`) từ client (không qua backend), giới hạn 5 kết quả, có `User-Agent` header. Nếu người dùng paste chuỗi dạng tọa độ `"16.05, 108.22"` (regex `COORD_RE`) và hợp lệ (trong khoảng lat ±90, lng ±180) → set thẳng GPS, bỏ qua tìm kiếm. Gõ text thường → xóa GPS cũ (`lat:null, lng:null`) để tránh lệch tên/tọa độ.
  - **`MapPickerModal`**: nút icon bản đồ mở modal chứa Leaflet map (dynamic `import('leaflet')`), click vào bản đồ để đặt marker, "Confirm Location" trả `{lat, lng}` → tên hiển thị tự set thành chuỗi tọa độ làm tròn 4 chữ số thập phân.
  - **Validate/cảnh báo khi Edit**: dùng `haversineKm()` tính khoảng cách giữa GPS gốc (`projectData.gpsLocation`) và GPS mới nhập. Nếu > `LOCATION_WARN_KM = 100` km → không submit ngay mà mở `ConfirmDialog` cảnh báo "Location changed significantly... Save anyway?" (`pendingSave`), chỉ khi user xác nhận mới thực sự `mutation.mutate()`.
  - **`buildPayload()`**: gộp `form` + `location`/`locationName` (đều set = `locationData.name`) + `gpsLocation: {lat, lng}` + chuẩn hóa `startTime`/`endTime` rỗng thành `null`.
  - Submit thành công → invalidate `['projects']`, toast "Project created"/"Project updated", đóng modal.
- **RBAC trên UI:** Không tự kiểm tra role bên trong form — được mở có điều kiện từ `ProjectsPage`/`ProjectDetailPage` (chỉ `canEdit` mới thấy nút mở form).
- **Kết nối với file khác:** `MarineSelect/Button/Input/Textarea/DatePicker`, `@/components/shared/ConfirmDialog`, thư viện `leaflet` (CSS import trực tiếp `leaflet/dist/leaflet.css`). API: `POST/PATCH /projects`, `GET /rovs`.
- **Điểm đáng chú ý:**
  - Đây là 1 trong số ít form có tích hợp bản đồ thực (Leaflet) + geocoding thực (Nominatim) thay vì chỉ nhập text — khớp với tech stack "Map: Leaflet.js + OpenStreetMap" trong CLAUDE.md.
  - `startTime`/`endTime` cắt chuỗi ISO về 16 ký tự (`.slice(0,16)`) để khớp định dạng input `datetime-local`.
  - Dropdown ROV chỉ hiện ROV `active` — tránh gán project mới cho ROV đang bảo trì/nghỉ hưu.

### `frontend/src/features/projects/components/SensorUpload.jsx`
- **Chức năng chính:** Modal upload sensor data (CSV/JSON) gắn với 1 Trip cụ thể — hỗ trợ 2 định dạng: "Standard CSV" (`timestamp,depth,temp[,...]`) và "GCS log" (định dạng riêng của thiết bị: `Time,Roll,Pitch,Yaw,Depth,...`, dùng dấu phẩy làm phân cách thập phân kiểu châu Âu).
- **Props/API chính:**
  - Props: `trip`, `projectId`, `projectGpsLocation`, `onClose`.
  - `uploadMutation`: `POST /trips/{tripId}/sensor-data/upload` (body `{readings}`).
  - `clearMutation`: `DELETE /trips/{tripId}/sensor-data`.
- **Logic chi tiết:**
  - **2 parser riêng biệt**:
    - `parseCSV(text)`: parser chuẩn, validate có đủ cột bắt buộc `timestamp, depth, temp`, mỗi dòng thiếu giá trị bắt buộc → throw lỗi kèm số dòng.
    - `parseGCS(text, baseDate)`: parser cho log thiết bị GCS — nhận diện qua `isGCSFormat()` (có đủ header `time`, `temperature`, `lightlevel`). Điểm phức tạp nhất: hàm `reassembleCommaDecimal()` phải "ghép lại" các token bị tách nhầm bởi dấu phẩy CSV vì file gốc dùng dấu phẩy làm phân cách thập phân (vd cột `Depth` giá trị `-0,1` bị CSV split thành 2 token `-0` và `1`) — logic dựa vào bảng kiểu cột `GCS_COL_TYPES` để biết cột nào là `float` (cần ghép) vs `int`/`string` (không ghép). Timestamp của GCS chỉ có giờ (`HH:MM:SS`) nên phải ghép thêm `baseDate` (lấy từ `trip.startTime`, hoặc ngày hiện tại nếu trip chưa có `startTime`) để ra ISO timestamp đầy đủ.
  - `parseFile()`: điều phối — nếu đuôi `.json` thì parse thẳng mảng JSON; nếu `.csv` thì đọc dòng header để tự động chọn `parseGCS` hay `parseCSV`.
  - **Cảnh báo GPS mismatch**: `doUpload()` kiểm tra `lat`/`lng` của dòng đầu tiên trong file, nếu có và có `projectGpsLocation` tham chiếu, tính khoảng cách bằng `haversineKm()` — nếu > 50km → không upload ngay, mở `ConfirmDialog` "GPS location mismatch... Upload anyway?" (`pendingUpload`).
  - Upload thành công → invalidate 4 query keys (`trips[projectId]`, `trips[tripId]`, `projects[projectId]`, `sensor[tripId]`) để mọi nơi hiển thị sensor count/chart đều cập nhật.
  - **Clear**: nút "Clear" (chỉ hiện khi `trip.sensorCount > 0`) → `ConfirmDialog` → `clearMutation` xóa toàn bộ sensor data của trip.
- **RBAC trên UI:** Không tự check role — điều kiện hiện nút mở modal này nằm ở component cha (theo CLAUDE.md, chỉ `operator` upload sensor data được).
- **Kết nối với file khác:** `@/components/shared/ConfirmDialog`, `@/lib/axios`. API: `POST /trips/:id/sensor-data/upload`, `DELETE /trips/:id/sensor-data`.
- **Điểm đáng chú ý — QUAN TRỌNG:** Đối chiếu với `CLAUDE.md` (TASK 5, 6d), hệ thống hiện tại đã tiến hóa sang một component khác tên **`ROVDataUpload.jsx`** (`frontend/src/features/trips/components/ROVDataUpload.jsx`) hỗ trợ multi-file (sensor + DVL + sonar), cảnh báo overlap "first-in-first-keep", và không còn hành vi "chỉ giữ bản upload cuối". File `SensorUpload.jsx` trong thư mục `projects/components/` có khả năng là **phiên bản cũ/đã được thay thế** (legacy) — cần xác nhận trong code có còn được import/sử dụng ở đâu hay không trước khi coi đây là luồng upload chính thức hiện hành. Nếu không còn được import, nên coi đây là dead code khi thuyết trình hội đồng phản biện (tránh nhầm lẫn với ROVDataUpload đang hoạt động — tài liệu 07).

### `frontend/src/features/projects/ProjectDetailPage.jsx`
- **Chức năng chính:** Trang chi tiết 1 Project, route `/projects/:id` — hiển thị header, info grid, danh sách Trip (nhúng `<TripList>`), và section AI Summary.
- **Props/API chính:**
  - Query: `['projects', id]` → `GET /projects/{id}`. `refetchInterval` **động**: nếu `aiSummary.status === 'pending'` thì poll mỗi 3 giây, ngược lại 30 giây (đúng pattern TASK 3: "Poll GET /projects/:id mỗi 3s khi status === 'pending'").
  - `generateMutation`: `POST /projects/{id}/ai-summary` — enqueue Bull job sinh tóm tắt AI, trả 202.
- **Logic chi tiết:**
  - Header: nút Back, tên project, badge status (`STATUS` map y hệt `ProjectsPage`), nút "Edit" (mở `<ProjectForm projectData={project}>`).
  - Info grid: ROV (tên + model), Location, Start/End Time — mỗi ô chỉ render nếu có giá trị (không hiện field rỗng).
  - Dòng "Created by {fullName} · {ngày tạo}".
  - **`<TripList projectId={project._id} projectGpsLocation={project.gpsLocation} />`** — đây là phần chiếm phần lớn nội dung trang nhưng **được document chi tiết ở tài liệu `07-frontend-trips.md`** (theo yêu cầu, không đi sâu ở đây).
  - **`AISummarySection`**: panel có thể collapse/expand (`isOpen` state), nút toggle ngôn ngữ VI/EN (`useLangPref` — lưu preference vào `localStorage` key `rov-ai-lang`, không phải server-side). Hiển thị nội dung tóm tắt theo trạng thái `aiSummary.status`:
    - `pending`: banner tím "AI is generating the summary, please wait..." + spinner.
    - `failed`: banner đỏ "Failed to generate summary."
    - `done`: card gradient tím→xanh hiện `content` (chọn theo `lang`, fallback `vi` → `en`) + "Generated {datetime}".
    - Chưa có gì: text hướng dẫn tùy theo `project.status` (chỉ cho phép generate khi `status === 'completed'`) và quyền `canGenerate`.
    - Nút "Generate Summary"/"Regenerate" (icon đổi theo trạng thái đã có summary hay chưa) chỉ hiện khi `canGenerate && project.status === 'completed'` (`showButton`), disable khi đang `generating` hoặc `isPending`.
- **RBAC trên UI:** `canEdit = ['admin','operator'].includes(role)` — điều khiển cả nút "Edit" project lẫn `canGenerate` (quyền bấm "Generate Summary"). Viewer chỉ xem summary đã có, không thấy nút generate — đúng checklist TASK 3 ("Viewer thấy summary nhưng không thấy button Generate").
- **Kết nối với file khác:** `ProjectForm`, `TripList` (từ `@/features/trips/TripList` — xem tài liệu 07). API: `GET /projects/:id`, `POST /projects/:id/ai-summary`.
- **Điểm đáng chú ý:**
  - Nếu query lỗi hoặc không có `project` → `throw new Error('Project not found')` — lỗi này được `RouteError.jsx` (errorElement cấp Layout) bắt và hiển thị màn hình lỗi thân thiện thay vì crash trắng trang.
  - `ProjectDetailPage` nhúng `<TripList>` ở đây — xem tài liệu `07-frontend-trips.md` để biết chi tiết về TripCard, upload sensor/media, sonar/DVL, v.v.

---

## Rovs

### `frontend/src/features/rovs/RovsPage.jsx`
- **Chức năng chính:** Danh sách ROV, route `/rovs` — search, filter theo status, phân trang, export, CRUD.
- **Props/API chính:**
  - State: `showForm`, `editing`, `confirmDelete`, `rovProjectCount` (số project đang dùng ROV sắp xóa), `search`, `filterStatus`, `page` (`LIMIT=10`).
  - Query: `['rovs', {page, search, status}]` → `GET /rovs`, `keepPreviousData: true`.
  - `deleteMutation`: `DELETE /rovs/{id}`.
- **Logic chi tiết:**
  - **Kiểm tra ràng buộc trước khi xóa**: `handleDeleteClick(rov)` gọi trước `GET /projects?rovId={id}&limit=1` để lấy `total` (số project đang tham chiếu ROV này) → lưu vào `rovProjectCount` → mở `ConfirmDialog`. Nếu `rovProjectCount > 0`, dialog hiện cảnh báo "Cannot delete... it is being used in N project(s). Set its status to Maintenance or Retired instead." và **disable nút confirm** (`confirmDisabled={rovProjectCount > 0}`) — chặn xóa cứng ở tầng UI trước khi kịp gọi API xóa thật (dù backend chắc chắn cũng có validate riêng).
  - Lỗi khi xóa (trường hợp vẫn lọt qua, vd tình huống đua race condition): bắt message chứa "being used" hoặc "project" → hiện toast dài hơn (`duration: 5000`).
  - Search theo tên/model/serial (debounce), filter theo `status` (active/maintenance/retired).
  - Export CSV/PDF: `fetchAllRovs()` gọi `/rovs?limit=1000` cùng filter hiện tại → `exportRovsCSV`/`exportRovsPDF`.
- **RBAC trên UI:** `canEdit = ['admin','operator']` (nút "Add ROV", "Edit"); `canDelete = role === 'admin'` (nút "Delete").
- **Kết nối với file khác:** `RovForm`, `@/components/shared/{Skeleton, ConfirmDialog, Pagination, ExportMenu, EmptyState}`, `@/lib/export`. API: `GET/DELETE /rovs`, `GET /projects?rovId=`.
- **Điểm đáng chú ý:** Cách xử lý "không cho xóa ROV đang dùng" là ví dụ tốt về UX ngăn lỗi trước khi xảy ra (thay vì để user bấm xóa rồi nhận lỗi 400 từ backend).

### `frontend/src/features/rovs/components/RovForm.jsx`
- **Chức năng chính:** Modal tạo mới / sửa 1 ROV.
- **Props/API chính:** Props `rovData` (edit nếu có), `onClose`. State `form` (`name, model, serialNumber, status, notes`). Mutation: `isEdit ? PATCH /rovs/{id} : POST /rovs`.
- **Logic chi tiết:** Form đơn giản — 3 trường text `required` (Name, Model, Serial Number) sinh tự động qua vòng lặp `[['Name','name'],...]`.map, dropdown Status (active/maintenance/retired), textarea Notes (optional). Submit → invalidate `['rovs']`, toast, đóng modal.
- **RBAC trên UI:** Không tự check — chỉ mở khi `canEdit` từ trang cha.
- **Kết nối với file khác:** `MarineSelect/Button/Input/Textarea`. API: `POST/PATCH /rovs`.
- **Điểm đáng chú ý:** Không có validate định dạng gì thêm ngoài `required` — logic nghiệp vụ (serial trùng, v.v.) để backend xử lý.

### `frontend/src/features/rovs/RovDetailPage.jsx`
- **Chức năng chính:** Trang chi tiết 1 ROV, route `/rovs/:id` — 4 KPI card + info grid + bảng lịch sử Project sử dụng ROV này.
- **Props/API chính:**
  - Query: `['rovs', id]` → `GET /rovs/{id}`.
  - Query: `['projects', {rovId: id}]` → `GET /projects?rovId={id}&limit=100`, `enabled: !!id`.
- **Logic chi tiết:**
  - 4 KPI card tính từ mảng `projects` phía client (không qua API stats riêng): Total Projects (`projects.length`), Completed (`filter status==='completed'`), Active Now (`filter status==='ongoing'`), Total Hours (`calcTotalHours` — cộng dồn `(endTime - startTime)` mọi project có đủ 2 mốc thời gian, quy đổi giờ, hiện "—" nếu tổng = 0).
  - Info grid: Model, Serial Number, Registered date, và **specs động**: `Object.entries(rov.specs)` — render mọi key/value tùy ý trong object `specs` (schema mở, không cố định field), cho phép ROV model khác nhau lưu thông số khác nhau.
  - Bảng "Project History": liệt kê toàn bộ project từng gắn ROV này, cùng 2 layout desktop/mobile như các trang khác, dùng `PROJECT_STATUS` badge riêng (trùng cấu trúc với `ProjectsPage`/`ProjectDetailPage`).
- **RBAC trên UI:** `canEdit = ['admin','operator']` — hiện nút "Edit" mở `RovForm`. Không có nút xóa ở trang chi tiết (xóa chỉ có ở `RovsPage`).
- **Kết nối với file khác:** `RovForm`, `@/components/shared/Skeleton`, `MarineTable*`. API: `GET /rovs/:id`, `GET /projects?rovId=`.
- **Điểm đáng chú ý:** Empty state riêng cho bảng lịch sử: "No projects recorded for this ROV." (không dùng component `EmptyState` chung, chỉ là đoạn text căn giữa).

---

## Users

### `frontend/src/features/users/UsersPage.jsx`
- **Chức năng chính:** Trang quản lý người dùng (admin-only theo RBAC), route `/users` — search, filter theo role, sửa thông tin/role từng user, toggle active/disable, và **bulk operations** (activate/disable/set role hàng loạt).
- **Props/API chính:**
  - State: `search`, `roleFilter`, `page` (`LIMIT=20`... thực ra code khai `LIMIT=10`), `editingUser`, `toggleConfirm`, `bulkConfirm`, `selectMode`, `selected` (Set các id).
  - Query chính: `['users', {page, search, role}]` → `GET /users` → payload `{users, total, page, totalPages}` (đúng theo CLAUDE.md, khác cấu trúc `{data,...}` của các entity khác).
  - `toggleMutation`: `PATCH /users/{id}/status` — đảo trạng thái active/disable (server tự toggle, không cần gửi body).
  - `editMutation`: `PATCH /users/{id}` (body `{fullName, role}` — nhưng role bị ẩn nếu tự sửa chính mình, xem bên dưới).
  - `bulkStatusMutation`: `PATCH /users/bulk/status` (body `{ids, isActive}`).
  - `bulkRoleMutation`: `PATCH /users/bulk/role` (body `{ids, role}`).
- **Logic chi tiết:**
  - **Search + filter**: debounce search theo tên/email, dropdown filter theo role (admin/operator/viewer).
  - **Select mode (bulk)**: bấm "Select" → hiện thanh toolbar mới thay banner search/filter, gồm checkbox chọn từng dòng + "Select all" (checkbox header bảng desktop), và khi có ít nhất 1 user chọn: nút "Activate" (gọi thẳng `bulkStatusMutation` không cần confirm), nút "Disable" (mở `ConfirmModal` cảnh báo trước — vì đây là hành động chặn truy cập), dropdown "Set Role" (`RoleDropdown` — chọn role rồi cũng mở `ConfirmModal` xác nhận trước khi áp dụng hàng loạt).
  - **`UserEditForm`** (modal sửa 1 user): sửa `fullName` luôn được; sửa `role` **chỉ hiện nếu không phải chính mình** (`isSelf`) — nếu là chính mình thì thay bằng banner vàng "You cannot change your own role." → đây là **self-protection** chống admin tự hạ quyền chính mình.
  - **`UserToggle`**: switch bật/tắt trạng thái active — click luôn mở `ConfirmModal` trước khi gọi `toggleMutation` (không toggle ngay lập tức), message khác nhau tùy activate ("grant access") hay disable ("disable access... no longer be able to log in").
  - **Export CSV/PDF**: `fetchAllUsers()` gọi `/users?limit=1000` cùng filter → lấy `res.data.users` (không phải `res.data.data`!) → `exportUsersCSV`/`exportUsersPDF`.
- **RBAC trên UI:**
  - Toàn trang chỉ định tuyến cho admin (bảo vệ ở tầng router — cần xác nhận `ProtectedRoute` bọc `/users`; theo router hiện tại, `/users` không có `roles` filter rõ ràng như `/audit`, nhưng theo CLAUDE.md chỉ admin mới "Quản lý user" — có thể enforce phía backend/menu Sidebar ẩn với non-admin).
  - **Self-protection**: admin không tự đổi role chính mình (xem `UserEditForm` ở trên). Không thấy code chặn tự-disable chính mình trong file này (`toggleConfirm` không loại trừ `currentUser._id === u._id`) — đây là điểm nên lưu ý/kiểm tra thêm khi bảo vệ đồ án (có thể backend chặn, hoặc đây là 1 gap tiềm ẩn).
- **Kết nối với file khác:** `@/store/auth.store`, `@/components/shared/{TableSkeleton, Pagination, ExportMenu, Avatar, EmptyState}`, `@/lib/export`, `@/hooks/useDebounce`, `MarineInput/Select/Button/Table*`. API: `GET /users`, `PATCH /users/:id`, `PATCH /users/:id/status`, `PATCH /users/bulk/status`, `PATCH /users/bulk/role`.
- **Điểm đáng chú ý:**
  - 2 modal riêng biệt cho single-action (`ConfirmModal` nội bộ file, khác `ConfirmDialog` shared dùng ở các trang khác) — có thể là inconsistency nhỏ về component tái sử dụng nhưng không ảnh hưởng chức năng.
  - Bảng có checkbox cột đầu chỉ hiện khi `selectMode`, đồng thời cột "Actions" (Edit) bị ẩn khi đang `selectMode` (đổi hẳn UI mode thay vì hiện song song).
  - Badge role dùng `ROLE_STYLE` (admin=tím, operator=primary, viewer=slate) khác với style badge status ở các bảng khác (dùng `MarineTableStatus`) — do role không phải "status" theo nghĩa lifecycle.

---

## Audit

### `frontend/src/features/audit/AuditPage.jsx`
- **Chức năng chính:** Trang xem nhật ký hành động toàn hệ thống, route `/audit`, **chỉ admin truy cập được** (route được bọc `<ProtectedRoute roles={['admin']}>` ngay trong `router/index.jsx` — khác với `UsersPage` không thấy khai báo `roles` tường minh ở router).
- **Props/API chính:**
  - State: `page`, `filterEntity`.
  - Query: `['audit', {page, filterEntity}]` → `GET /audit?page&limit=20&entity=` , `keepPreviousData: true`, `refetchInterval: 15000` (tự làm mới mỗi 15 giây — audit log cần gần-real-time hơn các trang danh sách khác dùng 30-60s), `staleTime: 0`.
- **Logic chi tiết:**
  - Filter theo `entity` — dropdown cố định `['', 'ROV', 'Project', 'Trip', 'User']` (rỗng = "All Entities").
  - Mỗi log hiển thị: avatar + tên/email user thực hiện hành động, badge `action` (map màu qua `ACTION_STYLE` — create=emerald, update=blue, delete=đỏ, change_role=tím, activate/bulk_activate=emerald, disable/bulk_disable=đỏ, bulk_change_role=tím, generate_summary=amber), badge `entity` (chữ hoa nhỏ), phần "Details" động tùy field có trong `log.details` (`name`, `email`, `role` → hiện dạng "→ {role}", `count` → "({count} items)"), và thời gian dạng "N phút/giờ trước" qua hàm `timeAgo()` tự viết (không dùng thư viện date, tính tay bằng `Math.floor` theo giây/60/3600/86400, quá 1 ngày thì hiện ngày cụ thể).
  - 2 layout: mobile card list (`xl:hidden`) và bảng desktop (`xl:block`) — cột "Time" desktop hiện thêm giờ:phút:giây chính xác bên dưới "time ago".
- **RBAC trên UI:** Toàn trang chỉ admin xem được (chặn ở router, không phải chặn trong component) — đúng checklist TASK 4 "Viewer/Operator không vào được /audit". Không có bất kỳ action ghi/sửa nào trên trang này — chỉ đọc thuần túy (read-only theo đúng bản chất audit log).
- **Kết nối với file khác:** `@/components/shared/{Skeleton, Pagination, EmptyState, Avatar}`, `MarineSelect`, `MarineTable*`. API: `GET /audit`.
- **Điểm đáng chú ý:**
  - Không có export CSV/PDF (khác các trang danh sách khác) — audit log thường không cần xuất báo cáo trong phạm vi đồ án này.
  - `isError` có xử lý riêng (banner đỏ "Failed to load audit logs") — 1 trong ít trang tách bạch rõ 3 trạng thái loading/error/empty thay vì gộp chung.
  - Cấu trúc response `GET /audit` theo dạng paginated chuẩn (`{data, total, page, totalPages}`) giống Project/Trip/ROV/Media, khác `Users` (`{users,...}`).
