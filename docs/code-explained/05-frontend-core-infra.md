# Frontend Core Infrastructure — Giải thích chi tiết mã nguồn

Tài liệu này giải thích toàn bộ các file "hạ tầng lõi" (core infra) của frontend React trong dự án **ROV Management System**: bootstrap app, routing, state management (Zustand), axios interceptor, các hook dùng chung, shared components và bộ UI kit riêng "Marine*" (bespoke components).

---

## Tổng quan kiến trúc Frontend

```
index.html
   │
   ▼
main.jsx                                    ← entry point
   ├── đọc localStorage 'rov-theme' TRƯỚC render → set class "dark" trên <html> (anti-flash)
   ├── tạo QueryClient (React Query) — cấu hình mặc định retry:1, staleTime 5 phút
   ├── bọc <ErrorBoundary> (class component bắt lỗi render runtime)
   ├── bọc <QueryClientProvider client={queryClient}>
   ├── render <ThemeSync /> (component rỗng — sync class "dark" mỗi khi isDark đổi)
   ├── render <App />
   └── render <Toaster /> (sonner — toast noti)
        │
        ▼
App.jsx
   └── <RouterProvider router={router} />        ← react-router-dom v6 (data router)
        │
        ▼
router/index.jsx  (createBrowserRouter)
   ├── /login              → LoginPage (public)
   ├── /register           → RegisterPage (public)
   ├── /auth/callback      → AuthCallback (public — Google OAuth redirect landing)
   ├── /                   → <ProtectedRoute><Layout /></ProtectedRoute>   ← cần đăng nhập
   │     │                     (errorElement: RouteError — bắt lỗi loader/render trong route con)
   │     ├── index (/)         → <Navigate to="/dashboard" />
   │     ├── /dashboard        → DashboardPage
   │     ├── /rovs              → RovsPage
   │     ├── /rovs/:id          → RovDetailPage
   │     ├── /projects          → ProjectsPage
   │     ├── /projects/:id      → ProjectDetailPage
   │     ├── /trips             → TripsPage
   │     ├── /trips/:id         → TripDetailPage
   │     ├── /users             → UsersPage
   │     ├── /profile           → ProfilePage
   │     └── /audit             → <ProtectedRoute roles={['admin']}><AuditPage /></ProtectedRoute>
   └── *                   → NotFoundPage (404 catch-all, ngoài mọi layout)
        │
        ▼
Layout.jsx  (component render qua <Outlet/> của route "/")
   ├── Sidebar.jsx     (menu điều hướng, lọc theo role, luôn dark theme cố định)
   ├── Navbar.jsx      (logo, toggle sidebar, dark-mode switch, NotificationBell, avatar dropdown)
   │      └── useSSE() được gọi TRONG Navbar — mở EventSource ngay khi layout mount
   └── <Outlet />       → nội dung page cụ thể (DashboardPage, ProjectsPage, ...)
```

**Phối hợp giữa React Query (server state) và Zustand (client state):**

- **React Query** quản lý toàn bộ dữ liệu lấy từ backend API: danh sách ROV/Project/Trip/Media/Notifications/Stats… Nó lo caching, refetch, invalidate, loading/error state cho "dữ liệu từ server". Query key convention ví dụ `['projects', filters]`, `['notifications']`, `['media', tripId]`.
- **Zustand** quản lý state thuần "client-side", tồn tại xuyên suốt phiên làm việc mà không cần gọi API để biết: ai đang đăng nhập (`auth.store.js`) và theme hiện tại (`theme.store.js`). Cả hai store dùng middleware `persist` để lưu vào `localStorage`, giúp F5 (reload) không mất trạng thái đăng nhập/theme.
- Hai hệ thống này **giao nhau** ở một điểm quan trọng: `lib/axios.js` đọc `accessToken`/`refreshToken` từ `useAuthStore.getState()` (không phải qua hook, vì file này không phải React component) để gắn header, và khi refresh-token thất bại thì gọi `useAuthStore.getState().logout()` để xoá client state — sau đó React Query tự nhiên sẽ nhận lỗi 401 và ngừng cache dữ liệu nhạy cảm (vì component bị điều hướng ra `/login`).
- `useSSE.js` là cầu nối thứ hai: sự kiện server-push (SSE) không đi qua React Query fetch, nhưng khi nhận event, nó gọi `queryClient.invalidateQueries(...)` để buộc React Query refetch — nghĩa là **SSE điều khiển React Query cache** thay vì tự quản lý state riêng.

---

## Tổng quan cơ chế Auto-refresh Token (Axios Interceptor)

File `lib/axios.js` tạo một instance axios duy nhất (`api`) dùng cho toàn bộ app, với 2 interceptor:

### 1. Request interceptor — gắn Bearer token (và tự "mồi" refresh khi thiếu access token)
- Trước mỗi request, đọc `accessToken` hiện tại từ Zustand store (`useAuthStore.getState()`, gọi trực tiếp ngoài React lifecycle vì đây không phải component/hook).
- **Trường hợp đặc biệt:** nếu `accessToken` là `null` (ví dụ vừa reload trang — vì `accessToken` KHÔNG được persist vào localStorage, chỉ `refreshToken` được persist), nhưng có `refreshToken` → nó chủ động gọi `POST /auth/refresh` **ngay trong request interceptor**, trước khi request gốc kịp bay đi. Sau khi lấy access token mới, nó còn gọi thêm `GET /auth/me` để refresh dữ liệu user mới nhất (đặc biệt là `avatar` — presigned S3 URL có thời hạn nên cần làm mới) và lưu lại vào store qua `updateUser()`.
- Nếu quá trình refresh này thất bại (refresh token cũng hết hạn/invalid) → gọi `logout()` xoá state, redirect cứng `window.location.href = '/login'`, và reject Promise để chặn request gốc tiếp tục chạy.
- Cuối cùng, nếu có token (token cũ hoặc token vừa refresh xong) → set `config.headers.Authorization = Bearer <token>`.

### 2. Response interceptor — bắt lỗi 401 và tự động refresh + retry
- Trên success: trả thẳng `response.data` (không phải toàn bộ response axios) — đây là lý do tại sao ở tầng gọi (`useQuery`), kết quả nhận được đã là `{ success, message, data }` chứ không phải object `AxiosResponse` đầy đủ.
- Trên lỗi:
  - Kiểm tra: response status `=== 401`, request **chưa từng retry** (`!original._retry`), và **không phải chính request tới `/auth/*`** (tránh vòng lặp vô hạn khi refresh-token endpoint tự nó trả 401).
  - Nếu thoả điều kiện: đánh dấu `original._retry = true` (cờ chống lặp vô hạn — mỗi request gốc chỉ được retry đúng 1 lần), gọi `POST /auth/refresh` bằng `refreshToken` hiện tại trong store, lấy `accessToken` mới, lưu vào store bằng `setAccessToken()`, gắn lại header `Authorization` cho **request gốc** (`original`), rồi gọi lại chính request đó bằng `api(original)` (tái sử dụng instance `api`, không phải `axios` trần — nên response vẫn đi qua toàn bộ interceptor chain một lần nữa, nhưng lần này `_retry` đã `true` nên không loop lại).
  - Nếu refresh thất bại → `logout()` + redirect `/login`.
  - Lỗi cuối cùng luôn được `reject` với `error.response?.data` (tức phần `{success:false, message}` từ backend) thay vì object `AxiosError` gốc — giúp code gọi ở tầng trên (`catch(err){ toast.error(err.message) }`) dùng trực tiếp `err.message` mà không cần đào sâu `err.response.data.message`.

### Race condition khi nhiều request 401 cùng lúc
Điểm đáng chú ý: **file này KHÔNG có cơ chế "hàng đợi" (queue) tập trung để dedupe nhiều lần refresh xảy ra đồng thời.** Nếu 3 request cùng nhận 401 gần như đồng thời, cả 3 sẽ **độc lập** gọi `POST /auth/refresh` riêng — không có biến khoá kiểu `isRefreshing` / mảng `pendingQueue` để gom lại thành 1 lần gọi refresh duy nhất rồi phát lại token cho tất cả các request đang chờ. Đây là điểm có thể bị hội đồng phản biện hỏi xoáy: về lý thuyết có thể gây ra nhiều request refresh-token dư thừa (và nếu backend refresh-token là single-use/rotate, request thứ 2 có thể thất bại vì token đã bị dùng ở request thứ 1). Cờ `original._retry` chỉ ngăn **cùng một request gốc bị retry nhiều lần**, không ngăn **nhiều request khác nhau cùng trigger refresh song song**.

### Khác:
- Base URL: `import.meta.env.VITE_API_URL || '/api/v1'`.
- Có set cứng header `ngrok-skip-browser-warning: true` (di sản của việc test qua ngrok tunnel khi demo) — không ảnh hưởng chức năng chính.

---

## Tổng quan Dark Mode + Design Token System

- **CSS variables** định nghĩa trong `frontend/src/index.css`, dạng "R G B" (space-separated, không có `rgb()`) để Tailwind có thể compose với opacity: ví dụ `--background: 248 250 252;` rồi dùng bằng `rgb(var(--background))`.
- Có 2 block: `:root` (light — nền slate-50, chữ slate-900, primary cyan-700...) và `.dark` (dark — nền slate-900, chữ slate-50, cùng primary cyan-700 nhưng destructive đổi từ red-600 → red-500 cho dễ nhìn trên nền tối).
- `tailwind.config.js` map các token này thành class tiện dụng: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`, `bg-primary`, `text-primary-foreground`, `bg-destructive`, v.v. (đúng như bảng trong CLAUDE.md).
- **Cơ chế bật/tắt:** class `.dark` được toggle trên thẻ `<html>` (`document.documentElement`). Bất kỳ phần tử con nào dùng class Tailwind theo token (`bg-card` chẳng hạn) sẽ tự đổi màu vì CSS variable `--card` thay đổi giá trị khi `.dark` có mặt hay không.
- **Zustand `theme.store.js`:** state tối giản `{ isDark: false, toggle() }`, persist vào `localStorage` key `rov-theme` (toàn bộ state, không có `partialize`).
- **Anti-flash script trong `main.jsx`:** vì React cần thời gian để mount rồi effect mới chạy, nếu chờ tới lúc `<ThemeSync/>` render xong mới set class `.dark` thì người dùng sẽ thấy nháy trắng (FOUC) trước khi chuyển tối. Giải pháp: **đọc thẳng `localStorage.getItem('rov-theme')` bằng code đồng bộ (synchronous), TRƯỚC dòng `createRoot(...).render(...)`**, parse JSON, nếu `state.isDark === true` thì add class `dark` vào `document.documentElement` ngay lập tức — trước cả khi React bắt đầu render bất kỳ thứ gì. Đây chính là "anti-flash".
- **`ThemeSync` component:** một component rỗng (không render UI, `return null`) chỉ tồn tại để chạy side-effect: `useEffect` lắng nghe `isDark` từ store và gọi `classList.toggle('dark', isDark)` mỗi khi giá trị đổi (ví dụ khi user bấm nút toggle trong Navbar). Đặt ở `main.jsx` (ngoài router) để **áp dụng cho MỌI route, kể cả trang `/login` chưa vào Layout** — comment trong code ghi rõ lý do này.
- Quy tắc thiết kế khi thêm UI mới (theo CLAUDE.md, xác nhận đúng qua code đã đọc): container dùng `bg-card border border-border`, input dùng `border-input bg-background`, nút chính `bg-primary text-primary-foreground`, nút nguy hiểm `bg-destructive text-destructive-foreground`. Riêng biểu đồ Recharts (SVG fill) **không dùng CSS var** vì Recharts cần hex tĩnh — đó là lý do có file riêng `lib/chartColors.js`.
- **`window.__hideLoader?.()`** trong `main.jsx` — gọi 1 hàm global (định nghĩa trong `index.html`, không thuộc phạm vi đọc của task này) để ẩn loading spinner tĩnh HTML trước khi React mount, tránh trắng màn hình khi bundle JS đang tải.

---

## Tổng quan Route Tree + RBAC ở Frontend (ProtectedRoute theo role)

Route tree đầy đủ (từ `router/index.jsx`, dùng `createBrowserRouter`):

| Path | Element | Bảo vệ | Ghi chú |
|---|---|---|---|
| `/login` | `LoginPage` | Không | Public |
| `/register` | `RegisterPage` | Không | Public |
| `/auth/callback` | `AuthCallback` | Không | Landing page sau khi Google OAuth redirect về, đọc token trên URL |
| `/` | `Layout` (qua `ProtectedRoute`) | Cần đăng nhập | `errorElement: <RouteError />` bắt lỗi runtime trong toàn bộ cây con |
| `/` (index) | `<Navigate to="/dashboard" />` | kế thừa cha | Redirect gốc |
| `/dashboard` | `DashboardPage` | Cần đăng nhập | Mọi role |
| `/rovs` | `RovsPage` | Cần đăng nhập | Mọi role (UI tự ẩn nút sửa/xoá theo role bên trong page) |
| `/rovs/:id` | `RovDetailPage` | Cần đăng nhập | Mọi role |
| `/projects` | `ProjectsPage` | Cần đăng nhập | Mọi role |
| `/projects/:id` | `ProjectDetailPage` | Cần đăng nhập | Mọi role |
| `/trips` | `TripsPage` | Cần đăng nhập | Mọi role |
| `/trips/:id` | `TripDetailPage` | Cần đăng nhập | Mọi role |
| `/users` | `UsersPage` | Cần đăng nhập | Không giới hạn role ở **router** (lưu ý bên dưới) |
| `/profile` | `ProfilePage` | Cần đăng nhập | Mọi role |
| `/audit` | `AuditPage` | Cần đăng nhập **+ role admin** | `<ProtectedRoute roles={['admin']}>` bọc lồng bên trong |
| `*` (mọi path khác) | `NotFoundPage` | Không | Nằm ngoài `Layout`, không có Navbar/Sidebar |

**Cơ chế `ProtectedRoute.jsx`:**
```js
if (!refreshToken) return <Navigate to="/login" replace />
if (roles && user && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />
return children
```
- Điều kiện đăng nhập dựa vào sự tồn tại của **`refreshToken`** trong Zustand store (không phải `accessToken`, vì `accessToken` không persist và có thể tạm thời `null` ngay sau khi reload trang — lúc đó axios request interceptor sẽ tự refresh lại).
- Nếu route có `roles` prop (mảng role được phép) và `user` đã có dữ liệu nhưng role không nằm trong danh sách → redirect về `/dashboard` (không phải 403 page riêng).
- Route `/users` KHÔNG được bọc `roles={['admin']}` ở tầng router — nghĩa là về mặt kỹ thuật, một `operator` hay `viewer` gõ thẳng URL `/users` vẫn **vào được layout của trang**, việc chặn hoàn toàn dựa vào Sidebar ẩn menu (`navItems` filter theo `roles`) và có thể logic chặn/ẩn dữ liệu nằm bên trong chính `UsersPage` (không thuộc phạm vi đọc của tài liệu này) — đây là điểm cần lưu ý khi bị hỏi về bảo mật: **RBAC ở route-level chỉ chắc chắn được áp dụng cho `/audit`**, các route khác dựa vào UI ẩn + (giả định) kiểm tra role ở API backend.
- **Sidebar.jsx** cũng có bảng `navItems` riêng với field `roles` để lọc menu hiển thị — đây là lớp phòng thủ "ẩn UI" bổ trợ cho `ProtectedRoute`, không thay thế được kiểm tra quyền ở backend.

---

## Chi tiết từng file

### `frontend/src/App.jsx`
- **Chức năng chính:** Component gốc của toàn bộ ứng dụng React, chỉ có một nhiệm vụ duy nhất: khởi tạo `RouterProvider` với router đã cấu hình sẵn.
- **Props/API chính:** Không có props. Không có state. Chỉ render `<RouterProvider router={router} />`.
- **Logic chi tiết:** Rất tối giản — toàn bộ logic điều hướng đã được đóng gói trong object `router` import từ `./router` (tức `router/index.jsx`). Việc tách `App.jsx` (chỉ 6 dòng) khỏi `router/index.jsx` giúp code sạch, dễ test.
- **Kết nối với file khác:** Import `router` từ `frontend/src/router/index.jsx`. Được `main.jsx` render bên trong `<ErrorBoundary>` và `<QueryClientProvider>`.
- **Điểm đáng chú ý:** Dùng `createBrowserRouter` (data router API của react-router-dom v6.4+) thay vì `<BrowserRouter>` truyền thống — cho phép dùng `errorElement`, loader/action nếu cần mở rộng sau này.

---

### `frontend/src/main.jsx`
- **Chức năng chính:** Entry point thực sự của ứng dụng (được `index.html` load qua `<script type="module" src="/src/main.jsx">`), chịu trách nhiệm bootstrap toàn bộ Provider tree: React Query, theme anti-flash, error boundary, toast system.
- **Props/API chính:** Không phải component có props — là script thực thi tuần tự.
- **Logic chi tiết:**
  1. Tạo `queryClient = new QueryClient({...})` với default options: `retry: 1` (mỗi query lỗi chỉ tự retry 1 lần), `refetchOnWindowFocus: false` (không tự fetch lại khi user chuyển tab về), `staleTime: 1000 * 60 * 5` (5 phút — dữ liệu được coi là "còn mới" trong 5 phút, không refetch lại nếu component re-mount trong khoảng đó). Lưu ý: CLAUDE.md có nói "Dashboard dùng staleTime: 0, trang khác staleTime: 30000" — đây là override tại từng `useQuery` cụ thể (không thuộc phạm vi file này); giá trị `1000*60*5` ở đây chỉ là **default toàn cục** khi query không tự khai báo `staleTime` riêng.
  2. Component nội bộ `ThemeSync()`: `useEffect` theo dõi `isDark` từ `useThemeStore`, mỗi khi đổi thì `document.documentElement.classList.toggle('dark', isDark)`. Render `null` — không xuất hiện trong DOM, chỉ chạy effect.
  3. **Anti-flash logic** (chạy ở top-level, đồng bộ, TRƯỚC `createRoot`): đọc trực tiếp `localStorage.getItem('rov-theme')`, `JSON.parse` (fallback `'{}'` nếu chưa có), nếu `savedTheme?.state?.isDark === true` (đây là format Zustand `persist` lưu — luôn bọc trong object `{state: {...}, version}`) → add class `dark` ngay lập tức vào `<html>`.
  4. `window.__hideLoader?.()` — optional chaining gọi hàm ẩn splash-loader tĩnh (định nghĩa trong `index.html`) nếu nó tồn tại.
  5. Render cây: `<StrictMode>` → `<ErrorBoundary>` → `<QueryClientProvider>` → (`<ThemeSync/>`, `<App/>`, `<Toaster/>`).
  6. `<Toaster position="top-right" richColors closeButton />` — cấu hình global cho thư viện `sonner` (toast notification), dùng xuyên suốt app qua `import { toast } from 'sonner'`.
- **Kết nối với file khác:** Import `App.jsx`, `store/theme.store.js`, `components/shared/ErrorBoundary.jsx`, `index.css`.
- **Điểm đáng chú ý:** Đây là nơi DUY NHẤT tạo `QueryClient` — mọi nơi khác trong app chỉ dùng `useQuery`/`useQueryClient` để lấy lại instance này qua Context. `StrictMode` bọc ngoài cùng nghĩa là trong dev mode, các effect (bao gồm `useSSE`, `ThemeSync`) sẽ chạy 2 lần khi mount (hành vi chuẩn của React 18 StrictMode để phát hiện side-effect không idempotent).

---

### `frontend/src/router/index.jsx`
- **Chức năng chính:** Định nghĩa toàn bộ cây route của ứng dụng bằng `createBrowserRouter`.
- **Props/API chính:** Export named `router` (object cấu hình, không phải component).
- **Logic chi tiết:** Xem bảng đầy đủ ở section "Tổng quan Route Tree" phía trên. Điểm kỹ thuật thêm:
  - `errorElement: <RouteError />` chỉ đặt tại route `/` — nghĩa là lỗi throw ra trong bất kỳ route con nào (dashboard, projects, ...) đều bị `RouteError` bắt và hiển thị, KHÔNG làm sập toàn bộ app (khác với lỗi ở tầng React render thông thường, vốn được `ErrorBoundary` ở `main.jsx` bắt).
  - Route `*` (catch-all 404) nằm **ngoài** route `/` — nên `NotFoundPage` không có Navbar/Sidebar bao quanh (đứng độc lập, full page).
  - Dòng comment cuối file `// force vite hmr` — dấu vết kỹ thuật để ép Vite HMR reload file này khi cần (vô hại, không phải logic).
- **Kết nối với file khác:** Import tất cả page components từ `@/features/*` (alias `@` trỏ tới `src/`), `ProtectedRoute` và `Layout` từ `@/components/shared/`.
- **Điểm đáng chú ý:** Chỉ có **1 route** (`/audit`) áp dụng RBAC role-based ngay tại router; các route "quản trị" khác như `/users` không có ràng buộc `roles` ở đây — RBAC dựa vào Sidebar ẩn + (có thể) kiểm tra trong chính trang hoặc chặn ở API.

---

## Store (Zustand)

### `frontend/src/store/auth.store.js`
- **Chức năng chính:** Zustand store toàn cục quản lý trạng thái xác thực người dùng: thông tin `user`, `accessToken`, `refreshToken`.
- **Props/API chính (state + actions):**
  - `user: object | null` — thông tin user hiện tại (fullName, email, role, avatar, authProvider, ...).
  - `accessToken: string | null` — JWT access token (sống ngắn ~15 phút theo CLAUDE.md).
  - `refreshToken: string | null` — JWT refresh token (sống dài ~7 ngày).
  - `setAuth(user, accessToken, refreshToken)` — set toàn bộ 3 field cùng lúc (dùng lúc login/register/OAuth callback thành công).
  - `setAccessToken(accessToken)` — chỉ cập nhật access token (dùng sau khi refresh-token thành công, không cần đổi user/refreshToken).
  - `updateUser(updates)` — merge (`{...state.user, ...updates}`) — dùng khi PATCH `/auth/me` đổi tên, hoặc khi axios interceptor tự động refresh lại avatar từ `/auth/me`.
  - `logout()` — reset cả 3 field về `null`.
- **Logic chi tiết:**
  - Bọc bởi middleware `persist` với tên storage `rov-auth` (key trong `localStorage`).
  - **`partialize`** chỉ chọn persist `user` và `refreshToken` — **cố tình KHÔNG lưu `accessToken` vào localStorage**. Lý do bảo mật + kỹ thuật: access token sống ngắn nên việc lưu localStorage không có nhiều lợi ích và tăng bề mặt tấn công XSS; sau khi F5 (reload trang), `accessToken` sẽ là `null` trong state khôi phục từ localStorage, và chính vì vậy request interceptor trong `axios.js` có logic đặc biệt để tự động refresh ngay khi phát hiện thiếu access token nhưng còn refresh token.
- **Kết nối với file khác:** Dùng trong `lib/axios.js` (qua `getState()` trực tiếp, không qua hook — vì file không phải React component), `Navbar.jsx`, `Sidebar.jsx`, `ProtectedRoute.jsx`, `useSSE.js` (đọc `accessToken` để mở kết nối SSE), và các trang auth (`LoginPage`, `RegisterPage`, `AuthCallback`, `ProfilePage`...).
- **Điểm đáng chú ý:** Không có action `refreshAccessToken` nội bộ trong store — toàn bộ logic gọi API refresh nằm ở `lib/axios.js`, store chỉ đóng vai trò "kho chứa" state thuần tuý (tuân thủ nguyên tắc tách state khỏi side-effect).

### `frontend/src/store/theme.store.js`
- **Chức năng chính:** Zustand store quản lý theme sáng/tối toàn ứng dụng.
- **Props/API chính:**
  - `isDark: boolean` (mặc định `false` — light mode).
  - `toggle()` — đảo ngược `isDark`.
- **Logic chi tiết:** Persist toàn bộ state (không có `partialize` riêng) vào `localStorage` key `rov-theme`. Đây chính là key mà `main.jsx` đọc thủ công (đồng bộ) trong đoạn anti-flash trước khi React mount.
- **Kết nối với file khác:** `main.jsx` (đọc trực tiếp localStorage + component `ThemeSync`), `Navbar.jsx` (nút toggle sáng/tối với animation).
- **Điểm đáng chú ý:** Store cực kỳ tối giản (chỉ 2 field) — mọi logic áp dụng theme (`classList.toggle`) nằm ngoài store, trong `ThemeSync`/`main.jsx`, giữ đúng nguyên tắc single-responsibility.

---

## Lib

### `frontend/src/lib/axios.js`
Đã giải thích chi tiết ở section "Tổng quan cơ chế Auto-refresh Token" phía trên. Tóm tắt lại các điểm chính:
- **Chức năng chính:** Tạo và export instance axios duy nhất (`api`) dùng xuyên suốt app, tự động gắn Bearer token và tự động refresh khi access token hết hạn.
- **Kết nối với file khác:** Được import ở hầu hết mọi feature module gọi API (`api.get(...)`, `api.post(...)`...), và dùng `useAuthStore` để đọc/ghi token.
- **Điểm đáng chú ý:** Không dùng thư viện dedupe refresh-token nào (như `axios-auth-refresh`) — tự viết tay logic, có lỗ hổng nhỏ về race condition đã nêu ở trên (nhiều request 401 đồng thời có thể trigger nhiều lần gọi `/auth/refresh` song song).

### `frontend/src/lib/chartColors.js`
- **Chức năng chính:** Bảng màu hex tĩnh dùng riêng cho Recharts (biểu đồ), vì Recharts yêu cầu giá trị màu cụ thể (hex/rgb), không thể dùng class Tailwind hay CSS variable trực tiếp trong props như `fill`/`stroke`.
- **Props/API chính:** Export 4 object hằng số:
  - `PROJECT_COLORS` — màu theo status Project: `planned` (blue-400 `#60a5fa`), `ongoing` (cyan-500 `#06b6d4`), `completed` (gray-500 `#6b7280`), `cancelled` (rose-500 `#f43f5e`).
  - `TRIP_COLORS` — màu theo status Trip: `pending` (gray-500), `running` (cyan-500), `done` (emerald-500 `#10b981`), `failed` (rose-500).
  - `ROV_PALETTE` — mảng 8 màu tuần hoàn dùng khi vẽ biểu đồ nhiều ROV (cyan, emerald, blue, violet, rose, emerald nhạt, indigo, orange).
  - `LINE_COLORS` — màu 3 đường trong Activity Timeline: `projects` (cyan), `trips` (emerald), `media` (amber).
- **Logic chi tiết:** Không có hàm xử lý, chỉ là data tĩnh (constant object). Comment đầu file giải thích rõ triết lý chọn màu: "technical instrument tones, not candy-bright primaries" — tông màu thiết bị kỹ thuật, không dùng màu sặc sỡ.
- **Kết nối với file khác:** Dùng trong `DashboardPage` (donut chart Project Status, bar chart Trip Status/ROV Utilization, line chart Activity Timeline) và các nơi khác có Recharts.
- **Điểm đáng chú ý:** Việc tách file riêng biệt khỏi design token CSS var là chủ đích kỹ thuật — do giới hạn của SVG/Recharts render engine không đọc được `rgb(var(--xxx))` một cách đáng tin cậy trong mọi trường hợp (đặc biệt là animation/transition).

### `frontend/src/lib/dnd-sensors.js`
- **Chức năng chính:** Định nghĩa 2 custom sensor class cho thư viện `@dnd-kit/core` (drag-and-drop), dùng cho tính năng "drag-to-reorder" (kéo thả sắp xếp lại thứ tự Media trong gallery, hoặc Trip trong danh sách).
- **Props/API chính:** Export `MouseSensor` và `TouchSensor` — cả 2 đều `extends` sensor gốc của `@dnd-kit/core`, override `static activators`.
- **Logic chi tiết:**
  - Hàm `handler({ nativeEvent: event })` dùng chung cho cả 2 activator: duyệt ngược từ `event.target` lên qua `parentElement`, nếu gặp phần tử nào có `dataset.noDnd` (tức attribute `data-no-dnd`) thì trả về `false` — nghĩa là **KHÔNG kích hoạt drag** khi user click vào phần tử đã được đánh dấu "không cho kéo" (ví dụ nút xoá, nút mở lightbox nằm bên trong 1 card có thể kéo thả).
  - Đây là kỹ thuật phổ biến để tránh xung đột giữa "click để mở" và "kéo để sắp xếp" trên cùng 1 khối UI.
- **Kết nối với file khác:** Dùng trong `MediaGallery`/`TripList` (nơi có tính năng reorder bằng kéo thả) — các module này thuộc `features/`, không nằm trong phạm vi đọc trực tiếp của tài liệu này nhưng CLAUDE.md xác nhận "drag-to-reorder trong TripList".
- **Điểm đáng chú ý:** Không phải component, không có side-effect nào khác ngoài việc định nghĩa activator logic — thuần túy là cấu hình cho `@dnd-kit`.

### `frontend/src/lib/export.js`
- **Chức năng chính:** Cung cấp bộ hàm xuất dữ liệu ra file **CSV** và **PDF** cho 4 loại resource: Projects, Trips, ROVs, Users.
- **Props/API chính (hàm export):**
  - `exportProjectsCSV(projects)`, `exportProjectsPDF(projects)`
  - `exportTripsCSV(trips)`, `exportTripsPDF(trips)`
  - `exportRovsCSV(rovs)`, `exportRovsPDF(rovs)`
  - `exportUsersCSV(users)`, `exportUsersPDF(users)`
  - Mỗi hàm nhận **mảng object thô** (kết quả `res.data.data` hoặc `res.data.users` từ API — không phải kết quả React Query đã unwrap `.data.data`, gọi trực tiếp).
- **Logic chi tiết:**
  - **CSV path:** hàm nội bộ `toCSV(headers, rows)` — escape giá trị chứa dấu phẩy/dấu ngoặc kép/newline bằng cách bọc trong `"..."` và nhân đôi dấu `"`. `downloadCSV(filename, csv)` tạo `Blob` với BOM UTF-8 (`'﻿' + csv`, đảm bảo Excel đọc đúng tiếng Việt có dấu), tạo `<a>` ẩn, `.click()` để trigger tải, rồi `URL.revokeObjectURL` giải phóng bộ nhớ.
  - **PDF path:** phức tạp hơn — dùng `html2canvas` + `jsPDF`:
    1. Hàm `escHtml` escape HTML entity cơ bản chống injection khi build chuỗi HTML thô.
    2. `downloadPDF(filename, title, headers, rows)` tạo 1 `<div>` ẩn (position fixed, opacity 0, width cố định `1060px` để mô phỏng khổ A4 landscape ở 96dpi) chứa bảng HTML dựng thủ công bằng inline style (header nền xanh `#2563eb`, hàng chẵn/lẻ có màu nền xen kẽ — zebra stripe).
    3. Chờ 2 tick `requestAnimationFrame` lồng nhau để đảm bảo browser đã tính xong layout (`offsetWidth`/`offsetHeight`) trước khi chụp.
    4. Dùng `html2canvas` chụp `<div>` này thành `<canvas>` ở `scale: 2` (nét hơn khi in), với callback `onclone` set lại `opacity: 1` trên bản sao nội bộ của html2canvas (vì bản gốc trên trang đang ẩn `opacity: 0`, nếu không sửa trong bản clone thì ảnh chụp ra sẽ trong suốt/trắng).
    5. Tạo `jsPDF` khổ `a4` `landscape`, cắt canvas thành nhiều "lát" theo chiều cao trang (`pageHeightPx`) để hỗ trợ **bảng dài nhiều trang** — vòng `while (srcY < canvas.height)` cắt từng đoạn, tạo canvas tạm cho từng đoạn, `addImage` vào PDF, `addPage()` nếu còn dữ liệu.
    6. Cuối cùng `doc.save(filename)` và dọn dẹp (`document.body.removeChild(el)`) trong khối `finally` (đảm bảo dọn dẹp dù có lỗi giữa chừng).
  - `dateTag()` — helper trả về `YYYY-MM-DD` hiện tại, dùng làm hậu tố tên file (`projects_2026-07-06.csv`).
- **Kết nối với file khác:** Dùng trong `ExportMenu.jsx` (props `onExportCSV`/`onExportPDF` do trang cha truyền vào, thường là gọi 1 trong các hàm ở file này) và các trang danh sách (`ProjectsPage`, `TripsPage`, `RovsPage`, `UsersPage`).
- **Điểm đáng chú ý:** Vì PDF được tạo bằng cách "chụp ảnh HTML" thay vì vẽ text trực tiếp trong `jsPDF` (autotable), nên chữ tiếng Việt có dấu hiển thị đúng font hệ thống (không bị lỗi font như cách dùng `jsPDF.text()` thuần) — đánh đổi là file PDF nặng hơn (chứa ảnh raster) và không select-text được.

---

## Hooks

### `frontend/src/hooks/useDebounce.js`
- **Chức năng chính:** Custom hook debounce giá trị bất kỳ — trì hoãn cập nhật giá trị trả về cho tới khi input ngừng thay đổi trong khoảng `delay` ms.
- **Props/API chính:** `useDebounce(value, delay = 400)` → trả về `debounced` (giá trị đã debounce).
- **Logic chi tiết:** Dùng `useState` lưu giá trị debounced + `useEffect` phụ thuộc `[value, delay]`: mỗi lần `value` đổi, set 1 `setTimeout` mới sau `delay` ms để cập nhật `debounced`; cleanup function `clearTimeout(t)` huỷ timer cũ nếu `value` đổi tiếp trước khi timer cũ kịp chạy (đúng pattern debounce chuẩn).
- **Kết nối với file khác:** Dùng phổ biến trong các trang có ô tìm kiếm (search input) để tránh gọi API mỗi lần gõ phím — ví dụ `ProjectsPage`, `UsersPage`, `RovsPage` (không thuộc phạm vi đọc trực tiếp của tài liệu, nhưng đây là use-case chuẩn của hook debounce trong React Query search).
- **Điểm đáng chú ý:** Generic, không phụ thuộc kiểu dữ liệu cụ thể — có thể debounce string, object filter, number...

### `frontend/src/hooks/useSSE.js`
- **Chức năng chính:** Custom hook thiết lập kết nối **Server-Sent Events (SSE)** tới backend để nhận thông báo real-time (notification) và tự động đồng bộ cache React Query + hiện toast.
- **Props/API chính:** `useSSE()` — không nhận tham số, không trả về giá trị (side-effect only hook).
- **Logic chi tiết:**
  - Lấy `queryClient` qua `useQueryClient()` và `accessToken` từ `useAuthStore`.
  - `useEffect` phụ thuộc `[accessToken]`: nếu chưa có `accessToken` thì không làm gì (`return` sớm — tránh mở SSE khi chưa đăng nhập).
  - **Cách kết nối:** `EventSource` (Web API chuẩn) **không hỗ trợ set custom header** (không thể gắn `Authorization: Bearer ...`), nên token được truyền qua **query string**: `GET /notifications/stream?token=<accessToken>`. Đây là lý do comment trong code giải thích rõ: "EventSource không hỗ trợ Authorization header — truyền token qua query param".
  - `es.onmessage`: parse `e.data` (JSON string) → object `msg`. Nếu `msg.type === 'notification'`:
    - Luôn `invalidateQueries({queryKey: ['notifications']})` và `['audit']` (vì mọi notification cũng có thể sinh audit log liên quan).
    - Map theo `msg.data?.type` (loại notification cụ thể bên trong):
      - `ai_summary_done` → invalidate thêm `['projects']` (để AI Summary hiện ngay trên `ProjectDetailPage` không cần chờ poll 3s).
      - `media_analysis_done` → invalidate `['media']` (prefix match — không cần biết chính xác `tripId` nào, React Query tự invalidate mọi query có key bắt đầu bằng `['media']`).
      - `snapshot_analysis_done` → invalidate `['snapshots']`.
    - Sau đó tra bảng `TOAST_TYPES[msg.data?.type]?.(msg.data)` để hiện toast tương ứng (optional chaining — nếu type không có trong bảng thì không hiện gì, không lỗi).
  - Bảng `TOAST_TYPES` định nghĩa 5 loại: `trip_failed`, `account_disabled` → `toast.error` (màu đỏ); `ai_summary_done`, `media_analysis_done`, `snapshot_analysis_done` → `toast.success` (màu xanh).
  - `es.onerror` — không xử lý gì thêm, dựa vào hành vi **mặc định của `EventSource` là tự động reconnect** khi mất kết nối.
  - Cleanup: `return () => es.close()` — đóng kết nối khi component unmount hoặc `accessToken` đổi (ví dụ sau khi refresh token, effect chạy lại mở kết nối SSE mới với token mới).
- **Kết nối với file khác:** Được gọi bên trong `Navbar.jsx` (`useSSE()` — 1 dòng, không dùng kết quả trả về) — nghĩa là kết nối SSE chỉ tồn tại khi `Layout` (và do đó `Navbar`) đang mount, tức là chỉ khi user đã đăng nhập và đang ở trong khu vực bảo vệ của app.
- **Điểm đáng chú ý:** Không có giới hạn thử lại (retry limit) tự viết — hoàn toàn dựa vào cơ chế built-in của trình duyệt cho `EventSource`. Token trên query string là một đánh đổi bảo mật nhỏ (token có thể lộ trong access log server) nhưng là giải pháp thực dụng phổ biến cho SSE.

---

## Shared components

### `frontend/src/components/shared/Avatar.jsx`
- **Chức năng chính:** Hiển thị avatar người dùng — ảnh thật nếu có `avatarUrl` hợp lệ, fallback về chữ cái viết tắt (initials) với màu nền random nhưng ổn định (deterministic hash) theo tên.
- **Props/API chính:** `{ name, avatarUrl, size = 'md', className = '' }`. Size hỗ trợ: `sm` (24px), `md` (32px), `lg` (40px), `xl` (48px).
- **Logic chi tiết:**
  - State nội bộ `broken` (boolean) — đánh dấu ảnh load lỗi. `useEffect` reset `broken = false` mỗi khi `avatarUrl` đổi (để thử lại ảnh mới, tránh giữ trạng thái lỗi cũ của URL trước).
  - Nếu có `avatarUrl` và `!broken` → render `<img>` với `onError={() => setBroken(true)}` — khi ảnh lỗi (404, S3 hết hạn presigned URL, network fail...) tự động chuyển sang hiển thị initials.
  - `getInitials(fullName)`: tách theo khoảng trắng, lọc phần tử rỗng, lấy ký tự đầu mỗi từ, join, uppercase, cắt tối đa 2 ký tự. Trả `'?'` nếu không có tên.
  - Màu nền: mảng `bgColors` gồm 6 cặp màu (light/dark variant) — chọn theo **hash đơn giản** của tên (`hashCode` — thuật toán bit-shift cộng dồn charCode, kỹ thuật hash string phổ biến trong JS) rồi `% bgColors.length` để luôn ra cùng 1 màu cho cùng 1 tên (deterministic, không đổi màu mỗi lần render).
  - Nếu initials là `'?'` (không có tên) → hiện icon `<User>` từ lucide-react thay vì chữ.
- **Kết nối với file khác:** Dùng trong `Navbar.jsx` (avatar dropdown của user hiện tại).
- **Điểm đáng chú ý:** Áp dụng dark mode variant đầy đủ cho từng màu nền (`dark:bg-blue-900/30 dark:text-blue-400`...). Xử lý ảnh lỗi (`onError`) là điểm quan trọng cho edge case avatar S3 presigned URL hết hạn.

### `frontend/src/components/shared/ConfirmDialog.jsx`
- **Chức năng chính:** Modal xác nhận hành động nguy hiểm (xoá, huỷ...) dùng chung toàn app, render qua React Portal để tránh vấn đề z-index/overflow của component cha.
- **Props/API chính:** `{ title, message, onConfirm, onCancel, loading, confirmLabel, variant = 'danger', confirmDisabled = false }`.
  - `variant`: `'danger'` (mặc định, nút đỏ `bg-destructive`) hoặc `'warning'` (nút vàng `bg-amber-500`).
  - `loading`: disable cả 2 nút, đổi label nút confirm thành "Processing...".
  - `confirmDisabled`: disable riêng nút confirm (không disable Cancel) — dùng khi cần điều kiện bổ sung trước khi cho phép xác nhận.
- **Logic chi tiết:** Tính `isWarning = variant === 'warning'` rồi chọn class tương ứng cho nút và icon nền. `defaultLabel` tự động là `'Continue'` (warning) hoặc `'Delete'` (danger) nếu không truyền `confirmLabel`. Toàn bộ modal được `createPortal(modal, document.body)` — render trực tiếp vào `<body>`, thoát khỏi DOM tree của component cha (giải quyết vấn đề modal bị cắt bởi `overflow: hidden` của container cha).
- **Kết nối với file khác:** Dùng ở hầu hết các trang có hành động xoá (Projects, Trips, ROVs, Media, Users bulk actions...).
- **Điểm đáng chú ý:** `z-[10000]` — z-index rất cao để đảm bảo luôn nổi trên mọi UI khác kể cả dropdown/lightbox khác trong app. Dùng token `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-destructive` — tương thích dark mode hoàn toàn.

### `frontend/src/components/shared/EmptyState.jsx`
- **Chức năng chính:** Component hiển thị trạng thái "không có dữ liệu" nhất quán cho mọi danh sách trong app (Projects rỗng, Media rỗng, Notifications rỗng...).
- **Props/API chính:** `{ icon: Icon, title, description, action }` — `Icon` là component icon (thường từ lucide-react, truyền dạng reference chứ không phải JSX), `action` là JSX tuỳ ý (thường là nút "Tạo mới").
- **Logic chi tiết:** Render icon trong khung tròn `bg-muted` (nếu có), `title` in đậm, `description` nhỏ màu mờ (nếu có), `action` cách ra bên dưới (nếu có). Toàn bộ có điều kiện render (`{Icon && ...}`, `{description && ...}`, `{action && ...}`) — component rất linh hoạt, dùng được với chỉ `title` không thôi.
- **Kết nối với file khác:** Dùng trong danh sách rỗng khắp app (theo CLAUDE.md TASK 7 "Empty states đẹp cho tất cả list").
- **Điểm đáng chú ý:** Dùng token `bg-muted`, `text-muted-foreground`, `text-foreground` — tự động đổi theo dark mode không cần code thêm.

### `frontend/src/components/shared/ErrorBoundary.jsx`
- **Chức năng chính:** Class component bắt lỗi render runtime (uncaught exception trong quá trình render của bất kỳ component con nào), hiển thị màn hình lỗi thân thiện thay vì màn hình trắng.
- **Props/API chính:** `{ children }`. State nội bộ: `{ error: null }`.
- **Logic chi tiết:**
  - `static getDerivedStateFromError(error)` — lifecycle method chuẩn của React để bắt lỗi từ component con, trả về state mới `{ error }`.
  - `render()`: nếu `!this.state.error` → render bình thường `this.props.children`. Nếu có lỗi → render full-page error UI: icon cảnh báo, `error.message` (fallback "An unexpected error occurred." nếu không có message), nút "Try again" gọi `this.setState({error: null})` để thử render lại children.
  - **Lưu ý:** Đây là class component (bắt buộc vì React chỉ hỗ trợ Error Boundary qua class component tính đến React 18, chưa có hook API tương đương `useErrorBoundary` chính thức).
- **Kết nối với file khác:** Bọc toàn bộ app ở tầng cao nhất trong `main.jsx` (ngoài cả `QueryClientProvider`).
- **Điểm đáng chú ý:** Đây KHÔNG bắt được lỗi trong route loader/action của react-router (loại lỗi đó được `RouteError` trong `router/index.jsx` xử lý riêng) và cũng không bắt được lỗi async (Promise rejection) hay lỗi trong event handler — chỉ bắt lỗi throw ra trong quá trình render. Dùng đầy đủ design token (`bg-background`, `bg-card`, `border-border`, `text-destructive`, `bg-primary`).

### `frontend/src/components/shared/ExportMenu.jsx`
- **Chức năng chính:** Dropdown button "Export" với 2 lựa chọn CSV/PDF, dùng chung cho mọi trang danh sách có tính năng xuất file.
- **Props/API chính:** `{ onExportCSV, onExportPDF, loading }` — 2 callback do trang cha truyền vào (thường gọi thẳng hàm từ `lib/export.js`), `loading` disable nút trigger khi đang xử lý.
- **Logic chi tiết:** State `open` (boolean) điều khiển dropdown. `useRef` + `useEffect` lắng nghe `mousedown` trên `document` để đóng dropdown khi click ra ngoài (pattern "click outside" phổ biến, dùng `ref.current.contains(e.target)` để kiểm tra). Click "Export CSV"/"Export PDF" → gọi callback tương ứng rồi tự đóng dropdown (`setOpen(false)`).
- **Kết nối với file khác:** Dùng `MarineButton` (bespoke component) làm nút trigger. Được dùng trong `ProjectsPage`, `TripsPage`, `RovsPage`, `UsersPage` (kết hợp với hàm từ `lib/export.js`).
- **Điểm đáng chú ý:** Responsive — label "Export" bị ẩn trên mobile (`hidden sm:inline`), chỉ còn icon, đồng thời nút co lại thành hình vuông (`max-sm:w-9 max-sm:px-0`). Dùng token `bg-card`, `border-border`, `text-foreground`, `hover:bg-muted`.

### `frontend/src/components/shared/Layout.jsx`
- **Chức năng chính:** Layout khung sườn cho toàn bộ khu vực đã đăng nhập — bố trí Sidebar + Navbar + khu vực nội dung chính (`<Outlet/>` của react-router).
- **Props/API chính:** Không nhận props (được route cha render trực tiếp). State: `collapsed` (thu gọn sidebar desktop), `mobileOpen` (mở/đóng drawer sidebar trên mobile).
- **Logic chi tiết:**
  - `useEffect` lắng nghe sự kiện `resize` của `window`: nếu `window.innerWidth >= 1024` (ngưỡng `lg` breakpoint Tailwind) thì tự động đóng `mobileOpen` — tránh trường hợp user mở drawer mobile rồi resize cửa sổ lớn ra mà drawer vẫn kẹt ở trạng thái mở đè lên layout desktop.
  - Overlay tối (`bg-black/50`) hiện khi `mobileOpen === true` và chỉ hiển thị trên mobile (`lg:hidden`), click vào overlay để đóng drawer.
  - Cấu trúc: `flex h-screen` (chiếm toàn bộ viewport height, `overflow-hidden` chặn scroll toàn trang) → `Sidebar` (nhận `collapsed`, `mobileOpen`, `onCloseMobile`) → cột phải `flex flex-col flex-1` chứa `Navbar` (nhận `collapsed`, `onToggleCollapse`, `onOpenMobile`) và `<main className="flex-1 overflow-y-auto p-4 md:p-6">` bọc `<Outlet/>` — đây là nơi scroll thực sự xảy ra (không phải toàn trang).
- **Kết nối với file khác:** Import `Sidebar.jsx`, `Navbar.jsx`. Được `router/index.jsx` dùng làm `element` của route `/` (bọc bởi `ProtectedRoute`).
- **Điểm đáng chú ý:** `min-w-0` trên cột phải là kỹ thuật CSS quan trọng để chống tràn ngang khi nội dung bên trong (bảng rộng, text dài) không co lại đúng trong flex container — nếu thiếu `min-w-0`, flex item mặc định có `min-width: auto` khiến nó không co nhỏ hơn nội dung.

### `frontend/src/components/shared/Navbar.jsx`
- **Chức năng chính:** Thanh điều hướng trên cùng — logo, nút thu gọn sidebar, toggle dark/light mode, chuông thông báo, dropdown avatar user (My Profile / Change Password / Settings / Sign out).
- **Props/API chính:** `{ collapsed, onToggleCollapse, onOpenMobile }` (nhận từ `Layout`). State nội bộ: `dropdownOpen` (dropdown avatar).
- **Logic chi tiết:**
  - Gọi `useSSE()` ngay trong component — đây chính là điểm khởi tạo kết nối SSE cho toàn app (chỉ có 1 lần, vì `Navbar` chỉ mount 1 lần khi vào `Layout`).
  - `useAuthStore` lấy `user`, `logout`; `useThemeStore` lấy `isDark`, `toggle`.
  - `useEffect` + `useRef` (`dropdownRef`) — pattern "click outside" giống `ExportMenu` để đóng dropdown avatar khi click ra ngoài.
  - `handleLogout`: gọi `api.post('/auth/logout')` (bọc `try/catch` rỗng — nếu request logout thất bại vẫn tiếp tục xoá state client-side, không chặn user), sau đó `logout()` (Zustand) và `navigate('/login')`.
  - `menuItems` — mảng 3 mục dropdown, mỗi mục có `icon`, `label`, `action` (điều hướng tới `/profile` với query param `?tab=...` để `ProfilePage` tự mở đúng tab).
  - Nút toggle theme là 1 "switch" UI tự vẽ bằng div/span (không dùng input checkbox thật) — animate `translate-x-7` khi dark, đổi icon Sun/Moon bên trong nút tròn.
  - `ROLE_STYLE` — bảng badge màu theo role (admin: purple, operator: blue, viewer: `bg-muted`/`text-muted-foreground` mặc định).
- **Kết nối với file khác:** Import `NotificationBell.jsx`, `Avatar.jsx`, `useSSE` hook, `useAuthStore`, `useThemeStore`, `lib/axios.js`.
- **Điểm đáng chú ý:** Logo (icon `Waves`) và tên app cũng là nút bấm điều hướng về `/dashboard`. Toàn bộ responsive: tên/role user ẩn trên mobile (`hidden sm:block`), chỉ còn avatar. Token dùng đầy đủ: `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `text-destructive`, `hover:bg-destructive/10`.

### `frontend/src/components/shared/NotificationBell.jsx`
- **Chức năng chính:** Icon chuông thông báo với badge số lượng chưa đọc, dropdown 15 thông báo gần nhất, đánh dấu đã đọc từng cái hoặc tất cả.
- **Props/API chính:** Không nhận props. State: `open` (dropdown). Query: `useQuery(['notifications'], ...)` gọi `GET /notifications?limit=15`. 2 mutation: `markReadMutation` (`PATCH /notifications/:id/read`), `markAllMutation` (`PATCH /notifications/read-all`).
- **Logic chi tiết:**
  - `refetchInterval: 60000` (poll lại mỗi 60s như lớp bảo hiểm/fallback, phòng trường hợp SSE bị rớt kết nối tạm thời) kết hợp `staleTime: 0` (luôn coi dữ liệu cũ, ưu tiên fetch mới khi có cơ hội).
  - `notifications = data?.notifications || []`, `unreadCount = data?.unreadCount || 0` — optional chaining phòng trường hợp `data` chưa load xong.
  - `handleClick(notif)`: nếu `!notif.isRead` → gọi `markReadMutation.mutate(notif._id)`; đóng dropdown; nếu có `notif.link` → `navigate(notif.link)` (điều hướng tới trang liên quan, ví dụ trang Trip bị fail).
  - Cả 2 mutation dùng `onSuccess: () => queryClient.invalidateQueries({queryKey: ['notifications']})` — đây chính là query key mà `useSSE.js` cũng invalidate khi nhận SSE event `type: 'notification'`, tạo thành vòng khép kín: SSE đẩy tin → invalidate → `NotificationBell` tự fetch lại → badge cập nhật ngay lập tức mà không cần đợi tới chu kỳ poll 60s.
  - `TYPE_ICON` — bảng emoji icon theo `notif.type` (`trip_done` ✅, `trip_failed` ❌, `project_completed` 🏁, `account_disabled` 🔒, `ai_summary_done` ✨), fallback 🔔 nếu type lạ.
  - `timeAgo(date)` — hàm hiển thị thời gian tương đối tự viết tay (giây/phút/giờ/ngày), không dùng thư viện ngoài (như `dayjs`/`date-fns`).
- **Kết nối với file khác:** Dùng trong `Navbar.jsx`. Dùng `lib/axios.js` (`api`).
- **Điểm đáng chú ý:** Badge đỏ hiện số (giới hạn hiển thị `99+` nếu vượt quá 99). Item chưa đọc có nền `bg-primary/5` + chấm tròn `bg-primary` bên phải + font-semibold, đã đọc thì `text-muted-foreground`. Toàn bộ tương thích dark mode qua token.

### `frontend/src/components/shared/Pagination.jsx`
- **Chức năng chính:** Component phân trang dùng chung cho mọi danh sách có `page/totalPages/total/limit`.
- **Props/API chính:** `{ page, totalPages, total, limit, onPageChange }`.
- **Logic chi tiết:**
  - Nếu `totalPages <= 1` → return `null` (ẩn hoàn toàn, không hiện thanh phân trang thừa khi chỉ có 1 trang).
  - Tính `from`/`to` để hiện text "X–Y of Total".
  - Thuật toán rút gọn số trang hiển thị: nếu `totalPages <= 7` → hiện tất cả số trang. Nếu nhiều hơn → luôn hiện trang `1`, dấu `...` nếu `page > 3`, dải số quanh trang hiện tại (`page-1` đến `page+1`, giới hạn trong khoảng `[2, totalPages-1]`), dấu `...` nếu còn cách xa trang cuối, và luôn hiện trang cuối `totalPages`. Đây là pattern pagination rút gọn kiểu Google Search phổ biến.
  - Nút Previous/Next disable khi ở trang đầu/cuối (`page === 1` / `page === totalPages`).
- **Kết nối với file khác:** Dùng ở mọi trang danh sách có phân trang: ProjectsPage, TripsPage, RovsPage, UsersPage...
- **Điểm đáng chú ý:** Trang hiện tại có style nổi bật `bg-primary text-primary-foreground`, còn lại `hover:bg-muted text-foreground` — đầy đủ dark mode.

### `frontend/src/components/shared/ProtectedRoute.jsx`
Đã giải thích chi tiết ở section "Tổng quan Route Tree + RBAC". Tóm tắt:
- **Chức năng chính:** Guard component chặn truy cập route khi chưa đăng nhập, và (tuỳ chọn) chặn theo role cụ thể.
- **Props/API chính:** `{ children, roles }` — `roles` là mảng optional (ví dụ `['admin']`).
- **Logic chi tiết:** Check `refreshToken` (không phải `accessToken`) để xác định "đã đăng nhập" — vì `accessToken` có thể tạm `null` ngay sau reload (không persist) trong khi request interceptor của axios đang tự refresh. Nếu có `roles` truyền vào và `user` (đã load) có role không nằm trong danh sách → `<Navigate to="/dashboard" replace />` (không phải trang 403 riêng).
- **Kết nối với file khác:** Bọc quanh `Layout` ở route `/` và bọc quanh `AuditPage` ở route `/audit` trong `router/index.jsx`.
- **Điểm đáng chú ý:** Chỉ dùng `roles` guard duy nhất tại `/audit` — các route "admin-only" khác về UI (như `/users`) không có guard này ở router level, chỉ ẩn trong Sidebar.

### `frontend/src/components/shared/Sidebar.jsx`
- **Chức năng chính:** Menu điều hướng chính bên trái, responsive (desktop collapsible + mobile drawer), lọc mục menu theo role người dùng.
- **Props/API chính:** `{ collapsed, mobileOpen, onCloseMobile }`.
- **Logic chi tiết:**
  - `navItems` — mảng cấu hình tĩnh gồm 6 mục: Dashboard, ROVs, Projects, Trips (đều `roles: ['admin','operator','viewer']` — tất cả role thấy được), Users và Audit Log (đều chỉ `roles: ['admin']`).
  - `filtered = navItems.filter(item => item.roles.includes(user?.role))` — đây chính là **lớp RBAC ở UI** quyết định menu nào hiển thị. Nếu `user` chưa load (`undefined`) thì `user?.role` là `undefined`, `includes(undefined)` sẽ `false` với mọi mảng roles → không hiện gì (an toàn, fail-closed).
  - Component con `NavItem` dùng `NavLink` của react-router (tự động biết `isActive` dựa theo URL hiện tại) — style active: `bg-cyan-700 text-white`; inactive: `text-gray-400 hover:bg-gray-800 hover:text-white`.
  - Render 2 khối riêng biệt: `<aside className="hidden lg:flex ...">` (desktop, luôn hiện nhưng co giãn `w-16`/`w-64` theo `collapsed`) và `<aside className="fixed ... lg:hidden">` (mobile drawer, luôn full width `w-64`, dùng `translate-x-full`/`translate-x-0` để trượt vào/ra, chỉ hiện trên `< lg`).
  - Khi `collapsed`, label text bị ẩn hoàn toàn (chỉ còn icon), và `title={label}` được set làm tooltip native HTML khi hover.
- **Kết nối với file khác:** Dùng trong `Layout.jsx`. Dùng `useAuthStore` để lấy `user.role`.
- **Điểm đáng chú ý:** **Sidebar không dùng design token sáng/tối** — cố tình hard-code `bg-gray-900 text-white` cho cả 2 chế độ desktop lẫn mobile (comment trong code: "Desktop sidebar — always dark regardless of theme"). Đây là quyết định thiết kế có chủ đích: sidebar luôn tối để tạo điểm nhấn thị giác nhất quán, khác với phần còn lại của app đổi theo `isDark`.

### `frontend/src/components/shared/Skeleton.jsx`
- **Chức năng chính:** Bộ 3 component skeleton loading dùng chung: `Skeleton` (khối cơ bản), `TableSkeleton` (khung bảng giả), `CardSkeleton` (khung card giả).
- **Props/API chính:**
  - `Skeleton({ className })` — 1 `<div>` với `animate-pulse bg-muted rounded`, kích thước hoàn toàn phụ thuộc `className` truyền vào (ví dụ `h-4 w-24`).
  - `TableSkeleton({ rows = 5, cols = 4 })` — dựng bảng HTML giả với số hàng/cột tuỳ chỉnh, mỗi ô là 1 `Skeleton`, cột đầu tiên rộng hơn (`w-36` so với `w-24`) mô phỏng cột "tên" thường dài hơn.
  - `CardSkeleton({ count = 3 })` — dựng N card giả, mỗi card có 1 badge tròn giả + text ngắn ở trên, rồi 2 dòng text giả bên dưới (mô phỏng bố cục card thật: badge status + title + subtitle).
- **Logic chi tiết:** Thuần presentational, không có state hay effect — chỉ là các hàm render lặp `Array.from({length: n})`.
- **Kết nối với file khác:** Dùng trong các trang khi `isLoading` từ React Query còn `true` — thay thế nội dung thật bằng khung giả để tránh layout shift và tạo cảm giác app phản hồi nhanh (perceived performance).
- **Điểm đáng chú ý:** Dùng `bg-muted` cho khối skeleton nên tự đổi màu sáng/tối theo token, `animate-pulse` là utility class có sẵn của Tailwind (không cần định nghĩa keyframe riêng).

---

## Bespoke components (Marine* UI Kit)

Đây là bộ UI kit tự viết riêng cho dự án (không phải từ shadcn/ui trực tiếp, dù style tương tự) — dùng tiền tố `Marine` để phân biệt với các component có sẵn của shadcn/ui đã cài. Toàn bộ đều là **controlled component**, không giữ state giá trị nội bộ (trừ UI state như "đang mở dropdown"), nhận `value`/`onChange` từ cha.

### `frontend/src/components/bespoke/MarineButton.jsx`
- **Chức năng chính:** Nút bấm chuẩn hoá cho toàn bộ app, hỗ trợ icon đi kèm và 4 variant màu sắc.
- **Props/API chính:** `{ children, icon: Icon, variant = 'outline', className, ...props }` — `...props` cho phép truyền thẳng mọi thuộc tính `<button>` gốc (`onClick`, `disabled`, `type`, `title`...).
- **Logic chi tiết:**
  - `variant`: `outline` (viền, nền trong suốt — mặc định), `solid` (nền `bg-primary`, dùng cho hành động chính), `danger` (nền `bg-destructive`), `icon` (chỉ icon, không viền, dùng cho nút nhỏ trong toolbar).
  - `isIcon = variant === 'icon'` quyết định padding/border-radius khác biệt: variant `icon` dùng `p-1.5 rounded-md` (vuông nhỏ), các variant khác dùng `h-9 px-4 rounded-md font-medium text-sm` (chiều cao cố định 36px, đồng bộ với input/select cùng bộ).
  - Icon (nếu có) luôn render trước `children`, size cố định `16`, màu `text-current` (kế thừa màu chữ của variant).
- **Kết nối với file khác:** Dùng trong `ExportMenu.jsx` và khắp các trang feature (form submit, action button...).
- **Điểm đáng chú ý:** Toàn bộ màu sắc dùng token (`bg-primary`, `text-primary-foreground`, `bg-destructive`, `border-border`, `focus:ring-ring/30`) — không có màu hard-code, tự động tương thích dark mode 100%.

### `frontend/src/components/bespoke/MarineDatePicker.jsx`
- **Chức năng chính:** Input chọn ngày/giờ styled riêng, dùng native `<input type="date">` hoặc `<input type="datetime-local">` bên dưới nhưng ẩn icon lịch mặc định của trình duyệt và thay bằng icon `Calendar` (lucide-react) tự vẽ.
- **Props/API chính:** `forwardRef(({ className, includeTime = false, ...props }, ref))`. `includeTime = true` → dùng `type="datetime-local"`, ngược lại `type="date"`.
- **Logic chi tiết:**
  - `onMouseDown={(e) => e.preventDefault()}` kết hợp `onClick={(e) => { try { e.target.showPicker() } catch(err) {} }}` — kỹ thuật để **toàn bộ vùng input (không chỉ icon lịch nhỏ) đều mở date picker native khi click**, đồng thời `preventDefault` trên `mousedown` để tránh hành vi focus/caret mặc định gây giật hình trước khi picker mở. `showPicker()` là API mới của trình duyệt (Chromium/Edge), bọc `try/catch` vì Safari/Firefox cũ có thể chưa hỗ trợ — fail silently, input vẫn hoạt động qua click thông thường của trình duyệt.
  - Ẩn icon lịch mặc định bằng `[&::-webkit-calendar-picker-indicator]:hidden` (Tailwind arbitrary variant nhắm vào pseudo-element webkit), rồi tự vẽ icon `Calendar` đè lên bằng `absolute right-3`.
  - `dark:[color-scheme:dark]` — quan trọng để date picker popup của trình duyệt (native UI, ngoài tầm kiểm soát CSS thông thường) cũng hiển thị đúng theme tối thay vì luôn trắng chói (đây chính là chi tiết được nhắc tới trong CLAUDE.md TASK 6c: "colorScheme: 'dark' trên datetime input... để calendar icon hiện đúng ở light mode").
  - Font `font-mono tracking-widest text-xs` cho phần hiển thị ngày/giờ — tạo cảm giác "đồng hồ kỹ thuật" (technical/instrument look) phù hợp theme hàng hải/ROV của app.
- **Kết nối với file khác:** Dùng trong các form có trường ngày (Project form, Trip form, Media recordedAt editor...).
- **Điểm đáng chú ý:** `cursor-pointer select-none` ngăn user bôi đen text bên trong input (vì input này về bản chất được thao tác như 1 "button mở picker" hơn là gõ tay trực tiếp).

### `frontend/src/components/bespoke/MarineInput.jsx`
- **Chức năng chính:** Input text chuẩn hoá style cho toàn app.
- **Props/API chính:** `forwardRef(({ className, ...props }, ref))` — component wrapper mỏng quanh `<input>` gốc, forward mọi props chuẩn HTML (`type`, `value`, `onChange`, `placeholder`, `disabled`...).
- **Logic chi tiết:** Không có logic JS, chỉ là class Tailwind cố định: nền `bg-background`, viền `border-input`, focus ring `ring-ring/30`, disabled state riêng (`disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed`), placeholder mờ `placeholder:text-muted-foreground/50`.
- **Kết nối với file khác:** Dùng trong mọi form khắp app (login, register, project form, trip form, profile...).
- **Điểm đáng chú ý:** `forwardRef` cần thiết để tương thích với các thư viện form (như `react-hook-form` nếu dùng `register()`) cần truy cập DOM node trực tiếp qua ref.

### `frontend/src/components/bespoke/MarineSelect.jsx`
- **Chức năng chính:** Dropdown select tự vẽ hoàn toàn bằng custom UI (không dùng thẻ `<select>` gốc của trình duyệt), nhận `children` là các thẻ `<option>` giống cú pháp select chuẩn để dễ thay thế code cũ.
- **Props/API chính:** `forwardRef(({ className, children, value, onChange, ...props }, ref))`.
- **Logic chi tiết:**
  - Dùng `React.Children.toArray(children).map(...)` để **parse các thẻ `<option>` JSX** thành mảng object `{value, label}` — kỹ thuật đọc `child.props.value` và `child.props.children` (nội dung text bên trong option) mà không thực sự render `<option>` thật ra DOM.
  - `selectedOption = options.find(opt => opt.value === value)` rồi `displayLabel` là label tương ứng — hiển thị trên nút trigger.
  - State `isOpen` điều khiển dropdown, dùng `useRef` (`containerRef`) + `useEffect` "click outside" pattern giống các dropdown khác trong app.
  - `handleSelect(optionValue)`: gọi `onChange({ target: { value: optionValue } })` — **giả lập cấu trúc event của `<select>` gốc** (`e.target.value`) để code cha có thể dùng y hệt cách xử lý `onChange` của native select mà không cần sửa logic, dù bản chất đây là 1 button + list tự vẽ chứ không phải input thật.
  - Render: nút trigger hiển thị `displayLabel` + icon `ChevronDown` xoay 180° khi mở; danh sách `<ul>` position `absolute z-50`, mỗi `<li>` là 1 lựa chọn, active item có `bg-muted/50 text-primary font-semibold`.
- **Kết nối với file khác:** Dùng trong các form filter/select role, status trên khắp trang danh sách (Projects, Trips, Users...).
- **Điểm đáng chú ý:** Vì không dùng `<select>` gốc nên **mất khả năng điều hướng bằng bàn phím mặc định của trình duyệt** (mũi tên lên/xuống, gõ chữ để nhảy option) — đây là điểm yếu về accessibility (a11y) cần lưu ý khi bị hỏi, component không có `onKeyDown` handler để bù đắp. Cũng không có `role="listbox"`/`aria-*` attributes cho screen reader.

### `frontend/src/components/bespoke/MarineTable.jsx`
- **Chức năng chính:** Bộ component con dựng bảng dữ liệu chuẩn hoá — export nhiều named component nhỏ ghép lại thành 1 bảng hoàn chỉnh, cộng thêm 2 tiện ích: badge trạng thái có hiệu ứng "ping" cho status đang chạy, và menu hành động dạng dropdown 3 chấm.
- **Props/API chính (export nhiều thành phần):**
  - `MarineTable({children, className})` — container `<table>` bọc trong div có `border-border rounded-lg shadow-sm overflow-x-auto` (cho phép scroll ngang trên mobile khi bảng quá rộng).
  - `MarineTableHeader`/`MarineTableBody`/`MarineTableRow` — wrapper mỏng cho `<thead>`/`<tbody>`/`<tr>`. `MarineTableRow` nhận thêm `onClick` (tự thêm `cursor-pointer` nếu có) và luôn có `hover:bg-muted/50`.
  - `MarineTableHead({children, className, align})` — ô header, chữ hoa nhỏ `text-[10px] uppercase tracking-widest`, hỗ trợ `align: left|center|right`.
  - `MarineTableCell({children, className, align, isMono})` — ô dữ liệu, `isMono` bật font monospace (dùng cho số/mã kỹ thuật).
  - `MarineTableStatus({status, label})` — badge trạng thái dạng chấm tròn màu + text, không phải pill nền màu như badge thường.
  - `MarineTableActionMenu({children})` / `MarineTableActionItem({children, onClick, isDanger})` — dropdown menu 3-chấm cho hành động trên từng dòng (Edit/Delete...).
- **Logic chi tiết:**
  - `MarineTableStatus`: map `status` string vào `dotColor` theo nhóm nghĩa (không phải khớp chính xác từng status của module cụ thể, mà nhóm theo ý nghĩa chung): `done|success|completed` → xanh emerald; `failed|error|cancelled` → đỏ; `pending|warning|planned|maintenance` → vàng amber; mặc định (fallback) → xám slate. **Trường hợp đặc biệt `running|active|ongoing`**: không dùng chấm tĩnh mà render 1 hiệu ứng "ping" (2 lớp `span` chồng nhau, 1 lớp `animate-ping` tạo vòng sóng lan toả màu cyan, 1 lớp chấm tĩnh cyan bên trong) — mô phỏng animation "đang hoạt động trực tuyến" kiểu radar/status-live phổ biến trong dashboard kỹ thuật.
  - `MarineTableActionMenu`: đây là component phức tạp nhất trong file — dùng `createPortal` để render dropdown ra `document.body` (giống `ConfirmDialog`), tự tính toán vị trí (`coords: {top, left}`) dựa trên `getBoundingClientRect()` của nút trigger **cộng thêm `window.scrollY`/`scrollX`** (vì portal render tuyệt đối theo `document`, không theo container cha có thể đang scroll). Có **collision detection** đơn giản: nếu `rect.top + 100 > window.innerHeight` (dropdown gần chạm đáy màn hình) thì mở dropdown lên trên (`top -= 80`) thay vì xuống dưới. Đóng dropdown khi: click ra ngoài (check cả `buttonRef` và `dropdownRef`), hoặc khi scroll bất kỳ đâu trong trang (`window.addEventListener('scroll', handleScroll, true)` — tham số `true` là **capture phase**, bắt được cả sự kiện scroll xảy ra bên trong 1 div con có `overflow-y-auto`, không chỉ scroll của `window`).
  - `MarineTableActionItem`: mỗi item tự `e.stopPropagation()` trong `onClick` để tránh trigger `onClick` của `MarineTableRow` cha (tránh việc bấm "Delete" trong dropdown lại vô tình kích hoạt luôn hành vi click-để-mở-chi-tiết của cả dòng bảng).
- **Kết nối với file khác:** Dùng trong mọi bảng danh sách: ProjectsPage, TripsPage, RovsPage, UsersPage...
- **Điểm đáng chú ý:** File này gộp cả `import` bổ sung (`useState, useRef, useEffect` từ React, `createPortal`, `MoreVertical` icon) **ở giữa file** (dòng 83-85, sau khi đã export xong nhóm component bảng đầu tiên) — đây là code smell nhẹ về tổ chức file (import không gom hết lên đầu) nhưng không ảnh hưởng chức năng vì ES module hoisting import lên trên khi bundle.

### `frontend/src/components/bespoke/MarineTextarea.jsx`
- **Chức năng chính:** Textarea chuẩn hoá style, tương tự `MarineInput` nhưng cho nội dung nhiều dòng.
- **Props/API chính:** `forwardRef(({ className, ...props }, ref))` — forward mọi props HTML textarea chuẩn (`rows`, `value`, `onChange`, `placeholder`...).
- **Logic chi tiết:** Không có logic JS, chỉ style Tailwind giống hệt pattern của `MarineInput` (cùng bg/border/focus/disabled/placeholder token), cộng thêm `resize-none` (khoá không cho user kéo giãn textarea bằng tay — giữ layout ổn định).
- **Kết nối với file khác:** Dùng trong form có trường mô tả dài: Project form (description), Trip form, ghi chú Evidence/Snapshot (`note`)...
- **Điểm đáng chú ý:** Nhất quán 100% design token với `MarineInput`/`MarineSelect` — cả bộ 3 dùng chung 1 "công thức" class (bg-background, border-input, hover:border-ring/50, focus:ring-ring/30) giúp form trông đồng nhất dù dùng loại input nào.

---

## Bảng tổng hợp: File nào dùng file nào (dependency nhanh)

| File | Import từ (trong phạm vi tài liệu này) |
|---|---|
| `main.jsx` | `App.jsx`, `store/theme.store.js`, `components/shared/ErrorBoundary.jsx` |
| `App.jsx` | `router/index.jsx` |
| `router/index.jsx` | `components/shared/ProtectedRoute.jsx`, `components/shared/Layout.jsx`, các `features/*Page.jsx` |
| `components/shared/Layout.jsx` | `Sidebar.jsx`, `Navbar.jsx` |
| `components/shared/Navbar.jsx` | `store/auth.store.js`, `store/theme.store.js`, `lib/axios.js`, `NotificationBell.jsx`, `hooks/useSSE.js`, `Avatar.jsx` |
| `components/shared/Sidebar.jsx` | `store/auth.store.js` |
| `components/shared/ProtectedRoute.jsx` | `store/auth.store.js` |
| `components/shared/NotificationBell.jsx` | `lib/axios.js` |
| `hooks/useSSE.js` | `store/auth.store.js`, React Query (`useQueryClient`) |
| `lib/axios.js` | `store/auth.store.js` |
| `components/shared/ExportMenu.jsx` | `components/bespoke/MarineButton.jsx` |
| `lib/export.js` | `jspdf`, `html2canvas` (thư viện ngoài) |

---

*Tài liệu được biên soạn tự động dựa trên việc đọc trực tiếp toàn bộ mã nguồn tại thời điểm 2026-07-06. Nếu code thay đổi sau thời điểm này (đặc biệt các TASK 6d/6e/9 đang triển khai theo CLAUDE.md), cần đối chiếu lại.*
