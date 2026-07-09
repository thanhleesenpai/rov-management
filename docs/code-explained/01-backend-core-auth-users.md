# Giải thích chi tiết mã nguồn — Core App, Config, Middleware, Utils, Module Auth & Users

> Tài liệu này giải thích từng file mã nguồn backend liên quan tới: khởi tạo app, cấu hình (DB/Redis/S3/Queue/Passport), middleware (auth/error/rate-limit), utils dùng chung, và 2 module `auth` + `users`. Mục tiêu: đọc lại để trả lời câu hỏi phản biện đồ án.
>
> Quy ước chung của dự án (xem `CLAUDE.md`): backend luôn trả response qua `success(res, data)` với format `{ success: true, message, data }`; RBAC có 3 role `viewer / operator / admin`; Project = chuyến khảo sát lớn (nhiều Trip), Trip = 1 lần lặn cụ thể.

---

## Tổng quan luồng Authentication & Authorization

### Sơ đồ tổng thể

```
┌─────────────┐        1. POST /auth/register            ┌──────────────┐
│   Client     │ ────────────────────────────────────────▶│ auth.routes  │
│ (React app) │                                            │  + validation│
└─────────────┘                                            └──────┬───────┘
                                                                    │ authService.register()
                                                                    ▼
                                                          user.model.js (pre-save hook
                                                          bcrypt.hash(password, 12))
                                                                    │
                                                                    ▼
                                                        MongoDB: tạo User (role mặc định 'viewer')

┌─────────────┐        2. POST /auth/login                ┌──────────────┐
│   Client     │ ────────────────────────────────────────▶│ auth.routes  │
└─────────────┘   { email, password }                      └──────┬───────┘
                                                                    │ authService.login()
                                                                    ▼
                                        - tìm user theo email (+password +refreshToken)
                                        - so sánh bcrypt (comparePassword)
                                        - generateAccessToken (15 phút, JWT_SECRET)
                                        - generateRefreshToken (7 ngày, JWT_REFRESH_SECRET)
                                        - lưu refreshToken vào User doc (DB) — cho phép revoke
                                        - trả { accessToken, refreshToken, user }
                                                                    │
                                                                    ▼
                                             Client lưu accessToken + refreshToken
                                             (Zustand store, persist) — theo CLAUDE.md
                                             axios.js interceptor tự gắn Bearer token
                                             mỗi request, tự gọi /auth/refresh khi 401
                                             "Token expired" rồi retry request cũ.

┌─────────────┐   3. Request kèm Authorization: Bearer <accessToken>
│   Client     │ ─────────────────────────────────────────▶
└─────────────┘
                                                          ┌───────────────────────────┐
                                                          │ auth.middleware.authenticate│
                                                          │ - lấy token từ header       │
                                                          │ - jwt.verify(JWT_SECRET)    │
                                                          │ - check Redis blacklist     │
                                                          │   (key blacklist:<token>)   │
                                                          │ - User.findById (bỏ         │
                                                          │   password/refreshToken)    │
                                                          │ - check isActive            │
                                                          │ - req.user = user           │
                                                          └──────────────┬─────────────┘
                                                                         │ next()
                                                          ┌──────────────▼─────────────┐
                                                          │ auth.middleware.authorize   │
                                                          │  (...roles)                │
                                                          │ - roles.includes(req.user.  │
                                                          │   role) ? next() : 403      │
                                                          └──────────────┬─────────────┘
                                                                         ▼
                                                                  Controller xử lý

┌─────────────┐   4. Access token hết hạn (15 phút) → 401 "Token expired"
│   Client     │ ─────────────────────────────────────────▶ axios interceptor
└─────────────┘         tự động POST /auth/refresh { refreshToken }
                                                          ┌───────────────────────────┐
                                                          │ authService.refresh()      │
                                                          │ - jwt.verify(REFRESH_SECRET)│
                                                          │ - User.findById + so sánh   │
                                                          │   user.refreshToken === token│
                                                          │ - generateAccessToken mới    │
                                                          └──────────────┬─────────────┘
                                                                         ▼
                                                          trả accessToken mới, client lưu
                                                          lại và replay request gốc.

┌─────────────┐   5. POST /auth/logout (kèm Bearer accessToken hiện tại)
│   Client     │ ─────────────────────────────────────────▶
└─────────────┘
                                                          ┌───────────────────────────┐
                                                          │ authService.logout()       │
                                                          │ - decode accessToken lấy exp│
                                                          │ - redis.set(blacklist:token,│
                                                          │   '1', EX ttl còn lại)      │
                                                          │ - user.refreshToken = null  │
                                                          │   (revoke refresh token)    │
                                                          └───────────────────────────┘
                                     → Access token cũ bị chặn ngay tại middleware authenticate
                                       (check Redis blacklist) dù còn hạn 15 phút.
                                     → Refresh token bị xoá khỏi DB → không refresh được nữa.
```

### Các điểm mấu chốt cần nhớ khi bị hỏi

1. **Vì sao có 2 loại token (access ngắn hạn, refresh dài hạn)?** Access token ngắn (15 phút) giảm rủi ro nếu bị đánh cắp — kẻ tấn công chỉ dùng được trong thời gian ngắn. Refresh token dài (7 ngày) giúp user không phải đăng nhập lại liên tục, nhưng được lưu trong DB (`user.refreshToken`) để có thể **revoke** (thu hồi) khi logout hoặc khi phát hiện bất thường.
2. **Vì sao access token cần blacklist Redis mà refresh token thì không?** Access token là stateless JWT — server không lưu ở đâu để biết nó đã "hết hiệu lực" trước khi tới thời gian hết hạn tự nhiên, nên cần một cơ chế chặn ngoài (blacklist) khi logout. Refresh token thì được lưu trực tiếp trong document `User.refreshToken` nên chỉ cần set về `null` là đủ để vô hiệu hoá — không cần thêm Redis.
3. **Điều gì xảy ra nếu Redis không chạy (dev không cài Redis)?** Middleware `authenticate` bọc việc check blacklist trong `try/catch` rỗng — nếu Redis lỗi thì coi như không bị blacklist (fail-open), đảm bảo hệ thống vẫn chạy được ở môi trường dev không có Redis. Đây là design trade-off: ưu tiên uptime dev hơn security tuyệt đối ở local.
4. **`authorize(...roles)` hoạt động thế nào?** Là một higher-order function nhận danh sách role cho phép, trả về middleware kiểm tra `req.user.role` (đã được `authenticate` gắn trước đó) có nằm trong danh sách hay không. Route dùng dạng `router.use(authorize('admin'))` (áp cho toàn bộ router users) hoặc theo từng route riêng lẻ ở các module khác.
5. **Google OAuth không tạo session** — `passport.initialize()` được dùng ở `app.js` nhưng KHÔNG dùng `passport.session()`. Toàn bộ luồng OAuth (`session: false`) chỉ nhằm xác thực profile Google rồi phát JWT giống hệt luồng local login — nghĩa là sau khi login Google xong, cơ chế xác thực các request tiếp theo vẫn y hệt (Bearer JWT), không có gì khác biệt ở tầng middleware.

---

## Core App

### `backend/src/app.js`
- **Chức năng chính:** Điểm khởi tạo Express app — đăng ký toàn bộ middleware toàn cục (helmet, cors, rate limit, morgan, passport, body parser), mount tất cả route modules, khởi động các Bull worker, và định nghĩa error handler cuối cùng. File này KHÔNG gọi `app.listen()` — việc đó nằm ở `server.js` để tách biệt "định nghĩa app" khỏi "chạy app" (thuận tiện cho test — có thể `require('./app')` mà không thật sự mở cổng).
- **Các phần quan trọng:**
  - `helmet()` — set các security header mặc định (X-Frame-Options, X-Content-Type-Options, ...) chống các lỗ hổng phổ biến (clickjacking, MIME sniffing).
  - CORS: đọc `CLIENT_URL` từ env (có thể là nhiều domain, phân tách bằng dấu phẩy), dùng hàm `origin` callback tùy chỉnh — cho phép request không có `origin` (ví dụ Postman/server-to-server) đi qua, chỉ chặn khi `origin` có giá trị nhưng không nằm trong whitelist. `credentials: true` để cho phép gửi cookie/Authorization header cross-origin.
  - Rate limiting **chỉ bật khi `NODE_ENV === 'production'`** — có 2 limiter: `authLimiter` (20 request / 15 phút, áp cho `/auth/login` và `/auth/register`) và `generalLimiter` (100 request / 15 phút áp cho toàn bộ `/api`). Lý do tách production mới bật: để dev/test không bị chặn khi gọi API liên tục.
  - `morgan` — logging request, dùng format `'combined'` (đầy đủ, chuẩn Apache log) khi production, `'dev'` (ngắn gọn, có màu) khi dev.
  - `passport.initialize()` — bắt buộc phải gọi trước khi dùng bất kỳ `passport.authenticate(...)` nào ở route (dùng trong Google OAuth).
  - `express.json({ limit: '8mb' })` — giới hạn body request nâng lên 8MB (bình thường Express mặc định 100kb) để chứa được ảnh base64 (thumbnail của Snapshot/Evidence — xem TASK 6b-3 trong CLAUDE.md).
  - Đăng ký các Bull worker bằng `require(...)` (không gán biến) — các file `ai.worker.js`, `media.worker.js`, `snapshot.worker.js` tự đăng ký `queue.process(...)` ngay khi được require, nên chỉ cần require 1 lần để worker bắt đầu lắng nghe job.
  - Route 404 dùng `app.use('*', ...)` đặt sau tất cả route hợp lệ.
  - `errorHandler` luôn phải là middleware **cuối cùng** — Express nhận diện middleware xử lý lỗi qua chữ ký 4 tham số `(err, req, res, next)`.
- **Luồng dữ liệu / kết nối:** Được `require` bởi `server.js`. Import toàn bộ route module (`auth`, `users`, `rovs`, `projects`, `trips`, `media`, `stats`, `notifications`, `audit`, `snapshots`) và middleware (`error.middleware`, `passport`).
- **Điểm đáng chú ý:** Body limit 8MB là một thay đổi có chủ đích ghi rõ trong comment — nếu hội đồng hỏi "tại sao không dùng multipart form upload cho ảnh snapshot" thì trả lời: canvas burn-in bbox tạo ra base64 PNG ở client, gửi thẳng qua JSON để đơn giản hoá luồng, đổi lại phải tăng body limit.

### `backend/src/server.js`
- **Chức năng chính:** Entry point thực sự khi chạy `node src/server.js` (hoặc qua `npm run dev`) — load biến môi trường, kết nối MongoDB, sau đó mới `listen`.
- **Các hàm/logic quan trọng:**
  - `require('dotenv').config()` — load file `.env` vào `process.env`, phải gọi **trước** khi `require('./app')` (vì `app.js` và các module con đọc `process.env` ngay tại thời điểm import, ví dụ `CLIENT_URL`, `GOOGLE_CLIENT_ID`).
  - `connectDB().then(() => app.listen(PORT, ...))` — đảm bảo server chỉ bắt đầu nhận request sau khi MongoDB đã kết nối thành công, tránh trường hợp request tới nhưng DB chưa sẵn sàng.
  - `process.on('unhandledRejection', ...)` — log Promise bị reject mà không có `.catch()`, không cho crash app (một số nơi trong code cố ý dùng `.catch(() => {})` nhưng đây là lưới an toàn cuối).
  - `process.on('uncaughtException', ...)` — log lỗi đồng bộ không bắt được rồi chủ động `process.exit(1)` — triết lý: lỗi đồng bộ không bắt được có thể để lại state không nhất quán, nên thà crash và để process manager (PM2/Docker) restart còn hơn chạy tiếp ở trạng thái hỏng.
- **Luồng dữ liệu / kết nối:** Import `app.js` và `config/db.js`.
- **Điểm đáng chú ý:** Tách `server.js` khỏi `app.js` là pattern chuẩn để unit test có thể import `app` mà không mở port thật (dùng `supertest` chẳng hạn).

---

## Config

### `backend/src/config/db.js`
- **Chức năng chính:** Thiết lập kết nối MongoDB Atlas qua Mongoose.
- **Hàm quan trọng:** `connectDB()` — hàm async, gọi `mongoose.connect(process.env.MONGODB_URI)`. Nếu lỗi, log ra và gọi `process.exit(1)` — chủ động dừng hẳn server nếu không kết nối được DB (không có DB thì server vô nghĩa).
- **Luồng dữ liệu:** Được gọi duy nhất 1 lần trong `server.js` trước `app.listen`.
- **Điểm đáng chú ý:** Không có logic retry — nếu Atlas tạm thời down lúc khởi động, server sẽ thoát ngay chứ không tự thử lại. Đây là điểm có thể cải thiện nhưng chấp nhận được cho phạm vi đồ án.

### `backend/src/config/passport.js`
- **Chức năng chính:** Cấu hình chiến lược (Strategy) xác thực Google OAuth2 cho Passport.js, dùng riêng cho luồng "Continue with Google".
- **Logic quan trọng:**
  - Guard đầu file: nếu thiếu `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` trong env thì chỉ log warning rồi `module.exports = passport` (chưa đăng ký GoogleStrategy) và `return` sớm — cho phép app chạy bình thường (login email/password vẫn hoạt động) ngay cả khi chưa cấu hình Google OAuth.
  - `GoogleStrategy` callback nhận `(accessToken, refreshToken, profile, done)` từ Google:
    1. Lấy email từ `profile.emails[0].value`; nếu Google không trả email → `done(null, false, {message: 'No email from Google'})`.
    2. Tìm `User` theo email:
       - **Nếu đã tồn tại** (user từng đăng ký bằng email/password hoặc từng login Google trước đó): nếu user đó **chưa có `googleId`** thì gắn `googleId` + đổi `authProvider = 'google'` + lấy avatar từ Google nếu user chưa có avatar — đây là cơ chế **account linking**: cùng 1 email dù đăng ký cách nào cũng chỉ có 1 user document, tránh duplicate.
       - **Nếu chưa tồn tại**: tạo user mới với `role: 'viewer'` (mặc định thấp nhất), `authProvider: 'google'`, không có `password`.
    3. Check `user.isActive` — nếu bị admin disable thì trả lỗi `'Account has been disabled'` ngay tại bước xác thực, không cho login.
    4. `done(null, user)` — trả user cho Passport, Passport gắn vào `req.user` (vì dùng `session:false` nên không serialize/deserialize session, chỉ dùng cho request hiện tại).
- **Luồng dữ liệu / kết nối:** Được `require` ở `app.js` (`passport.initialize()`) và `auth.routes.js` (`passport.authenticate('google', ...)`). Sau khi `done(null, user)`, quyền điều khiển chuyển tới `auth.controller.googleCallback` — nơi thực sự phát JWT.
- **Điểm đáng chú ý:** Module này KHÔNG serialize/deserialize user vào session (`passport.serializeUser`/`deserializeUser` không được định nghĩa) — vì hệ thống dùng JWT thuần, không dùng session cookie. Đây là lý do phải truyền `session: false` ở mọi nơi gọi `passport.authenticate('google', ...)`.

### `backend/src/config/queue.js`
- **Chức năng chính:** Khởi tạo 4 Bull queue (Redis-backed job queue) dùng cho các tác vụ async nặng: `ai-summary`, `email`, `media-analysis`, `snapshot-analysis`.
- **Hàm quan trọng:**
  - `createQueue(name)` — factory tạo Bull queue với cấu hình mặc định: `removeOnComplete: 50` (giữ tối đa 50 job thành công gần nhất, tránh phình Redis), `removeOnFail: 100`, `attempts: 3` (retry 3 lần), `backoff: exponential 2000ms` (lần retry sau cách xa hơn lần trước), `timeout: 60000` (job quá 60s bị coi là fail).
  - `mediaAnalysisQueue` và `snapshotAnalysisQueue` được tạo riêng (không qua `createQueue`) vì cần cấu hình khác biệt: `attempts: 1` (không retry — vì video timeout thì retry lại cũng sẽ timeout y hệt, tốn tài nguyên vô ích, chỉ hữu ích nếu lỗi là ECONNREFUSED tạm thời) và `timeout` rất dài — 25 phút cho media (đủ cho video ~40 phút chạy trên CPU chậm), 5 phút cho snapshot (clip ngắn).
  - Mỗi queue có listener `.on('error', ...)` và `.on('failed', ...)` để log lỗi ra console mà **không crash app** — queue lỗi không nên làm sập toàn bộ API server.
- **Luồng dữ liệu / kết nối:** Được import bởi các `*.worker.js` (để `.process(...)`) và các controller cần enqueue job (ví dụ `POST /projects/:id/ai-summary`, `POST /media/:id/analyze`).
- **Điểm đáng chú ý:** Đây chính là nơi hiện thực hoá nguyên tắc trong CLAUDE.md "AI call có thể mất 5-15s, không nên block HTTP request" — job được đẩy vào Bull, HTTP trả về ngay (202 Accepted), worker xử lý nền rồi push kết quả qua SSE.

### `backend/src/config/redis.js`
- **Chức năng chính:** Khởi tạo client Redis (dùng thư viện `ioredis`) dùng chung cho toàn app — chủ yếu cho token blacklist (xem `auth.middleware.js`, `auth.service.js`).
- **Cấu hình đáng chú ý:**
  - `maxRetriesPerRequest: 0` — nếu Redis không phản hồi, fail ngay lập tức thay vì retry vô hạn (tránh treo request).
  - `lazyConnect: true` — không tự kết nối ngay khi khởi tạo object, chỉ kết nối khi có lệnh đầu tiên được gọi.
  - `enableOfflineQueue: false` — không xếp hàng đợi các lệnh khi mất kết nối (nếu offline thì lệnh fail ngay thay vì đợi).
  - Listener `'error'` — chỉ log lỗi khi `NODE_ENV === 'production'`; ở dev, im lặng bỏ qua vì máy dev thường không chạy Redis.
- **Luồng dữ liệu / kết nối:** Được import ở `auth.middleware.js` (check blacklist) và `auth.service.js` (set blacklist khi logout), cũng như các rate-limit / notification SSE module khác trong hệ thống.
- **Điểm đáng chú ý:** Toàn bộ thiết kế xoay quanh nguyên tắc "fail open, không fail closed" ở môi trường dev — nếu Redis không có, hệ thống auth vẫn hoạt động (không blacklist được, nhưng không sập).

### `backend/src/config/s3.js`
- **Chức năng chính:** Khởi tạo AWS S3 client (SDK v3) dùng cho việc tạo presigned URL upload/download media, avatar, snapshot...
- **Cấu hình đáng chú ý:** `requestChecksumCalculation: 'WHEN_REQUIRED'` và `responseChecksumValidation: 'WHEN_REQUIRED'` — comment giải thích rõ: SDK v3 bản mới thêm tính năng tự động tính checksum theo mặc định, gây lỗi khi dùng với presigned URL (vì client upload trực tiếp lên S3 không qua backend, không thể tính checksum theo cách SDK mong đợi) → phải tắt bớt, chỉ tính khi thực sự bắt buộc.
- **Luồng dữ liệu / kết nối:** Được import ở nhiều module: `auth.controller.js` (avatar presigned URL), `utils/avatar.util.js` (freshen avatar URL), `media` module, `snapshots` module, `trip.service.js` (xóa S3 object khi cascade delete).
- **Điểm đáng chú ý:** Đây là ví dụ thực tế về một bug đã gặp và fix trong quá trình làm đồ án (ghi rõ trong comment) — kiến thức hữu ích khi hội đồng hỏi "gặp khó khăn gì khi tích hợp AWS SDK".

---

## Middleware

### `backend/src/middleware/auth.middleware.js`
- **Chức năng chính:** 2 middleware lõi của toàn bộ hệ thống phân quyền: `authenticate` (xác thực JWT) và `authorize(...roles)` (kiểm tra vai trò).
- **Hàm quan trọng:**
  - **`authenticate(req, res, next)`:**
    1. Đọc header `Authorization`, bắt buộc có dạng `Bearer <token>` — nếu thiếu, trả `401 "No token provided"`.
    2. Tách token, `jwt.verify(token, process.env.JWT_SECRET)` — nếu sai chữ ký hoặc hết hạn, ném exception, được bắt ở `catch` bên dưới.
    3. Check Redis blacklist: `redis.get('blacklist:' + token)` — nếu tồn tại (nghĩa là token đã bị logout trước đó) → trả `401 "Token has been revoked"`. Bọc trong `try/catch` rỗng để **fail open** khi Redis không sẵn sàng (dev).
    4. `User.findById(decoded.id).select('-password -refreshToken')` — lấy user hiện tại từ DB (không phải chỉ tin vào payload JWT) để đảm bảo dữ liệu mới nhất (ví dụ role vừa bị đổi, tài khoản vừa bị khoá).
    5. Nếu không tìm thấy user → `401`; nếu `!user.isActive` → `403 "Account is disabled"` (phân biệt rõ 401 = chưa xác thực được, 403 = xác thực được nhưng không có quyền/tài khoản bị khoá).
    6. Gán `req.user = user`, gọi `next()`.
    7. `catch (error)`: phân biệt `TokenExpiredError` (báo rõ "Token expired" — để frontend biết cần gọi `/auth/refresh`) với các lỗi khác (`"Invalid token"` chung chung, ví dụ chữ ký sai/bị sửa token).
  - **`authorize(...roles)`:** higher-order function — trả về middleware kiểm tra `roles.includes(req.user.role)`. Phải dùng SAU `authenticate` (vì cần `req.user` đã được gắn). Ví dụ dùng: `router.use(authorize('admin'))` trong `user.routes.js` để khoá toàn bộ router chỉ cho admin.
- **Luồng dữ liệu / kết nối:** Import `User` model và Redis client. Được dùng ở hầu hết mọi route file (`auth.routes.js`, `user.routes.js`, và các module khác ngoài phạm vi tài liệu này).
- **Điểm đáng chú ý (bảo mật):**
  - Luôn truy vấn lại DB thay vì tin hoàn toàn vào payload JWT — đảm bảo nếu admin vừa disable một tài khoản, request tiếp theo của tài khoản đó bị chặn ngay (không phải đợi tới khi JWT hết hạn).
  - Redis blacklist là cơ chế duy nhất để "thu hồi" access token trước hạn, vì JWT bản chất stateless.
  - `select('-password -refreshToken')` đảm bảo các field nhạy cảm không bao giờ lọt vào `req.user` rồi vô tình trả ra response.

### `backend/src/middleware/error.middleware.js`
- **Chức năng chính:** Middleware xử lý lỗi tập trung (error-handling middleware) — bắt mọi lỗi được `next(err)` từ các controller và chuẩn hoá response.
- **Hàm quan trọng:** `errorHandler(err, req, res, next)` (chữ ký 4 tham số bắt buộc để Express nhận diện đây là error handler):
  - Log lỗi ra console.
  - Nếu `err.name === 'ValidationError'` (lỗi validate của Mongoose, ví dụ thiếu field required) → trả `400` kèm mảng message rút ra từ `err.errors`.
  - Nếu `err.code === 11000` (MongoDB duplicate key error, ví dụ email đã tồn tại nhưng không được check trước) → trả `400` với message `"<field> already exists"`, lấy tên field từ `err.keyValue`.
  - Nếu `err.statusCode` tồn tại (convention toàn dự án: các service ném lỗi dạng `throw { statusCode, message }`) → trả đúng status code và message đó.
  - Mặc định: `500 Internal Server Error`, kèm `stack` trace nếu đang ở môi trường `development` (ẩn ở production vì lý do bảo mật — không lộ chi tiết code cho client).
- **Luồng dữ liệu / kết nối:** Được đăng ký cuối cùng trong `app.js` (`app.use(errorHandler)`). Mọi controller trong dự án dùng try/catch rồi gọi `next(err)` để lỗi rơi vào đây.
- **Điểm đáng chú ý:** Đây là lý do vì sao các service trong dự án hay `throw { statusCode: 400, message: '...' }` (object thường, không phải `new Error()`) — middleware này được thiết kế để đọc trực tiếp `err.statusCode`/`err.message` từ object đó.

### `backend/src/middleware/rateLimit.middleware.js`
- **Chức năng chính:** Định nghĩa `authLimiter` — giới hạn số request tới các endpoint auth nhạy cảm (login/register) nhằm chống brute-force và spam đăng ký.
- **Cấu hình:** `windowMs: 15 phút`, `max: 20` request/IP trong khung đó; `standardHeaders: true` (trả header `RateLimit-*` chuẩn IETF), `legacyHeaders: false` (tắt header kiểu cũ `X-RateLimit-*`); `skip: () => NODE_ENV === 'test'` — bỏ qua rate limit hoàn toàn khi chạy test tự động (để script `functional-test.js` không bị chặn khi gọi login liên tục).
- **Luồng dữ liệu / kết nối:** Được import và gắn vào route `POST /auth/register` và `POST /auth/login` trong `auth.routes.js` (`authLimiter` áp dụng độc lập, không phụ thuộc `NODE_ENV === production` như limiter khai báo trực tiếp trong `app.js` — đây là 2 lớp rate limit khác nhau cùng tồn tại trong code, `app.js` có limiter riêng cho production, còn middleware này áp trực tiếp tại route bất kể môi trường trừ khi test).
- **Điểm đáng chú ý:** Kết quả đo trong CLAUDE.md phần Load Testing xác nhận: `POST /auth/login` có "41/60 errors" khi test tải — đây chính là rate limiter hoạt động đúng như thiết kế (chặn bớt request vượt ngưỡng), không phải bug.

---

## Utils

### `backend/src/utils/avatar.util.js`
- **Chức năng chính:** Chuyển đổi S3 key của avatar thành presigned URL tạm thời (có thời hạn) để client hiển thị ảnh — vì bucket S3 không public, mọi ảnh phải truy cập qua presigned URL.
- **Hàm quan trọng:** `freshenAvatar(avatar)`:
  - Nếu `avatar` rỗng/null hoặc không bắt đầu bằng `'avatars/'` (nghĩa là đây là URL công khai từ Google, ví dụ ảnh đại diện Google — không phải S3 key nội bộ) → trả nguyên giá trị (hoặc `null`).
  - Ngược lại (avatar do user tự upload lên S3 qua `avatarPresigned`), tạo `GetObjectCommand` rồi `getSignedUrl(...)` với `expiresIn: 3600` (1 giờ).
- **Luồng dữ liệu / kết nối:** Dùng ở `auth.controller.js` (hàm `login`, `me`, `updateMe`) và `user.controller.js` (`getAllUsers`) — bất cứ nơi nào trả thông tin user ra client đều phải "làm tươi" avatar trước khi trả về, vì presigned URL cũ có thể đã hết hạn.
- **Điểm đáng chú ý:** Đây là lý do vì sao mỗi lần gọi `GET /users`, backend phải `Promise.all(map(async u => ...))` — chuyển từng avatar key thành URL mới, tốn thêm round-trip tới AWS nhưng cần thiết vì S3 bucket private.

### `backend/src/utils/geocode.util.js`
- **Chức năng chính:** Reverse geocoding (chuyển tọa độ GPS thành tên địa danh dễ đọc) dùng OpenStreetMap Nominatim API miễn phí — phục vụ TASK 5 (Sensor Data Upload) để tự động điền `trip.locationName` từ `lat/lng` trong file CSV.
- **Hàm quan trọng:**
  - `buildCleanName(address)` — nhận object `address` trả về từ Nominatim, rút gọn thành dạng "Phường/Quận, Thành phố" rồi strip các tiền tố hành chính tiếng Việt (`Phường`, `Xã`, `Quận`, `Thành phố`, ...) qua regex `VN_PREFIXES` để tên hiển thị gọn hơn (ví dụ "Phường Hòa Cường, Thành phố Đà Nẵng" → "Hòa Cường, Đà Nẵng"). Có fallback chuỗi ưu tiên: `suburb → quarter → neighbourhood → village` cho cấp phường/xã, và `city → town → county → state` cho cấp thành phố/tỉnh.
  - `reverseGeocode(lat, lng)` — gọi `fetch` tới Nominatim với `User-Agent` tuỳ chỉnh (bắt buộc theo chính sách sử dụng của Nominatim, nếu không có User-Agent định danh sẽ bị chặn), có `AbortSignal.timeout(5000)` (timeout 5s tránh treo request nếu Nominatim chậm/down). Nếu lỗi bất kỳ (network, timeout, JSON parse) → catch và trả chuỗi rỗng `''`, KHÔNG throw — đảm bảo lỗi geocode không làm fail toàn bộ luồng upload sensor data.
  - `parseCoordString(str)` — helper nhận diện chuỗi dạng `"lat, lng"` (ví dụ paste trực tiếp từ Google Maps), dùng regex bắt số thực có dấu `-` tùy chọn, rồi validate range hợp lệ (`-90..90` cho lat, `-180..180` cho lng).
- **Luồng dữ liệu / kết nối:** Được dùng trong module `sensor` (khi upload CSV có cột `lat/lng` ở dòng đầu) để set `trip.gpsLocation` + `trip.locationName`, và có thể dùng ở form nhập tay GPS trong module `trips`.
- **Điểm đáng chú ý:** Thiết kế "never throw, always return usable fallback" (trả `''` khi lỗi) là chủ đích — geocoding chỉ là tính năng phụ trợ (nice-to-have hiển thị tên địa danh), không được phép làm gián đoạn luồng chính (lưu sensor data).

### `backend/src/utils/jwt.util.js`
- **Chức năng chính:** Tạo access token và refresh token JWT.
- **Hàm quan trọng:**
  - `generateAccessToken(userId)` — `jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '15m' })`. Payload chỉ chứa `id` — tối giản, không nhét role/email vào token (tránh trường hợp role bị đổi nhưng token cũ vẫn mang role cũ; middleware `authenticate` luôn query lại DB để lấy role mới nhất).
  - `generateRefreshToken(userId)` — tương tự nhưng dùng `JWT_REFRESH_SECRET` riêng biệt (secret khác với access token — nếu 1 secret bị lộ thì secret kia vẫn an toàn) và `expiresIn: '7d'`.
- **Luồng dữ liệu / kết nối:** Dùng trong `auth.service.js` (`login`, `refresh`) và `auth.controller.js` (`googleCallback`).
- **Điểm đáng chú ý:** Việc tách 2 secret khác nhau cho access/refresh là một best-practice bảo mật — hạn chế thiệt hại nếu 1 trong 2 secret bị rò rỉ.

### `backend/src/utils/parseTimestamp.util.js`
- **Chức năng chính:** Parse timestamp nhúng trong tên file (theo convention `_YYYYMMDD_HHMMSS`) do phần mềm trên ROV tự đặt tên khi ghi file (video, sensor log, DVL, sonar...) — phục vụ TASK 6d/9 (Multi-file support, trip_master.json manifest).
- **Hàm quan trọng:** `parseTimestampFromFilename(filename)` — dùng regex `/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/` bắt 6 nhóm số (năm/tháng/ngày/giờ/phút/giây). Nếu không khớp → trả `null` (không throw — file không có pattern thời gian là hợp lệ, ví dụ file người dùng tự đặt tên tuỳ ý). Nếu khớp, dựng chuỗi ISO có `+07:00` (giờ Việt Nam, UTC+7) rồi tạo `Date` — comment ghi rõ lý do: **timestamp trong tên file là giờ địa phương Việt Nam, không phải UTC**, nên phải cộng offset +07:00 khi parse để `Date` object lưu đúng thời điểm UTC tương ứng.
- **Luồng dữ liệu / kết nối:** Dùng trong `media` module (auto-set `media.recordedAt` sau khi confirm upload — TASK 6d-3) và `trips/batch.controller.js` (parse `session_id` dạng tương tự trong `trip_master.json` — TASK 9).
- **Điểm đáng chú ý:** Đây là ví dụ điển hình về xử lý timezone — nếu quên cộng `+07:00` (parse như UTC mặc định) thì mọi `recordedAt` tự động sẽ lệch 7 tiếng so với thực tế, làm sai lệch tính năng sync chart-video (TASK 6c/6e).

### `backend/src/utils/response.util.js`
- **Chức năng chính:** Chuẩn hoá format response toàn hệ thống — đây chính là 2 hàm `success`/`error` được nhắc tới xuyên suốt CLAUDE.md ("Backend dùng `success(res, data)` — KHÔNG dùng `res.json()` trực tiếp").
- **Hàm quan trọng:**
  - `success(res, data, message = 'Success', statusCode = 200)` — trả `res.status(statusCode).json({ success: true, message, data })`.
  - `error(res, message = 'Error', statusCode = 500)` — trả `{ success: false, message }`. (Trong thực tế, phần lớn lỗi trong dự án đi qua `next(err)` → `error.middleware.js` chứ ít khi gọi trực tiếp hàm `error` này; hàm `error` tồn tại như một tiện ích dự phòng.)
- **Luồng dữ liệu / kết nối:** Được import ở hầu như mọi controller trong toàn bộ backend.
- **Điểm đáng chú ý:** Vì response luôn có shape cố định `{ success, message, data }`, frontend (`axios.js` interceptor) có thể xử lý đồng nhất: `response.data` chính là object này, và các React Query hook chỉ cần đọc `result.data` để lấy payload thật sự — đây là lý do CLAUDE.md nhấn mạnh bảng "Cấu trúc `data` theo endpoint".

---

## Module `auth`

### `backend/src/modules/auth/auth.validation.js`
- **Chức năng chính:** Khai báo các rule validate input bằng `express-validator` cho 3 luồng: register, login, đổi mật khẩu.
- **Các export:**
  - `registerValidation` — `email` phải đúng định dạng (`isEmail`) và được `normalizeEmail()` (chuẩn hoá, ví dụ lowercase, bỏ dấu chấm thừa trong gmail); `password` tối thiểu 6 ký tự; `fullName` không được rỗng và bị `trim()`.
  - `loginValidation` — chỉ check `email` đúng định dạng và `password` không rỗng (không check độ dài ở đây vì có thể user cũ có password ngắn hơn rule mới, hoặc chỉ đơn giản là không cần thiết phải duplicate rule).
  - `changePasswordValidation` — `currentPassword` không rỗng, `newPassword` tối thiểu 6 ký tự.
- **Luồng dữ liệu / kết nối:** Được import làm middleware array trong `auth.routes.js`, đặt trước controller (`router.post('/register', authLimiter, registerValidation, authController.register)`). Kết quả validate được đọc lại bằng `validationResult(req)` bên trong controller.
- **Điểm đáng chú ý:** `express-validator` không tự động trả lỗi — nó chỉ gắn kết quả vào `req`, controller phải chủ động gọi `validationResult(req)` rồi check `.isEmpty()`. Đây là điểm dễ bị hỏi "tại sao có validation nhưng không thấy nó throw lỗi tự động".

### `backend/src/modules/auth/auth.service.js`
- **Chức năng chính:** Chứa toàn bộ business logic của authentication — tách biệt hoàn toàn khỏi controller (đúng convention "Controller không chứa business logic — chuyển hết sang service" trong CLAUDE.md).
- **Các hàm quan trọng:**
  - `register({ email, password, fullName })`:
    - Check `User.findOne({ email })` — nếu đã tồn tại, `throw { statusCode: 400, message: 'Email already in use' }` (check tường minh, không dựa vào lỗi duplicate key của MongoDB như `error.middleware.js` có hỗ trợ — đây là kiểm tra sớm, thân thiện hơn).
    - `User.create(...)` — mật khẩu được hash tự động qua `pre('save')` hook trong `user.model.js` (không hash thủ công trong service).
    - Trả về object rút gọn (không có password/refreshToken).
  - `login({ email, password })`:
    - `.select('+password +refreshToken')` — bắt buộc phải chỉ định rõ vì 2 field này có `select: false` mặc định trong schema (không tự động load).
    - Check tồn tại, check `isActive`, check password qua `user.comparePassword(password)` (bcrypt.compare).
    - Sinh cả 2 token, **lưu refreshToken vào DB** (`user.refreshToken = refreshToken`) và cập nhật `lastLoginAt` — đây là cơ chế cho phép revoke refresh token sau này (so sánh token client gửi lên với token lưu trong DB).
    - Trả về `{ accessToken, refreshToken, user }` (user rút gọn field cần thiết cho frontend, không lộ password hash).
  - `refresh(token)`:
    - Verify chữ ký bằng `JWT_REFRESH_SECRET` — nếu invalid/hết hạn, `throw 401`.
    - **Quan trọng:** không chỉ tin JWT hợp lệ mà còn phải so `user.refreshToken !== token` — nếu refresh token đã bị thay thế (ví dụ user logout rồi, hoặc đã refresh 1 lần khác trước đó — dù thiết kế hiện tại refresh không sinh refresh token mới nên token cũ vẫn dùng lại được nhiều lần cho tới khi logout hoặc hết hạn 7 ngày) → từ chối. Đây chính là cơ chế **revocation** thực sự (JWT tự thân không thể bị thu hồi, nhưng so sánh với giá trị lưu trong DB thì có thể).
    - Chỉ sinh **access token mới**, không sinh refresh token mới (refresh token giữ nguyên cho tới khi hết hạn 7 ngày hoặc logout).
  - `logout(userId, accessToken)`:
    - Tìm user theo `userId`, nếu tồn tại:
      - Nếu có `accessToken` truyền vào: `jwt.decode(accessToken)` (không verify — chỉ cần đọc payload để lấy `exp`, vì token này chắc chắn hợp lệ do đã qua middleware `authenticate` trước khi tới route logout) → tính `ttl = exp - now` (giây còn lại) → `redis.set('blacklist:' + token, '1', 'EX', ttl)` — set TTL đúng bằng thời gian còn lại của token, để Redis tự động xoá key khi token hết hạn tự nhiên (tối ưu bộ nhớ, không cần cron dọn dẹp).
      - Bọc trong try/catch rỗng — nếu Redis lỗi, logout vẫn "thành công" (refresh token vẫn bị xoá) chỉ là access token cũ không bị chặn sớm.
      - `user.refreshToken = null` — vô hiệu hoá hoàn toàn khả năng refresh trong tương lai.
  - `changePassword(userId, { currentPassword, newPassword })`:
    - Lấy `+password`, so sánh mật khẩu hiện tại đúng không, nếu sai `throw 400`.
    - Gán `user.password = newPassword` rồi `save()` — trigger lại `pre('save')` hook để hash mật khẩu mới (vì `isModified('password')` sẽ là `true`).
- **Luồng dữ liệu / kết nối:** Import `User` model, `jwt.util.js`. Được gọi từ `auth.controller.js`. `logout` còn `require('../../config/redis')` **lazy** (bên trong hàm, không import đầu file) — có thể là chủ đích để tránh load Redis module khi không cần, hoặc tránh circular dependency.
- **Điểm đáng chú ý (bug/edge case):**
  - Refresh token không được "xoay vòng" (rotate) mỗi lần refresh — cùng 1 refresh token có thể dùng để lấy access token mới nhiều lần trong 7 ngày. Đây là thiết kế đơn giản hoá cho đồ án; hệ thống production thực tế thường rotate refresh token mỗi lần dùng để giảm thiểu rủi ro replay attack.
  - `comparePassword` (trong `user.model.js`) sẽ `throw` nếu user không có password (tài khoản Google) — vì vậy tài khoản Google không login được bằng email/password, đúng với thiết kế.

### `backend/src/modules/auth/auth.controller.js`
- **Chức năng chính:** Tầng điều phối HTTP — nhận request, validate, gọi service tương ứng, format response qua `success()`, xử lý presigned URL avatar và callback Google OAuth.
- **Các hàm quan trọng:**
  - `register` / `login`: check `validationResult(req)` trước, nếu có lỗi trả `400` kèm mảng lỗi chi tiết (không qua `success()` — đây là 1 trong số ít chỗ dùng `res.status().json()` trực tiếp thay vì `success()`, vì đây là lỗi validate input chứ không phải success case). Nếu hợp lệ, gọi `authService.register/login`, với `login` còn gọi thêm `freshenAvatar` để trả avatar URL còn hiệu lực.
  - `refresh`: đơn giản gọi `authService.refresh(req.body.refreshToken)`.
  - `logout`: lấy token từ header (`req.headers.authorization.split(' ')[1]`), gọi `authService.logout(req.user._id, token)` — `req.user` đã được gắn bởi middleware `authenticate` (route logout yêu cầu `authenticate` trước).
  - `me`: trả toàn bộ thông tin user hiện tại (`req.user.toObject()`), làm tươi avatar trước khi trả.
  - `updateMe`: chỉ cho phép cập nhật `fullName` và `avatar` (whitelist rõ ràng bằng object `allowed` — không dùng trực tiếp `req.body` để tránh mass assignment, ví dụ user không thể tự đổi `role` qua endpoint này).
  - `avatarPresigned`: sinh presigned URL để client upload trực tiếp avatar lên S3:
    - Validate `fileName` + `mimeType` phải là `image/*`.
    - Tạo `s3Key = avatars/<userId>/<uuid>.<ext>` — namespacing theo userId, tên file random UUID tránh trùng/đoán được.
    - `getSignedUrl(... PutObjectCommand ..., { expiresIn: 300 })` — URL chỉ có hiệu lực 5 phút để upload.
    - Trả `{ uploadUrl, s3Key }` — client upload PUT trực tiếp lên `uploadUrl`, sau đó gọi `PATCH /auth/me` với `avatar: s3Key` để lưu key vào DB (`freshenAvatar` sẽ convert key này thành GET presigned URL mỗi lần hiển thị).
  - `changePassword`: check validate, gọi `authService.changePassword`.
  - `googleCallback`: được gọi sau khi Passport xác thực Google xong (`req.user` là user document từ `passport.js`):
    - Sinh access + refresh token y hệt luồng login thường, lưu refreshToken vào DB, cập nhật `lastLoginAt`.
    - Đọc `clientUrl` từ `req.query.state` (base64-encoded, được gán khi khởi tạo luồng ở `/auth/google` — xem `auth.routes.js`) để redirect đúng về domain frontend gốc (hỗ trợ nhiều domain/tab khác nhau, ví dụ dev localhost vs ngrok).
    - Redirect về `${clientUrl}/auth/callback?accessToken=...&refreshToken=...` — token được truyền qua **query string** (không phải cookie/header) vì đây là redirect trình duyệt, không phải AJAX call — frontend (`AuthCallback.jsx` theo CLAUDE.md) đọc token từ URL rồi lưu vào Zustand.
    - Có `try/catch` bao ngoài — nếu có lỗi bất kỳ (kể cả lỗi giải mã `state`), fallback redirect về `/login?error=oauth_failed`.
- **Luồng dữ liệu / kết nối:** Import `auth.service.js`, `response.util.js`, `avatar.util.js`, `jwt.util.js`, và (lazy-require bên trong hàm) `user.model.js`, S3 SDK, `uuid`. Được dùng bởi `auth.routes.js`.
- **Điểm đáng chú ý:**
  - Token truyền qua query string trong redirect OAuth là điểm nhạy cảm bảo mật (token có thể lưu trong browser history/logs) — chấp nhận được cho đồ án nhưng là điểm có thể bị hội đồng hỏi "có an toàn không" → câu trả lời: đây là pattern phổ biến cho SPA + OAuth khi không dùng cookie httpOnly, rủi ro giảm vì access token sống ngắn (15 phút) và kênh truyền là HTTPS.
  - `state` param dùng để giữ lại `clientUrl` xuyên suốt redirect tới Google rồi quay lại — kỹ thuật cần thiết vì ứng dụng có thể chạy ở nhiều origin khác nhau (localhost, ngrok tunnel, production domain) và Google chỉ redirect về đúng 1 `callbackURL` cấu hình sẵn (backend), nên backend cần biết phải redirect tiếp về đâu.

### `backend/src/modules/auth/auth.routes.js`
- **Chức năng chính:** Định nghĩa toàn bộ endpoint dưới prefix `/api/v1/auth` (mount tại `app.js`), gắn đúng thứ tự middleware (rate limit → validation → controller, hoặc authenticate → controller).
- **Danh sách route:**
  - `POST /register` — `authLimiter` + `registerValidation` + `authController.register`.
  - `POST /login` — `authLimiter` + `loginValidation` + `authController.login`.
  - `POST /refresh` — không cần `authenticate` (vì access token đã hết hạn mới cần refresh) và không rate-limit riêng.
  - `POST /logout` — cần `authenticate` (phải có access token hợp lệ để logout — hợp lý vì logout cần biết `req.user._id`).
  - `GET /me`, `PATCH /me` — cần `authenticate`.
  - `PATCH /change-password` — cần `authenticate` + `changePasswordValidation`.
  - `POST /me/avatar/presigned` — cần `authenticate`.
  - `GET /google` — route khởi tạo OAuth: tính toán `clientUrl` từ header `origin`/`referer` của request (để biết đúng frontend nào đang gọi, hỗ trợ multi-domain), encode base64 vào `state`, rồi gọi `passport.authenticate('google', { scope: ['profile','email'], session:false, state })`.
  - `GET /google/callback` — dùng custom callback wrapper thay vì để Passport tự redirect lỗi mặc định: gọi `passport.authenticate('google', {session:false}, (err, user, info) => {...})` dạng custom callback để tự xử lý 3 trường hợp: lỗi hệ thống (`err`) → redirect `oauth_failed`; không có user (`info.message === 'Account has been disabled'`) → redirect `account_disabled`, ngược lại `oauth_failed`; thành công → gán `req.user = user` rồi `next()` để đi tới `authController.googleCallback`.
- **Luồng dữ liệu / kết nối:** Import `passport` (đã cấu hình GoogleStrategy), `auth.controller.js`, `auth.validation.js`, `auth.middleware.js`, `rateLimit.middleware.js`. Được mount ở `app.js` (`app.use('/api/v1/auth', authRoutes)`).
- **Điểm đáng chú ý:** Việc tính `clientUrl` ở CẢ route `/google` (dựa vào `origin`/`referer` header) LẪN đã encode vào `state` cho thấy nỗ lực hỗ trợ nhiều môi trường chạy (localhost, ngrok — xem commit gần đây "fix ngrok" trong git log) — một điểm dễ bị hỏi "tại sao phải làm phức tạp vậy" → vì OAuth callback URL đăng ký với Google là cố định (thường trỏ về backend), nhưng frontend có thể chạy ở nhiều origin khác nhau tuỳ lúc dev/demo.

---

## Module `users`

### `backend/src/modules/users/user.model.js`
- **Chức năng chính:** Định nghĩa Mongoose schema cho `User` — nền tảng cho toàn bộ hệ thống auth/RBAC.
- **Schema fields:**
  - `email` — required, unique (index), lowercase + trim tự động.
  - `password` — `select: false` (không tự động load khi query, phải `.select('+password')` tường minh) — optional (không `required`) để hỗ trợ tài khoản Google không có password.
  - `googleId`, `authProvider` (`enum: ['local','google']`, default `'local'`) — hỗ trợ Google OAuth (TASK 1).
  - `fullName` — required, trim.
  - `avatar` — lưu S3 key (không phải URL đầy đủ) hoặc URL Google trực tiếp, default `null`.
  - `role` — `enum: ['admin','operator','viewer']`, default `'viewer'` — **mọi user mới (kể cả qua Google) đều mặc định là viewer**, admin phải chủ động nâng quyền qua `PATCH /users/:id`.
  - `isActive` — default `true`, dùng để "soft ban" tài khoản (không xoá user, chỉ khoá đăng nhập).
  - `refreshToken` — `select: false`, lưu refresh token hiện hành để có thể revoke.
  - `lastLoginAt` — cập nhật mỗi lần login (local hoặc Google).
  - `{ timestamps: true }` — tự động thêm `createdAt`/`updatedAt`.
- **Hook/method quan trọng:**
  - `userSchema.pre('save', ...)` — trước khi lưu, nếu `password` bị thay đổi (`isModified('password')`) VÀ có giá trị (khác `null`/`undefined`, phòng trường hợp user Google không có password) → hash bằng `bcrypt.hash(password, 12)` (cost factor 12 — mức phổ biến cân bằng giữa bảo mật và hiệu năng).
  - `comparePassword(candidatePassword)` — nếu user không có `password` (tài khoản Google thuần) → `throw { statusCode: 400, message: 'This account uses Google login' }` (thông báo rõ ràng thay vì lỗi so sánh mơ hồ); ngược lại `bcrypt.compare(candidate, this.password)`.
- **Luồng dữ liệu / kết nối:** Được dùng ở hầu như mọi module: `auth.service.js`, `auth.controller.js`, `passport.js`, `user.service.js`, và bất cứ đâu cần `populate` thông tin người tạo resource (project, trip, media...).
- **Điểm đáng chú ý:**
  - Không có index tường minh cho `role` trong file này dù CLAUDE.md liệt kê `User: { role: 1 }` là index "cần thêm" — có thể chưa được áp dụng, là điểm có thể bị hỏi "index nào đã có, index nào còn thiếu".
  - Việc để `password` optional + kiểm tra kỹ trong `comparePassword` là thiết kế cốt lõi cho phép 1 model User dùng chung cho cả local và Google auth mà không cần tách bảng riêng.

### `backend/src/modules/users/user.controller.js`
- **Chức năng chính:** Xử lý HTTP cho các thao tác quản trị user (chỉ admin dùng — route đã khoá `authorize('admin')` ở tầng router) — danh sách, cập nhật, khoá/mở tài khoản, thao tác hàng loạt.
- **Các hàm quan trọng:**
  - `getAllUsers(req, res, next)`: gọi `userService.getAllUsers(req.query)` lấy `{ users, total, page, totalPages }`, sau đó `Promise.all` map từng user để `freshenAvatar` (chuyển S3 key thành presigned URL) trước khi trả — đúng format "Paginated" nhưng field mảng tên là `users` (không phải `data` như projects/trips) — CLAUDE.md có ghi chú riêng bảng này ("Users | `{ users: [...], total, page, totalPages }`").
  - `updateUser`: gọi `userService.updateUser(...)`; nếu request có `req.body.role` → ghi audit log hành động `'change_role'` (không `await`, không block response — audit log chạy "fire and forget").
  - `toggleStatus`: gọi `userService.toggleStatus(...)`; ghi audit log `'activate'` hoặc `'disable'` tuỳ `data.isActive` mới.
  - `bulkStatus`: validate `ids` là mảng không rỗng và `isActive` là boolean (thủ công, không qua express-validator) → gọi `userService.bulkSetStatus`; nếu `isActive === false` (đang disable hàng loạt) → với MỖI user bị disable, gọi `notifService.create(userId, 'account_disabled', ...)` để tạo thông báo trong hệ thống (TASK 2 — Notification), bọc `.catch(() => {})` để lỗi tạo notification không làm fail toàn bộ request; sau đó ghi audit log `'bulk_activate'`/`'bulk_disable'` kèm `count` và `ids`.
  - `bulkRole`: validate `ids` + `role` nằm trong danh sách hợp lệ (`['viewer','operator','admin']`) → gọi `userService.bulkSetRole` → ghi audit `'bulk_change_role'`.
- **Luồng dữ liệu / kết nối:** Import `user.service.js`, `response.util.js`, `notification.service.js` (module `notifications`), `audit.service.js` (module `audit`), `avatar.util.js`. Được dùng bởi `user.routes.js`.
- **Điểm đáng chú ý:**
  - Audit log và notification đều được gọi **không `await`** (fire-and-forget) — chủ đích để không làm chậm response chính; đánh đổi là nếu ghi log thất bại thì mất log âm thầm (chấp nhận được vì đây là log phụ trợ, không phải nghiệp vụ chính).
  - Validate input thủ công (`Array.isArray`, `typeof`) thay vì dùng `express-validator` cho các route bulk — không nhất quán với `auth` module (dùng express-validator) nhưng vẫn đảm bảo an toàn cơ bản.

### `backend/src/modules/users/user.routes.js`
- **Chức năng chính:** Định nghĩa route dưới prefix `/api/v1/users`, áp dụng khoá quyền admin cho TOÀN BỘ router ngay từ đầu.
- **Cấu trúc:**
  - `router.use(authenticate)` rồi `router.use(authorize('admin'))` — áp dụng cho MỌI route bên dưới, nghĩa là user module hoàn toàn không có endpoint public hay dành cho operator/viewer.
  - `GET /` — danh sách user (`getAllUsers`).
  - `PATCH /bulk/status`, `PATCH /bulk/role` — **đặt TRƯỚC** `PATCH /:id` — đúng nguyên tắc trong CLAUDE.md ("Bulk routes phải đặt TRƯỚC `/:id` trong Express router"), vì nếu đặt sau, Express sẽ match `/:id` với `"bulk"` như một ObjectId (gây lỗi cast hoặc route sai).
  - `PATCH /:id` — cập nhật fullName/role/avatar.
  - `PATCH /:id/status` — toggle khoá/mở tài khoản.
- **Luồng dữ liệu / kết nối:** Import `user.controller.js`, `auth.middleware.js`. Mount tại `app.js` (`app.use('/api/v1/users', userRoutes)`).
- **Điểm đáng chú ý:** Đây là module RBAC "chặt" nhất trong hệ thống — không có route nào cho viewer/operator, khác với `rovs`/`projects`/`trips` (viewer đọc được, operator tạo/sửa được).

### `backend/src/modules/users/user.service.js`
- **Chức năng chính:** Business logic + MongoDB query cho quản lý user — tách khỏi controller.
- **Các hàm quan trọng:**
  - `getAllUsers({ page=1, limit=10, search, role })`:
    - Xây `query` động: nếu có `search` → `$or` tìm theo `fullName` hoặc `email` bằng `RegExp(search, 'i')` (case-insensitive, tìm gần đúng — LƯU Ý: dùng RegExp trực tiếp từ input người dùng có thể có rủi ro ReDoS nếu search string phức tạp, nhưng chấp nhận được cho phạm vi đồ án); nếu có `role` → lọc chính xác theo field đó.
    - `Promise.all([User.find(query).skip().limit().sort({createdAt:-1}), User.countDocuments(query)])` — chạy song song 2 query (lấy trang dữ liệu + đếm tổng) thay vì tuần tự, tối ưu thời gian phản hồi.
    - Trả `{ users, total, page, totalPages: Math.ceil(total/limit) }`.
  - `updateUser(id, data, requesterId)`:
    - Whitelist field được phép update: chỉ `['fullName', 'role', 'avatar']` — dùng `Object.fromEntries(Object.entries(data).filter(...))` để lọc bỏ mọi field khác (chống mass assignment, ví dụ không cho tự sửa `email`/`isActive` qua endpoint này).
    - **Self-protection:** nếu `id === requesterId` (admin đang tự sửa chính mình) VÀ có `updates.role` → `throw 400 "Cannot change your own role"` — ngăn admin tự hạ quyền chính mình dẫn đến mất quyền truy cập (hoặc tự nâng quyền một cách không chủ đích/audit).
    - `findByIdAndUpdate(..., { new: true, runValidators: true })` — `runValidators` đảm bảo Mongoose vẫn áp dụng validation schema (ví dụ `enum` của `role`) khi update qua `findByIdAndUpdate` (mặc định method này KHÔNG chạy validators trừ khi chỉ định).
    - Nếu không tìm thấy user → `throw 404`.
  - `toggleStatus(id, requesterId)`:
    - **Self-protection:** nếu `id === requesterId` → `throw 400 "Cannot disable your own account"` — ngăn admin tự khoá tài khoản của chính mình (dẫn đến tự khoá quyền truy cập hệ thống).
    - Lấy user, đảo ngược `isActive = !isActive`, `save()`.
  - `bulkSetStatus(ids, isActive, requesterId)`:
    - `ids.filter(id => id !== requesterId.toString())` — tự động loại bỏ chính admin ra khỏi danh sách bulk (self-protection áp dụng ngầm định, không throw lỗi mà âm thầm bỏ qua — khác với `toggleStatus` đơn lẻ sẽ throw rõ ràng).
    - `User.updateMany({_id: {$in: filtered}}, {isActive})` — cập nhật hàng loạt bằng 1 query duy nhất (hiệu quả hơn loop từng document).
    - Trả về `filtered.length` (số lượng thực sự bị ảnh hưởng, đã trừ admin tự thân).
  - `bulkSetRole(ids, role, requesterId)` — tương tự `bulkSetStatus` nhưng đổi field `role`.
- **Luồng dữ liệu / kết nối:** Import `User` model. Được gọi từ `user.controller.js`.
- **Điểm đáng chú ý:**
  - Có 2 cách xử lý self-protection khác nhau trong cùng file: đơn lẻ (`updateUser`, `toggleStatus`) → `throw` lỗi rõ ràng cho biết hành động bị chặn; hàng loạt (`bulkSetStatus`, `bulkSetRole`) → âm thầm `filter` bỏ qua admin đang thao tác, không báo lỗi (vì trong ngữ cảnh bulk, admin có thể vô tình chọn cả chính mình trong danh sách — chặn cứng sẽ làm fail toàn bộ request bulk, filter bỏ qua là UX tốt hơn).
  - `User.updateMany` không kích hoạt `pre('save')` hook (hook chỉ chạy với `.save()`) — nhưng ở đây không cần vì chỉ update `isActive`/`role`, không đụng tới `password`.

---

## Tổng kết nhanh — các câu hỏi phản biện thường gặp

1. **"Tại sao access token 15 phút mà không phải 1 giờ hay 1 ngày?"** → Cân bằng giữa bảo mật (giảm cửa sổ tấn công nếu token bị đánh cắp) và trải nghiệm người dùng (không phải login lại quá thường xuyên nhờ silent refresh tự động ở axios interceptor).
2. **"Nếu không có Redis thì hệ thống auth có an toàn không?"** → Vẫn xác thực JWT bình thường (chữ ký + hết hạn), chỉ mất khả năng "thu hồi sớm" access token khi logout — đây là trade-off chấp nhận được cho môi trường dev, và có cảnh báo rõ trong code.
3. **"Làm sao đảm bảo user bị khoá (`isActive=false`) không dùng được token cũ?"** → Middleware `authenticate` LUÔN query lại `User.findById` mỗi request (không tin payload JWT), nên phát hiện `isActive=false` ngay lập tức.
4. **"RBAC được enforce ở đâu?"** → 2 lớp: (1) tầng route — `authorize(...roles)` chặn truy cập theo role tại middleware; (2) tầng service — self-protection logic (admin không tự hạ quyền/khoá chính mình).
5. **"Mật khẩu được hash bằng gì, cost factor bao nhiêu?"** → `bcryptjs`, cost factor 12, thực hiện tự động trong Mongoose `pre('save')` hook — không hash thủ công ở service/controller.
6. **"Google OAuth và local login có dùng chung cơ chế token không?"** → Có, hoàn toàn giống nhau — sau khi Passport xác thực xong profile Google, `googleCallback` sinh JWT y hệt luồng login thường; điểm khác biệt duy nhất là JWT được truyền qua query string trong redirect thay vì trong response body JSON.
