# Kịch bản Demo chi tiết (dùng để tập dượt / đi phản biện trước khi bảo vệ chính thức)

Đây là tài liệu **riêng biệt**, độc lập với kịch bản thuyết trình 10 phút (file 05). Mục đích: chuẩn bị cho buổi **phản biện sơ bộ / tập dượt trước khi bảo vệ chính thức**, nơi thường có nhiều thời gian hơn để vận hành trực tiếp phần mềm, nên kịch bản này đi qua **gần như toàn bộ tính năng**, chi tiết đến từng thao tác click, kèm lời dẫn nói trong lúc thao tác, mốc thời gian ước tính, và phương án xử lý nếu có sự cố.

**Tổng thời lượng ước tính: ~25-30 phút** (linh hoạt cắt theo bảng ưu tiên ở cuối file nếu buổi phản biện giới hạn thời gian hơn).

---

## A. CHUẨN BỊ TRƯỚC KHI DEMO (làm trước tối thiểu 30 phút)

### A.1 — Khởi động đầy đủ hệ thống
- [ ] `cd backend && npm run dev` (port 5000) — kiểm tra log không có lỗi kết nối MongoDB/Redis
- [ ] `cd frontend && npm run dev` (port 5173)
- [ ] `cd yolo-service` — khởi động FastAPI (uvicorn) — kiểm tra `GET http://localhost:8000/models` trả về danh sách model, không lỗi
- [ ] Redis đang chạy (Docker `redis:alpine` hoặc local) — kiểm tra `redis-cli ping` trả `PONG`
- [ ] Kiểm tra biến môi trường `GEMINI_API_KEY` còn quota (thử gọi thử 1 lần trước nếu nghi ngờ)
- [ ] Kiểm tra kết nối MongoDB Atlas + AWS S3 (thử upload nhỏ 1 lần trước)

### A.2 — Chuẩn bị dữ liệu mẫu (seed sẵn, KHÔNG demo upload live trừ khi chủ động chọn ở mục D)
- [ ] Chạy `node backend/src/scripts/seed-full.js --reset` để có bộ dữ liệu mẫu sạch
- [ ] Đảm bảo có ít nhất:
  - 1 **Project** trạng thái `completed`, có từ 2-3 **Trip**
  - 1 **Trip** có đầy đủ: sensor CSV (dùng `test-data/sensor-sample-full.csv` — 60 readings, 2 anomaly spikes, GPS Đà Nẵng), 1 video có vật thể rõ ràng (cá/rác thải) + `recordedAt` đã set, vài ảnh
  - 1 **ROV** đang gắn với nhiều Project (để demo trang chi tiết ROV có dữ liệu)
- [ ] Nếu có thể, **chạy trước 1 lần** YOLO analyze trên video demo (để lúc trình diễn không phải chờ 10-60 giây) — nhưng vẫn giữ 1 video/ảnh CHƯA phân tích để demo được thao tác "Run Analysis" thực sự chạy

### A.3 — Tài khoản đăng nhập sẵn (mở nhiều tab/trình duyệt)
| Tài khoản | Mật khẩu | Dùng cho |
|---|---|---|
| `admin@rov.local` | `Admin@123` | Demo chính, User Management, Audit Log |
| `operator@rov.local` | `Operator@123` | Demo upload/tạo dữ liệu nếu cần |
| `viewer@rov.local` | `Viewer@123` | Demo RBAC — không thấy nút Upload/Xóa |

- [ ] Tab 1: đăng nhập `admin` — dùng cho phần lớn demo
- [ ] Tab 2: đăng nhập `viewer` — để chuyển nhanh sang lúc demo RBAC (mục K)
- [ ] Tab 3 (dự phòng): đăng nhập `admin` lần nữa trên trình duyệt/thiết bị khác — dùng cho demo SSE 2 tab (mục J)

### A.4 — Rủi ro cần lường trước
- Nếu mạng chậm hoặc S3/Gemini timeout: có sẵn phương án nói "em xin phép mô tả lại vì mạng demo hơi chậm" và chuyển sang dùng ảnh chụp màn hình đã chuẩn bị sẵn (backup slide) thay vì đứng chờ.
- Không demo trên mạng công cộng không ổn định nếu tránh được — ưu tiên 4G cá nhân hoặc mạng đã test trước.

---

## B. Bước 1 — Đăng nhập & Dashboard tổng quan
**Thời lượng:** ~1 phút

1. Mở trang login, đăng nhập tài khoản `admin@rov.local`
2. Vào Dashboard — chỉ lần lượt: 4 stat card (Total Projects, Running Trips, Active ROVs, Total Users), donut Project Status, bar Trips by Status, horizontal bar ROV Utilization, activity timeline 6 tháng
3. **Lời dẫn:** "Đây là trang tổng quan hiển thị ngay sau khi đăng nhập, tổng hợp từ 7 phép aggregation MongoDB chạy song song phía backend."

**Nếu có thời gian dư:** bật/tắt dark mode ở đây để tiện thể hiện luôn (nút toggle trên Navbar), nói 1 câu về design token system.

---

## C. Bước 2 — Quản lý User (chỉ admin)
**Thời lượng:** ~1 phút

1. Vào trang `/users`
2. Chỉ danh sách, thử search theo tên/email, filter theo role
3. Thử đổi role 1 user test (không phải tài khoản demo chính) hoặc bật/tắt trạng thái active
4. Chọn 2-3 user (chế độ bulk select) → thử bulk activate/deactivate
5. **Lời dẫn:** "Admin có thể quản lý toàn bộ user, kể cả thao tác hàng loạt — mỗi hành động này sẽ được ghi vào Audit Log, em sẽ quay lại phần này ở cuối."

---

## D. Bước 3 — Quản lý ROV
**Thời lượng:** ~1 phút

1. Vào `/rovs`, chỉ danh sách + trạng thái (active/maintenance/retired)
2. Click vào 1 ROV đã có nhiều Project → RovDetailPage: chỉ 4 KPI card (Total/Completed/Active Now Projects, Total Hours) + bảng lịch sử Project
3. **(Tuỳ chọn nếu muốn chứng minh ràng buộc nghiệp vụ):** thử xóa ROV đang được Project tham chiếu → hệ thống báo lỗi chặn xóa
4. **Lời dẫn:** "Hệ thống không cho xóa ROV đang được Project sử dụng, để bảo toàn lịch sử vận hành thiết bị."

---

## E. Bước 4 — Quản lý Project & Trip
**Thời lượng:** ~1.5 phút

1. Vào `/projects`, thử filter theo status/ROV/khoảng ngày, thử search
2. Click vào 1 Project → ProjectDetailPage: chỉ danh sách Trip bên trong, mở rộng 1 TripCard xem "DATA FILES" (nếu đã làm xong TASK 6d) hoặc badge sensor/media count
3. Thử Export CSV/PDF danh sách Project
4. **(Tuỳ chọn — chứng minh cascade delete, dùng 1 Project TEST tạo riêng, KHÔNG dùng Project demo chính):**
   - Tạo nhanh 1 Project test + 1 Trip test + upload thử 1 ảnh nhỏ
   - Xóa Project test đó
   - Mở MongoDB Atlas / S3 console (nếu đã đăng nhập sẵn ở tab khác) để chỉ ra dữ liệu liên quan đã bị xóa sạch
5. **Lời dẫn:** "Project là chuyến khảo sát lớn, Trip là từng lần lặn cụ thể. Khi xóa Project, toàn bộ Trip con và dữ liệu sensor/media/DVL/sonar liên quan đều được xóa theo, kể cả file vật lý trên S3."

**Nếu thiếu thời gian:** bỏ bước cascade delete live (rủi ro thao tác nhầm dữ liệu demo chính), chỉ mô tả bằng lời.

---

## F. Bước 5 — Upload Folder — nếu chọn demo live
**Thời lượng:** ~1.5 phút

> ⚠️ Đây là thao tác có rủi ro cao nhất (phụ thuộc mạng, xử lý file) — chỉ demo live nếu đã test kỹ trước đó với đúng thư mục mẫu. Nếu không chắc chắn, bỏ qua bước này và chỉ mô tả bằng lời + ảnh chụp kết quả.

1. Vào 1 Trip trống (chưa có sensor data), mở modal "Upload dữ liệu ROV"
2. Bấm nút **"Select folder"** (hoặc kéo-thả cả thư mục vào khung upload) → chọn thẳng 1 thư mục mẫu đã chuẩn bị (chứa vài file sensor CSV, DVL JSON, sonar) — không cần nén ZIP
3. Upload → chờ kết quả → chỉ rõ bảng kết quả phân loại (`results.sensor`, `results.dvl`, `results.sonar`, nếu có `results.unknown`)
4. **Lời dẫn:** "Hệ thống tự động phân loại từng file trong thư mục theo quy ước tên file, không cần operator tự tay chọn loại file hay nén file lại."

---

## G. Bước 6 — Sensor Data & Anomaly Detection
**Thời lượng:** ~1 phút

1. Vào Trip đã có sẵn sensor data mẫu (`sensor-sample-full.csv`)
2. Chỉ biểu đồ 3 đường (depth/temp/pressure), chỉ 1-2 điểm được highlight đỏ (anomaly)
3. Mở panel "Anomalies Detected" bên cạnh, đọc nhanh 1 entry (giá trị, thời điểm, z-score)
4. Thử toggle ẩn/hiện 1 đường trên Legend
5. **Lời dẫn:** "Các điểm đỏ này được thuật toán Z-Score tự động phát hiện khi độ lệch chuẩn vượt ngưỡng 2.5 — mô phỏng một sự cố cảm biến."

---

## H. Bước 7 — Media Gallery
**Thời lượng:** ~45 giây

1. Vào tab Media của Trip demo, chỉ Gallery có video + ảnh
2. Thử kéo-thả sắp xếp lại thứ tự 2 item
3. Click mở lightbox 1 ảnh, điều hướng bằng phím mũi tên
4. **Lời dẫn:** "Media được upload thẳng lên S3 qua presigned URL, không qua backend, giảm tải server."

---

## I. Bước 8 — TripDetailPage: Cockpit Layout đầy đủ (PHẦN TRỌNG TÂM)
**Thời lượng:** ~4-5 phút — đầu tư kỹ nhất, đi chậm

1. Click vào Trip demo chính (đã có đủ sensor + video + GPS + đã phân tích YOLO trước) → mở `/trips/:id`
2. **Chỉ rõ layout 3 cột không cuộn:**
   - Cột trái: bản đồ Leaflet ghim vị trí GPS + tên địa danh, 3 KPI card (Depth/Temp/Pressure trung bình)
   - Cột giữa: video player nền đen, có playlist thu gọn (bấm nút toggle `🎞` để mở/đóng)
   - Cột phải: gauge Artificial Horizon (SVG mô phỏng pitch/roll) + Compass Rose (yaw), panel cảnh báo anomaly
   - Khu vực dưới: 3 tab biểu đồ Environment / Navigation / System
3. **Bấm Play video** → quan sát:
   - Đường ReferenceLine (kẻ dọc) chạy trên biểu đồ Environment bên dưới, đồng bộ theo đúng thời điểm video
   - Gauge Artificial Horizon/Compass bên phải động theo dữ liệu yaw/pitch/roll thực tế tại thời điểm đó
   - Badge "LIVE SYNC" hiện góc video
4. Thử kéo thanh Brush (range selector) dưới chart để zoom vào 1 khoảng thời gian
5. Chuyển qua tab Navigation và System để chỉ biểu đồ yaw/pitch/roll và voltage/battery/humidity
6. **Lời dẫn xuyên suốt:** "Đây là tính năng em tâm đắc nhất — toàn bộ dữ liệu của một lần lặn được xem đồng thời trong một màn hình duy nhất, không cần chuyển tab hay cuộn trang, và video được đồng bộ chính xác với dữ liệu cảm biến theo thời gian thực."

**Nếu hội đồng hỏi về responsive:** có thể thu nhỏ cửa sổ trình duyệt để chỉ layout chuyển sang xếp chồng trên mobile.

---

## J. Bước 9 — YOLOv8 Detection + Evidence System
**Thời lượng:** ~3 phút

1. Trên cùng trang TripDetailPage, bấm toggle **"Detect"** để hiện bbox nhận diện vật thể đã phân tích sẵn trên video
2. Bấm icon ⚙/Sparkles mở popover **"AI Analysis Settings"**:
   - Chỉ dropdown chọn model (nếu có nhiều hơn 1 model `.pt`)
   - Kéo slider confidence qua lại để hội đồng thấy giá trị đổi real-time
   - Bấm "Run Analysis" trên **1 media CHƯA phân tích** (đã chuẩn bị riêng ở mục A.2) → chỉ trạng thái chuyển `pending` (spinner) → (nếu đợi được) chờ SSE push kết quả
3. Trong lúc video đang phát, bấm nút chụp ảnh **📷 (Photo Evidence)** → chỉ Evidence panel tăng số lượng, mở lại ảnh vừa chụp → thấy bbox "nướng" cố định vào ảnh
4. Bấm nút **🎬 (Start Clip)** → nút chuyển đỏ nhấp nháy → phát vài giây → bấm lại để **Stop** → chỉ Evidence panel có thêm 1 Clip
5. Click vào 1 Evidence (Photo hoặc Clip) → mở EvidenceViewer, chỉ bbox overlay, với Clip thì video tự dừng đúng điểm kết thúc
6. **Lời dẫn:** "YOLOv8 chạy trên microservice Python riêng, xử lý bất đồng bộ qua Bull Queue. Với video, hệ thống dùng ByteTrack để bbox di chuyển mượt theo vật thể qua các khung hình, thay vì đứng yên. Evidence System cho phép operator ghim lại khoảnh khắc quan trọng ngay trong lúc xem, không cần phân tích lại cả video dài."

---

## K. Bước 10 — AI Project Summary (Gemini)
**Thời lượng:** ~1.5 phút (có chờ)

1. Quay lại ProjectDetailPage của Project `completed`
2. Bấm **"Generate Summary"** (nếu chưa có sẵn) hoặc chỉ luôn kết quả đã có sẵn từ trước (khuyến nghị dùng bản có sẵn để tránh chờ lâu)
3. Trong lúc chờ (nếu demo live), nói về cơ chế Bull Queue bất đồng bộ, poll 3 giây
4. Đọc nhanh 1-2 câu tóm tắt song ngữ AI sinh ra, chỉ rõ có nhắc tên địa danh cụ thể (không phải tọa độ số)
5. **Lời dẫn:** "Prompt gửi Gemini dùng tên địa danh thực tế nhờ reverse-geocoding, giúp bản tóm tắt có ý nghĩa hơn nhiều so với chỉ đưa tọa độ GPS thô."

---

## L. Bước 11 — Notification Realtime (SSE)
**Thời lượng:** ~40 giây

1. Mở tab 3 (đã đăng nhập sẵn cùng tài khoản `admin` — hoặc dùng tab 1 vừa demo AI Summary ở trên)
2. Thực hiện 1 hành động sinh thông báo (ví dụ: vừa Generate AI Summary xong, hoặc đổi status 1 Trip)
3. Quan sát bell icon ở tab còn lại tự động hiện badge đỏ **không cần F5**
4. Click chuông → dropdown → click 1 thông báo → điều hướng đúng trang + badge giảm
5. **Lời dẫn:** "Thông báo được đẩy qua SSE — Server-Sent Events, không cần polling hay reload trang."

---

## M. Bước 12 — Audit Log (admin)
**Thời lượng:** ~30 giây

1. Vào `/audit`
2. Chỉ vài dòng log gần nhất — đặc biệt các hành động vừa demo ở trên (đổi role user ở bước C, generate AI summary ở bước K...)
3. **Lời dẫn:** "Mọi hành động quan trọng vừa demo đều được ghi lại ở đây — ai làm, làm gì, khi nào — chỉ admin xem được."

---

## N. Bước 13 — RBAC: chuyển sang tài khoản viewer
**Thời lượng:** ~40 giây

1. Chuyển sang tab 2 (đã đăng nhập sẵn `viewer@rov.local`)
2. Vào đúng Project/Trip vừa demo → chỉ rõ:
   - **Không có** nút Upload media/sensor
   - **Không có** nút Xóa (Project/Trip/Media)
   - **Không có** nút "Generate Summary"
   - Vẫn xem được đầy đủ dữ liệu (chart, video, gallery)
3. Thử vào `/users` hoặc `/audit` bằng URL trực tiếp → bị chặn/redirect
4. **Lời dẫn:** "Viewer chỉ có quyền xem, không thể chỉnh sửa hay xóa bất kỳ dữ liệu nào — RBAC được áp dụng nhất quán cả ở route Backend lẫn giao diện Frontend."

---

## O. Kết thúc demo
**Thời lượng:** ~20 giây

> "Như vậy em đã trình diễn qua các tính năng chính của hệ thống: quản lý dữ liệu ROV/Project/Trip, upload hàng loạt, phân tích sensor và phát hiện bất thường, giao diện cockpit đồng bộ video-cảm biến, nhận diện vật thể AI và hệ thống bằng chứng, tóm tắt tự động bằng Gemini, thông báo thời gian thực, và phân quyền rõ ràng theo vai trò. Em xin dừng phần demo tại đây."

---

## Bảng ưu tiên cắt gọn (nếu buổi phản biện giới hạn thời gian hơn dự kiến)

| Bước | Nội dung | Có thể bỏ? |
|---|---|---|
| B | Dashboard | Giữ (nhanh, ấn tượng đầu tiên) |
| C | User Management | Có thể bỏ nếu gấp |
| D | ROV | Có thể rút ngắn còn 20s |
| E | Project/Trip + cascade | Giữ phần filter/CRUD, bỏ phần cascade delete live |
| F | Upload Folder | **Bỏ trước tiên nếu thiếu thời gian** (rủi ro cao nhất) |
| G | Sensor + Anomaly | Giữ (ngắn, hiệu quả) |
| H | Media Gallery | Có thể bỏ hoặc gộp nhanh vào bước I |
| I | TripDetailPage Cockpit | **Bắt buộc giữ — trọng tâm** |
| J | YOLO + Evidence | **Bắt buộc giữ — trọng tâm** |
| K | AI Summary | Giữ, nhưng dùng kết quả có sẵn thay vì chờ live |
| L | Notification SSE | Có thể bỏ nếu rất gấp |
| M | Audit Log | Có thể bỏ nếu rất gấp |
| N | RBAC viewer | Giữ (ngắn, chứng minh phân quyền rõ ràng) |

**Thứ tự ưu tiên khi cần cắt gấp:** giữ B, E (rút gọn), G, I, J, K, N — bỏ C, D, F, H, L, M — tổng còn khoảng 12-14 phút.

---

## Checklist tập dượt trước ngày phản biện/bảo vệ

- [ ] Chạy thử toàn bộ kịch bản này ít nhất **2 lần** với đúng dữ liệu/tài khoản sẽ dùng thật
- [ ] Bấm giờ thực tế từng bước, ghi lại bước nào bị chậm hơn dự kiến để điều chỉnh
- [ ] Chuẩn bị sẵn 3-5 ảnh chụp màn hình backup cho các bước rủi ro cao (Upload Folder, AI Summary, YOLO analyze) phòng khi mạng/service lỗi lúc demo thật
- [ ] Tắt hết notification/pop-up không liên quan trên máy trước khi demo (email, chat app...) để tránh lộ thông tin cá nhân hoặc gây mất tập trung
- [ ] Kiểm tra độ phân giải màn hình trình chiếu thực tế trước — layout cockpit 3 cột cần màn hình đủ rộng (khuyến nghị test ở đúng độ phân giải máy chiếu nếu biết trước)
