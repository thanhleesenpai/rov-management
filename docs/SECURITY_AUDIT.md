# Security Audit — ROV Management System

Ngày audit: 2026-08-07
Phạm vi: toàn bộ `backend/`, `frontend/`, `yolo-service/`.

Trạng thái: `[ ]` chưa sửa · `[x]` đã sửa · `[~]` tạm hoãn

**Tóm tắt:** 7/8 mục đã sửa (1, 1b, 2, 4, 5, 6, 7, 8). Còn lại mục #3 (refresh token trong localStorage) tạm hoãn theo quyết định của user — đổi kiến trúc lớn, rủi ro cao hơn lợi ích ở giai đoạn hiện tại, xem ghi chú trong mục #3 bên dưới.

**Việc cần làm thủ công trước khi deploy production:**
- [ ] Chạy lại `docker compose up` để xác nhận backend vẫn kết nối được `yolo`/`redis` qua network nội bộ sau khi bỏ port mapping (mục #1/#1b).
- [ ] Đăng nhập thử bằng Google OAuth 1 lần để xác nhận luồng vẫn hoạt động sau thay đổi nonce chống CSRF (mục #8).

---

## 🔴 Nghiêm trọng

### [x] 1. YOLO microservice không có xác thực, bị lộ trực tiếp ra internet
**File:** `docker-compose.yml`, `yolo-service/main.py`

`docker-compose.yml` map `ports: ["8000:8000"]` ra host, trong khi `main.py` không có bất kỳ cơ chế xác thực nào (không API key, không header check).

**Hậu quả:**
- Ai cũng gọi thẳng `POST http://<vps-ip>:8000/detect` — bỏ qua hoàn toàn RBAC, rate limit của backend Node.
- `model` không được validate whitelist trong Python (chỉ có ở tầng Node `media.service.js:165`) — bypass được nếu gọi thẳng port 8000.
- `mediaUrl` bị fetch tùy ý (`requests.get`, không giới hạn size) → **SSRF**: dò/gọi cloud metadata endpoint, Redis nội bộ, backend nội bộ trong docker network.
- Không giới hạn tài nguyên → DoS bằng cách spam job phân tích video nặng.

**Hướng sửa:**
- Bỏ port mapping `8000:8000` khỏi `docker-compose.yml` (backend gọi qua `http://yolo:8000` trong docker network nội bộ, không cần expose ra ngoài).
- Thêm whitelist `model in MODEL_META` ngay trong `get_model()` của Python.
- Giới hạn kích thước tải về trong `requests.get`.

### [x] 1b. Redis cũng bị expose thẳng ra host, không có password
**File:** `docker-compose.yml`

*(Phát hiện thêm trong lúc sửa mục #1 — cùng nguyên nhân: port mapping thừa ra host.)*

`ports: ["6379:6379"]` cho service `redis`, image `redis:alpine` mặc định không set `requirepass`. Redis đang giữ token blacklist (logout security) và Bull queue jobs (AI summary, email, media/snapshot analysis).

**Hậu quả:** Ai có network access tới VPS đều connect thẳng vào Redis (không cần mật khẩu) để: xóa token đã bị blacklist (vô hiệu hóa cơ chế logout), đọc/xóa/chèn job vào Bull queue, hoặc `FLUSHALL` để phá toàn bộ cache/queue.

**Hướng sửa:** Bỏ port mapping `6379:6379` khỏi `docker-compose.yml` (backend gọi qua `redis://redis:6379` trong docker network nội bộ, không cần expose ra ngoài).

---

## 🟠 Cao

### [x] 2. Mass assignment ở PATCH Project/Trip/ROV
**File:** `backend/src/modules/projects/project.service.js`, `backend/src/modules/trips/trip.service.js`, `backend/src/modules/rovs/rov.service.js` (hàm `update`)

Đẩy thẳng `req.body` vào `findByIdAndUpdate` không whitelist field.

**Hậu quả:** Operator có thể `PATCH /trips/:id` với `{"project": "<projectId khác>"}` để di chuyển trip sang project khác, hoặc forge `aiSummary` giả không qua Gemini thật, hoặc đổi `createdBy`.

**Hướng sửa:** Whitelist field được phép update trong từng service, giống cách `media.service.js` đã làm đúng.

### [~] 3. Refresh token lưu trong `localStorage` — TẠM HOÃN

Đã giải thích với user: rủi ro chỉ phát sinh nếu có XSS (hiện chưa tìm thấy XSS nào trong app), và sửa đúng bài (chuyển sang httpOnly cookie) đụng nhiều tới luồng auth (backend set cookie, frontend đổi cách gửi request, cần thêm chống CSRF). User quyết định tạm gác lại, ưu tiên các mục còn lại trước. Giữ nguyên phần mô tả bên dưới để tham khảo khi quay lại làm.

### [ ] 3-orig. Refresh token lưu trong `localStorage`
**File:** `frontend/src/store/auth.store.js`

Refresh token (sống 7 ngày) được Zustand `persist` ghi vào `localStorage`. Nếu có XSS ở bất kỳ đâu trong app, kẻ tấn công đọc được token này = chiếm tài khoản dài hạn.

**Hướng sửa:** Lý tưởng là chuyển sang httpOnly cookie cho refresh token. (Đây là thay đổi kiến trúc lớn hơn — cân nhắc mức độ ưu tiên riêng vì ảnh hưởng luồng auth hiện tại.)

---

## 🟡 Trung bình

### [x] 4. NoSQL injection qua query filter
**File:** `backend/src/modules/projects/project.service.js`, `trip.service.js`, `rov.service.js`, `backend/src/modules/users/user.service.js`

Gán thẳng `req.query.status`/`role`/... vào Mongoose query. `GET /projects?status[$ne]=null` có thể chèn operator Mongo vào query. Không có middleware sanitize toàn cục trong `app.js`.

**Hướng sửa:** Ép kiểu string cho từng giá trị filter trước khi gán vào query, hoặc thêm middleware `express-mongo-sanitize` toàn cục.

### [x] 5. CSV formula injection
**File:** `frontend/src/lib/export.js`

Hàm escape CSV không chặn field bắt đầu bằng `=`, `+`, `-`, `@`. Đặt tên project/note là `=HYPERLINK(...)` rồi export CSV mở bằng Excel sẽ chạy formula.

**Hướng sửa:** Prefix các giá trị bắt đầu bằng `=+-@` bằng `'` trước khi quote.

### [x] 6. Redis blacklist fail-open
**File:** `backend/src/middleware/auth.middleware.js:16-19`

Nếu Redis mất kết nối, token đã logout/thu hồi vẫn được chấp nhận (im lặng, không log cảnh báo).

**Hướng sửa:** Log cảnh báo (`console.warn`) khi Redis check thất bại, để ít nhất có dấu vết giám sát/alerting sau này. (Fail-open vẫn giữ để không gây down toàn hệ thống khi Redis lỗi — nhưng cần log.)

### [x] 7. `/auth/change-password` không bị rate-limit
**File:** `backend/src/modules/auth/auth.routes.js`

Không có `authLimiter` như `/login`, `/register` — có thể brute-force `currentPassword` nếu đã có access token hợp lệ.

**Hướng sửa:** Áp `authLimiter` cho route này.

---

## 🟢 Thấp / nên có thêm

### [x] 8. OAuth callback không có `state` param chống CSRF
**File:** `frontend/src/features/auth/AuthCallback.jsx`

Tin token thẳng từ URL query (dù có xác minh qua `/auth/me`) → có thể bị lợi dụng login-CSRF (dụ nạn nhân đăng nhập vào tài khoản của kẻ tấn công qua link crafted).

**Hướng sửa:** Cần thay đổi ở cả backend (`passport.js`/`auth.controller.js` generate + verify `state`) — độ ưu tiên thấp do impact hạn chế, để cuối cùng.

---

## ✅ Đã kiểm tra, không cần sửa

- Cascade delete Trip/Project (`trip.service.js`, `project.service.js`) — đã implement đúng, xóa cả S3 objects lẫn documents liên quan.
- `password`/`refreshToken` field — `select: false`, không lộ qua API.
- Error middleware — không leak stack trace ngoài môi trường dev.
- File upload — validate MIME + size (500MB) ở server.
- Frontend — không tìm thấy XSS/`dangerouslySetInnerHTML`/`eval`, không có secret hardcode trong bundle.
- YOLO `model`/`confidence` — có validate ở tầng Node (`media.service.js`, `snapshot.service.js`) — nhưng bypass được qua vấn đề #1 ở trên.

---

## Nhật ký sửa lỗi

_(cập nhật mỗi khi sửa xong 1 mục)_

**2026-08-07 — #1 + #1b (YOLO + Redis expose ra internet):**
- `docker-compose.yml`: bỏ `ports: ["8000:8000"]` (yolo) và `ports: ["6379:6379"]` (redis) — cả 2 giờ chỉ reachable qua docker network nội bộ, backend vẫn gọi bình thường qua `http://yolo:8000` và `redis://redis:6379`.
- `yolo-service/main.py`:
  - `get_model()` giờ validate `name` theo regex `[a-zA-Z0-9_-]{1,64}` trước khi build path — chặn path traversal ngay tại tầng Python, không phụ thuộc validate phía Node nữa.
  - `/detect` chuyển sang tải file qua `stream=True` + giới hạn `MAX_DOWNLOAD_BYTES = 500MB`, hủy request giữa chừng nếu vượt — chống DoS bằng file khổng lồ.
- Không ảnh hưởng dev local (dev chạy `uvicorn`/`npm run dev` trực tiếp, không qua `docker-compose.yml`).
- Chưa kiểm thử: chưa chạy lại `docker compose up` để xác nhận backend vẫn kết nối được yolo/redis qua network nội bộ sau khi bỏ port — nên test trước khi deploy lên VPS.

**2026-08-07 — #2 (Mass assignment Project/Trip/ROV):**
- Thêm whitelist field (`UPDATABLE_FIELDS`) trong `project.service.js`, `trip.service.js`, `rov.service.js` — hàm `update()` giờ chỉ lấy đúng field cho phép từ `req.body` trước khi đưa vào `findByIdAndUpdate`, field khác (`createdBy`, `aiSummary`, `project`, `sensorCount`, ...) bị bỏ qua dù client gửi lên.
- Đã đối chiếu với `ProjectForm.jsx`/`TripForm.jsx`/`RovForm.jsx` (form thật đang gửi field gì) để đảm bảo whitelist không thiếu field UI cần — `ProjectForm` có gửi `gpsLocation`/`locationName` trực tiếp (khi user chọn địa điểm trên map) nên đã thêm 2 field này vào whitelist của Project.
- Đã đối chiếu các chỗ update nội bộ khác (`ai.worker.js`, `sensor.controller.js`, `dvl.controller.js`, `sonar.controller.js`, `batch.controller.js`) — tất cả đều gọi thẳng `Project.findByIdAndUpdate`/`Trip.findByIdAndUpdate` trực tiếp trên model, không qua `projectService.update`/`tripService.update`, nên không bị ảnh hưởng bởi whitelist mới.
- `node --check` pass cho cả 3 file.

**2026-08-08 — #7 (rate limit change-password) + #6 (log Redis fail-open):**
- `auth.routes.js`: thêm `authLimiter` vào route `PATCH /auth/change-password` (cùng limiter 20 req/15 phút đang dùng cho `/login`, `/register`).
- `auth.middleware.js`: catch block khi check Redis blacklist giờ log `console.warn` kèm lý do lỗi, thay vì im lặng bỏ qua — vẫn giữ hành vi fail-open (không chặn request khi Redis down) để tránh sập cả hệ thống, chỉ thêm phần log để có dấu vết khi việc này xảy ra.
- `node --check` pass cho cả 2 file.

**2026-08-08 — #4 (NoSQL injection qua query filter):**
- Tạo `backend/src/utils/query.util.js` — hàm `escapeRegex()` dùng chung.
- `project.service.js`, `trip.service.js`, `rov.service.js`, `user.service.js`: filter `status`/`role`/`rov`/`project` giờ ép `String(...)` trước khi gán vào query (chặn injection kiểu `?status[$ne]=null` → object bị coerce thành chuỗi vô hại, sau đó Mongoose CastError nếu không hợp lệ chứ không match được operator).
- Tiện thể sửa luôn 1 vấn đề nhỏ phát hiện cùng chỗ: `search` trước đó được đưa thẳng vào `new RegExp(search, 'i')` không escape — cho phép user tự ý chèn regex pattern (rủi ro ReDoS nhẹ + match không mong muốn). Giờ escape qua `escapeRegex()` trước khi tạo RegExp.
- `node --check` pass cho cả 5 file.

**2026-08-08 — #5 (CSV formula injection):**
- `frontend/src/lib/export.js`, hàm `escape()` trong `toCSV()`: giá trị bắt đầu bằng `=`, `+`, `-`, `@`, tab, hoặc CR giờ được prefix thêm `'` trước khi quote — Excel/Sheets sẽ đọc là text thuần thay vì chạy như formula.
- Không đổi PDF export (`escHtml`) vì đã escape đúng cho context HTML từ trước, không bị ảnh hưởng bởi lớp injection này.

**2026-08-08 — #8 (OAuth login-CSRF):**
- Root cause thật sự: `/auth/callback` (frontend) tin thẳng bất kỳ `accessToken`/`refreshToken` nào có trong URL query, không kiểm tra chúng có thật sự đến từ 1 lần đăng nhập Google mà chính trình duyệt này vừa khởi tạo hay không. Kẻ tấn công có thể tự đăng nhập Google bằng tài khoản CỦA HỌ để lấy token thật, rồi gửi link `https://app/auth/callback?accessToken=...&refreshToken=...` cho nạn nhân — nạn nhân bấm vào sẽ bị đăng nhập nhầm vào tài khoản của kẻ tấn công (không phải bị mất tài khoản, mà là bị "lừa" dùng nhầm tài khoản khác, có thể dẫn tới việc nạn nhân vô tình upload dữ liệu vào tài khoản kẻ tấn công).
- Cách sửa: thêm 1 "số bí mật dùng 1 lần" (nonce) xuyên suốt luồng OAuth:
  - `frontend/src/lib/oauthNonce.js` (mới): `startGoogleOAuth()` sinh nonce ngẫu nhiên (`crypto.randomUUID()`), lưu vào `sessionStorage`, gắn vào URL trước khi redirect sang Google.
  - `LoginPage.jsx`, `RegisterPage.jsx`: nút Google giờ gọi `startGoogleOAuth()` thay vì set thẳng `window.location.href`.
  - `backend/src/utils/oauthState.util.js` (mới): `encodeOAuthState`/`decodeOAuthState` — gói `{clientUrl, nonce}` vào param `state` gửi qua Google và nhận lại (giống cơ chế `state` OAuth chuẩn, trước đây `state` chỉ chứa `clientUrl` dạng base64 thô).
  - `auth.routes.js` (`/google`, `/google/callback`), `auth.controller.js` (`googleCallback`): dùng chung helper trên; nonce được gắn vào URL redirect cuối cùng về `/auth/callback?...&nonce=...`.
  - `AuthCallback.jsx`: đọc `nonce` từ URL, so với giá trị đã lưu trong `sessionStorage` (`consumeOAuthNonce()`, đọc xong xóa luôn — dùng 1 lần). Không khớp hoặc thiếu → từ chối, không gọi `setAuth`.
  - Kẻ tấn công không thể tự ghi vào `sessionStorage` của trình duyệt nạn nhân (khác origin), nên không thể tạo link giả có nonce khớp.
- Tiện thể fix 1 bug nhỏ phát hiện khi sửa: nhánh `catch` lỗi trong `googleCallback` (cũ) parse `state` sai cách (không qua `JSON.parse`) nên nếu có lỗi xảy ra giữa chừng, redirect lỗi sẽ ra URL sai — giờ dùng chung `decodeOAuthState()` nên đúng trong mọi trường hợp.
- Đã build thử `npm run build` ở frontend — pass, không lỗi. `node --check` pass tất cả file backend liên quan.
- **Điểm cần bạn tự test lại bằng tay** (không tự động test được vì cần Google OAuth thật): đăng nhập Google bình thường 1 lần để xác nhận luồng vẫn hoạt động (đăng nhập thành công, redirect đúng về dashboard) — vì đây là thay đổi có khả năng làm gãy luồng OAuth nếu có sai sót.
