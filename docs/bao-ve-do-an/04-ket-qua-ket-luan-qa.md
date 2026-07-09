# Phần D — Kết quả, Kiểm thử, Kết luận & Chuẩn bị Q&A (Slide 25-30 + Phụ lục Q&A)

---

## Slide 25: Kết quả kiểm thử chức năng (Functional Testing)
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 75 giây

### Nội dung slide (bullet trình chiếu)
- Script tự động: `backend/src/scripts/functional-test.js` — **37/37 test case PASSED (100%)**
- Phân nhóm test case:
  - **Auth** (7 case): login đúng/sai password/email không tồn tại/thiếu field, GET `/me` với token hợp lệ/không có/sai
  - **RBAC** (6 case): viewer không tạo/xóa được nhưng đọc được; không auth → 401
  - **Validation** (5 case): thiếu field required, sai ObjectId format, projectId không tồn tại → 404, sensor readings không phải array, array rỗng
  - **CRUD** (11 case): tạo/đọc/sửa/xóa Project và Trip, cascade delete, verify 404 sau khi xóa
  - **Pagination** (6 case): limit đúng, cấu trúc paginated response, filter theo status, page không tồn tại → data rỗng
- **1 bug phát hiện và fix qua testing**: `POST /projects/:id/trips` với `projectId` không tồn tại từng trả **201** (sai) → đã fix để trả **404** đúng chuẩn REST
- Ý nghĩa: quy trình kiểm thử bài bản — viết script tự động thay vì test tay từng trường hợp

### Kịch bản thuyết trình (lời nói)
> Sau khi hoàn thiện các chức năng, em đã xây dựng một bộ kiểm thử chức năng tự động thay vì test thủ công từng trường hợp, để đảm bảo tính lặp lại và dễ chạy lại mỗi khi có thay đổi code.
>
> Bộ script này nằm tại `functional-test.js`, kiểm tra tổng cộng 37 trường hợp, chia thành 5 nhóm: nhóm Auth với 7 trường hợp — đăng nhập đúng, sai mật khẩu, email không tồn tại, thiếu trường bắt buộc, và lấy thông tin cá nhân với các loại token khác nhau; nhóm RBAC với 6 trường hợp kiểm tra viewer không được tạo hay xóa nhưng vẫn đọc được dữ liệu; nhóm Validation với 5 trường hợp kiểm tra dữ liệu đầu vào sai định dạng; nhóm CRUD với 11 trường hợp cho Project và Trip bao gồm cả cascade delete; và nhóm Pagination với 6 trường hợp.
>
> Kết quả hiện tại là 37 trên 37 trường hợp đều pass, đạt tỉ lệ 100%. Đáng chú ý, trong quá trình viết test này, em đã phát hiện ra một lỗi thực tế: khi gọi API tạo Trip với một `projectId` không tồn tại, hệ thống trả về mã 201 — tức là báo tạo thành công — trong khi đáng lẽ phải trả về 404. Em đã sửa lại bằng cách thêm bước kiểm tra Project có tồn tại hay không trước khi tạo Trip. Đây là một ví dụ cụ thể cho thấy giá trị của việc viết test tự động — nó giúp phát hiện những lỗi mà test thủ công rất dễ bỏ sót.

### Ghi chú (nếu có)
Nên chụp lại màn hình console log khi chạy `node src/scripts/functional-test.js` (hiện dòng "37/37 passed") để chèn vào slide làm bằng chứng trực quan.

---

## Slide 26: Kiểm thử hiệu năng (Load Test + Lighthouse)
**Mức độ ưu tiên:** 🔸 Có thể lược bớt (nếu thời gian hạn chế, có thể gộp nhanh vào slide 25)
**Thời lượng ước tính:** 70 giây

### Nội dung slide (bullet trình chiếu)
- Công cụ: `backend/src/scripts/load-test.js` (20 concurrent × 3 rounds = 60 requests/endpoint)
- Kết quả baseline (Free tier MongoDB Atlas, máy dev):

| Endpoint | Avg | P95 | Đánh giá |
|---|---|---|---|
| `GET /auth/me` | 138 ms | 448 ms | Tốt |
| `GET /media/trip/:id` | 161 ms | 784 ms | Tốt |
| `GET /trips/:id/sensor-data` | 301 ms | 525 ms | Chấp nhận được |
| `GET /stats/overview` | 906 ms | 1842 ms | Chậm nhất — nhiều aggregation MongoDB song song |
| `POST /auth/login` | 41/60 request bị chặn | — | Rate limiter hoạt động đúng thiết kế |

- Mục tiêu Lighthouse (Chrome DevTools):
  - Dashboard: Performance ≥ 70, Accessibility ≥ 80
  - TripDetailPage (trang nặng nhất — cockpit layout): Performance ≥ 60
  - ProjectsPage: Performance ≥ 75

### Kịch bản thuyết trình (lời nói)
> Bên cạnh kiểm thử chức năng, em cũng thực hiện kiểm thử hiệu năng ở mức cơ bản bằng một script load-test tự viết, gửi 20 request đồng thời, lặp lại 3 vòng cho mỗi endpoint.
>
> Kết quả cho thấy các endpoint đọc dữ liệu đơn giản như lấy thông tin cá nhân hay danh sách media phản hồi khá nhanh, trung bình dưới 200ms. Endpoint chậm nhất là thống kê tổng quan cho Dashboard, trung bình gần 1 giây, do phải chạy nhiều phép aggregation MongoDB song song — đây là điểm em nhận thấy có thể tối ưu thêm bằng cache Redis trong tương lai nếu có thời gian. Một điểm tích cực là khi test đăng nhập với tần suất cao, hệ thống rate limiter đã chặn đúng phần lớn request vượt ngưỡng — chứng tỏ cơ chế chống brute-force hoạt động đúng như thiết kế.
>
> Về hiệu năng frontend, em đặt mục tiêu điểm Lighthouse cho các trang chính, trong đó TripDetailPage — trang cockpit hiển thị nhiều biểu đồ, video, gauge cùng lúc — có mục tiêu thấp hơn một chút vì đây là trang nặng nhất về mặt render.

### Ghi chú (nếu có)
**Quan trọng — trung thực về số liệu:** Bảng load-test ở trên là baseline đã có sẵn trong tài liệu dự án (đã từng chạy). Tuy nhiên, **điểm số Lighthouse thực tế cho Dashboard/TripDetailPage/ProjectsPage chưa được điền cụ thể** — cần tự chạy Chrome DevTools → tab Lighthouse → Analyze page load (cả Mobile và Desktop) cho 3 trang này **trước ngày bảo vệ**, chụp ảnh kết quả thật và thay thế phần "mục tiêu" bằng "kết quả đạt được". Tuyệt đối không trình bày số điểm Lighthouse như đã có kết quả nếu chưa thực sự chạy — nếu hội đồng hỏi số cụ thể mà chưa có, nên trả lời trung thực là "em đã thiết lập mục tiêu và sẽ chạy Lighthouse để xác nhận trước khi nộp báo cáo hoàn chỉnh", tránh bịa số.

---

## Slide 27: Demo trực tiếp — Kịch bản demo tổng hợp
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng dự kiến:** 5-7 phút

> Đây là kịch bản thao tác demo trực tiếp trên máy, KHÔNG phải slide nội dung trình chiếu — dùng để điều phối trình tự demo sao cho bao phủ nhiều tính năng nhất trong thời gian ngắn nhất.

### Chuẩn bị trước khi demo
- Đã **seed sẵn dữ liệu mẫu** (`node src/scripts/seed-full.js`) — có ít nhất 1 Project ở trạng thái `completed`, 1 Trip đã có đủ sensor CSV + video + ảnh + GPS
- Đăng nhập sẵn 2 tab trình duyệt: 1 tab tài khoản `operator`/`admin`, 1 tab tài khoản `viewer` (hoặc chuẩn bị sẵn thông tin đăng nhập để gõ nhanh)
- **Tránh demo live upload file thật** — rủi ro lỗi mạng, thời gian chờ xử lý (YOLO, AI) không kiểm soát được trong lúc bảo vệ
- Mở sẵn các tab/trang cần thiết ở chế độ nền để chuyển đổi nhanh, hạn chế thao tác gõ URL trực tiếp trước hội đồng

### Trình tự demo (từng bước)

**Bước 1 — Đăng nhập → Dashboard** *(~40s)*
- Đăng nhập tài khoản `operator` hoặc `admin`
- Chỉ vào các stat card (Total Projects, Running Trips, Active ROVs, Total Users) và biểu đồ (Project Status donut, Trips by Status, ROV Utilization, Activity timeline)
- *Lời dẫn chuyển cảnh:* "Đây là trang tổng quan sau khi đăng nhập, cho thấy bức tranh toàn cảnh hệ thống. Bây giờ em sẽ đi sâu vào một chuyến khảo sát cụ thể."

**Bước 2 — Vào 1 Project có sẵn → xem danh sách Trip** *(~30s)*
- Click vào Project đã chuẩn bị sẵn (status `completed`)
- Lướt qua danh sách Trip, chỉ badge sensor count / media count trên TripCard
- *Lời dẫn chuyển cảnh:* "Mỗi Project gồm nhiều Trip — tức từng lần lặn cụ thể. Em sẽ mở chi tiết một Trip đã có đầy đủ dữ liệu để trình diễn tính năng cốt lõi nhất của hệ thống."

**Bước 3 — Mở TripDetailPage (cockpit layout)** *(~2 phút — phần trọng tâm)*
- Click vào Trip đã chuẩn bị (có sensor + video + ảnh)
- Chỉ layout 3 cột: trái (map + KPI depth/temp/pressure), giữa (video player), phải (gauge Artificial Horizon + Compass + Alerts)
- Bấm play video → quan sát đường ReferenceLine chạy trên biểu đồ bên dưới đồng bộ theo thời gian video, đồng thời gauge bên phải động theo dữ liệu
- *Lời dẫn chuyển cảnh:* "Đây chính là tính năng đồng bộ video và dữ liệu cảm biến theo thời gian thực mà em đã trình bày ở phần kiến trúc."

**Bước 4 — YOLO detect overlay + Evidence capture** *(~1.5 phút)*
- Bật toggle "Detect" để hiện bbox nhận diện vật thể trên video
- Mở popover "AI Analysis Settings" (icon Sparkles/⚙), thử kéo confidence slider để minh họa
- Chụp 1 ảnh Evidence (nút camera) trong lúc video đang phát → chỉ Evidence Panel cập nhật số lượng
- *Lời dẫn chuyển cảnh:* "Bên cạnh nhận diện vật thể, em cũng tích hợp AI tạo tóm tắt nội dung khảo sát — em sẽ demo ngay sau đây."

**Bước 5 — Generate AI Summary trên Project completed** *(~40s, có chờ)*
- Quay lại ProjectDetailPage của Project `completed`, bấm "Generate Summary"
- Trong lúc chờ Gemini xử lý (vài giây), chuyển sang nói về cơ chế Bull Queue async phía sau
- Khi kết quả hiện ra, đọc nhanh 1-2 câu tóm tắt do AI sinh ra
- *Lời dẫn chuyển cảnh:* "Trong lúc AI xử lý bất đồng bộ, hệ thống cũng có cơ chế thông báo thời gian thực — em xin demo luôn phần đó."

**Bước 6 — Notification bell (SSE)** *(~20s)*
- Click chuông thông báo trên Navbar, chỉ 1 thông báo mới xuất hiện (ví dụ thông báo AI summary vừa xong, hoặc trip status change)
- Click vào thông báo → điều hướng đúng trang, badge giảm
- *Lời dẫn chuyển cảnh:* "Cuối cùng, em muốn minh họa cơ chế phân quyền của hệ thống bằng một tài khoản khác."

**Bước 7 — Chuyển tài khoản viewer → minh họa RBAC** *(~30s)*
- Chuyển sang tab đã đăng nhập sẵn tài khoản `viewer`
- Vào cùng Project/Trip vừa demo → chỉ rõ **không có nút Upload, không có nút xóa, không có nút Generate Summary**
- *Câu kết:* "Như vậy em đã trình diễn xong các tính năng cốt lõi: quản lý dữ liệu, đồng bộ video-cảm biến, AI nhận diện vật thể và tóm tắt, thông báo realtime, và phân quyền rõ ràng theo vai trò."

### Ghi chú (nếu có)
- Toàn bộ demo nên được **tập dượt trước ít nhất 2 lần** với đúng dữ liệu sẽ dùng lúc bảo vệ để tránh bất ngờ (ví dụ AI API bị rate limit, YOLO service chưa khởi động).
- Nếu thời gian bị rút ngắn đột xuất, có thể bỏ bước 4 (Evidence) hoặc bước 6 (Notification) — giữ lại bắt buộc bước 1, 2, 3, 5, 7 vì đây là các tính năng trọng tâm nhất của đồ án.
- Nên khởi động sẵn `yolo-service` và kiểm tra `GEMINI_API_KEY` còn quota trước giờ bảo vệ.

---

## Slide 28: Kết quả đạt được
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 90 giây

### Nội dung slide (bullet trình chiếu)
- **Auth & phân quyền:** đăng nhập/đăng ký JWT (access 15 phút + refresh 7 ngày), Google OAuth2, đổi mật khẩu/profile, RBAC 3 vai trò (admin/operator/viewer)
- **Quản lý người dùng (admin):** danh sách, tìm kiếm, lọc, đổi role, khóa/mở tài khoản, thao tác hàng loạt
- **Quản lý ROV / Project / Trip:** CRUD đầy đủ, lọc nâng cao, lịch sử khảo sát, export CSV/PDF
- **Media & AWS S3:** upload qua presigned URL, gallery kéo-thả sắp xếp, xóa hàng loạt
- **Dashboard:** 4 stat card + 3 biểu đồ + activity timeline, 7 aggregation MongoDB song song
- **Thông báo realtime:** Redis blacklist token khi logout, SSE push, bell icon + badge chưa đọc
- **AI Project Summary:** Gemini 2.5 Flash + Bull Queue xử lý bất đồng bộ, polling khi pending
- **Audit Log:** ghi lại toàn bộ hành động quan trọng (tạo/xóa/đổi role/generate AI), chỉ admin xem được
- **Sensor Data + Anomaly Detection:** upload CSV/JSON, Z-Score phát hiện bất thường, biểu đồ + bản đồ Leaflet
- **YOLOv8 Object Detection:** nhận diện vật thể ảnh/video, bbox overlay, chọn model + độ nhạy (confidence)
- **Evidence System:** chụp ảnh/clip bằng chứng ngay trong lúc xem video, phân tích AI riêng từng evidence
- **Video-Sensor Sync:** đồng bộ ReferenceLine trên biểu đồ theo thời gian video thực (2 chế độ: có/không metadata)
- **TripDetailPage cockpit layout:** giao diện 3 cột chuyên dụng, dark/light mode đầy đủ

### Kịch bản thuyết trình (lời nói)
> Qua toàn bộ quá trình thực hiện đồ án, em đã hoàn thành một hệ thống tương đối đầy đủ với nhiều nhóm chức năng.
>
> Về nền tảng, hệ thống có xác thực JWT kết hợp Google OAuth, phân quyền rõ ràng theo ba vai trò admin, operator, viewer, cùng với quản lý người dùng cho admin. Về nghiệp vụ cốt lõi, em đã xây dựng đầy đủ CRUD cho ba đối tượng chính là ROV, Project và Trip, kèm chức năng xuất báo cáo CSV và PDF.
>
> Về xử lý dữ liệu, hệ thống hỗ trợ upload media lên AWS S3 qua presigned URL với gallery kéo-thả, upload dữ liệu cảm biến CSV/JSON với phát hiện bất thường tự động bằng thuật toán Z-Score, hiển thị trực quan qua biểu đồ và bản đồ.
>
> Về trí tuệ nhân tạo — đây là phần em đầu tư nhiều nhất — hệ thống tích hợp YOLOv8 để nhận diện vật thể trong ảnh và video với khả năng chọn model và điều chỉnh độ nhạy, tích hợp Gemini để tự động tóm tắt nội dung khảo sát, cả hai đều chạy bất đồng bộ qua Bull Queue để không làm chậm trải nghiệm người dùng. Em cũng xây dựng thêm hệ thống Evidence cho phép operator chụp ảnh hoặc đánh dấu đoạn clip làm bằng chứng ngay trong lúc xem lại video.
>
> Điểm nhấn kỹ thuật mà em tự hào nhất là tính năng đồng bộ video và dữ liệu cảm biến theo thời gian thực, hiển thị trong giao diện cockpit ba cột chuyên dụng cho trang chi tiết Trip — đây là phần phức tạp nhất về mặt kỹ thuật frontend trong toàn bộ đồ án.
>
> Cuối cùng, hệ thống có thông báo thời gian thực qua SSE và audit log ghi lại toàn bộ hành động quan trọng, phục vụ cho việc vận hành có thể truy vết được.

### Ghi chú (nếu có)
Nếu thời gian ít, có thể nhóm gọn slide này thành 4 cụm lớn khi trình bày miệng: (1) Nền tảng & bảo mật, (2) Quản lý dữ liệu cốt lõi, (3) AI & phân tích thông minh, (4) Trải nghiệm người dùng & vận hành — giúp hội đồng dễ nhớ hơn là liệt kê 13 gạch đầu dòng rời rạc.

---

## Slide 29: Hạn chế & Hướng phát triển
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 80 giây

### Nội dung slide (bullet trình chiếu)
**Hạn chế hiện tại (trung thực):**
- **Email Notification** (gửi email khi trip thất bại / project hoàn tất, qua Nodemailer) chưa triển khai — mới dừng ở thiết kế; các hạng mục còn lại đã hoàn thiện đầy đủ theo checklist

**Hướng phát triển tiếp theo:**
- Fine-tune **custom YOLO model** riêng cho môi trường dưới nước: cá, rác thải, vết nứt công trình ngầm — thay vì dùng YOLOv8n general-purpose
- Cải thiện độ ổn định của **tracking** (ByteTrack) — hạn chế mất dấu/đổi track ID khi vật thể bị che khuất tạm thời hoặc nhiều vật thể cùng loại xuất hiện gần nhau
- Cho **GCS tự động đồng bộ dữ liệu** lên hệ thống khi có kết nối vệ tinh/wifi ngoài khơi — giảm phụ thuộc hoàn toàn vào upload thủ công sau khi về bờ
- Hoàn thiện **Email Notification**
- **Deploy production đầy đủ** lên VPS theo kiến trúc Docker Compose đã thiết kế (nginx + backend + yolo-service + redis)

### Kịch bản thuyết trình (lời nói)
> Bên cạnh những kết quả đã đạt được, em cũng xin trình bày trung thực hạn chế còn lại của đồ án. Hiện tại, hạng mục duy nhất chưa triển khai là tính năng gửi email thông báo tự động khi trip thất bại hay project hoàn tất — mới dừng ở thiết kế qua Nodemailer, chưa code thực tế. Các hạng mục còn lại trong kế hoạch ban đầu đã được hoàn thiện đầy đủ.
>
> Về hướng phát triển tiếp theo, em dự định tập trung vào năm hướng chính. Một là huấn luyện một model YOLO riêng, chuyên biệt cho môi trường dưới nước — nhận diện cá, rác thải, hoặc vết nứt công trình ngầm — thay vì dùng model tổng quát như hiện tại. Hai là cải thiện thuật toán tracking, để bounding box bám vật thể ổn định hơn, hạn chế tình trạng mất dấu hoặc đổi track ID khi vật thể bị che khuất tạm thời — đây là giới hạn tự nhiên của ByteTrack mà em nhận thấy khi thử nghiệm. Ba là cho GCS tự động đồng bộ dữ liệu lên hệ thống khi có kết nối vệ tinh hoặc wifi ngoài khơi, giảm bớt sự phụ thuộc vào việc operator upload thủ công sau khi về bờ. Bốn là hoàn thiện tính năng gửi email thông báo. Và năm là triển khai đầy đủ hệ thống lên môi trường production theo kiến trúc Docker mà em đã thiết kế sẵn, bao gồm nginx, backend, YOLO service và Redis.

### Ghi chú (nếu có)
Slide này thể hiện sự trung thực và tư duy phản biện của sinh viên — hội đồng thường đánh giá cao khi sinh viên tự nhận ra hạn chế thay vì để hội đồng chỉ ra. Nên giữ giọng điệu tự tin, không phòng thủ.

---

## Slide 30: Lời cảm ơn
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 30 giây

### Nội dung slide (bullet trình chiếu)
- Em xin chân thành cảm ơn Thầy/Cô **[GVHD]** đã tận tình hướng dẫn trong suốt quá trình thực hiện đồ án
- Em xin cảm ơn quý Thầy/Cô trong **Hội đồng** đã dành thời gian lắng nghe và góp ý
- Em xin cảm ơn **Viện/Khoa** và Trường Đại học Bách Khoa Hà Nội đã tạo điều kiện học tập, nghiên cứu
- Em xin trân trọng cảm ơn và sẵn sàng lắng nghe câu hỏi từ quý Thầy/Cô

### Kịch bản thuyết trình (lời nói)
> Cuối cùng, em xin gửi lời cảm ơn chân thành đến thầy/cô [GVHD] đã tận tình hướng dẫn, góp ý và định hướng cho em trong suốt quá trình thực hiện đồ án tốt nghiệp này.
>
> Em cũng xin cảm ơn quý thầy cô trong hội đồng đã dành thời gian quý báu để lắng nghe phần trình bày của em hôm nay. Em xin cảm ơn Viện/Khoa và Trường Đại học Bách Khoa Hà Nội đã tạo điều kiện cơ sở vật chất và môi trường học tập trong suốt quá trình em học tập và nghiên cứu tại trường.
>
> Em xin phép kết thúc phần trình bày tại đây. Em rất mong nhận được các câu hỏi, góp ý từ quý thầy cô để hoàn thiện đồ án tốt hơn. Em xin trân trọng cảm ơn.

### Ghi chú (nếu có)
Điền đúng tên GVHD, tên Viện/Khoa trước khi trình chiếu chính thức. Có thể giữ slide này hiện trên màn hình trong suốt phần Q&A phía sau (thay vì tắt slide) để tạo không khí trang trọng.

---
---

# PHỤ LỤC — Chuẩn bị Q&A

Danh sách câu hỏi dự kiến hội đồng có thể đặt ra, kèm gợi ý trả lời ngắn gọn. Chia theo 5 nhóm, tổng cộng **20 câu hỏi**.

---

## Nhóm 1 — Kiến trúc / Công nghệ

**1. Tại sao chọn MongoDB thay vì SQL (PostgreSQL/MySQL)?**
> Dữ liệu của hệ thống có cấu trúc phân cấp lồng nhau khá tự nhiên (Project → Trip → Sensor/Media/Snapshot) và một số document như `aiSummary`, `analysisMeta`, `labels` có schema linh hoạt, thay đổi theo thời gian phát triển tính năng. MongoDB cho phép lưu các mảng nested (ví dụ `labels: [{name, confidence, bbox, frameTime}]`) mà không cần join phức tạp như SQL. Ngoài ra, MongoDB Atlas có free tier phù hợp cho đồ án và Mongoose cung cấp schema validation đủ chặt chẽ để bù lại phần nào tính "schema-less".

**2. Tại sao dùng Bull Queue mà không phải cron job?**
> Bull Queue xử lý các tác vụ theo sự kiện (event-driven) — ví dụ khi user bấm "Generate Summary" hoặc upload xong media — chứ không phải theo lịch cố định như cron. Cron phù hợp cho tác vụ định kỳ (ví dụ dọn dẹp dữ liệu mỗi đêm), còn Bull Queue phù hợp hơn để tách tác vụ chậm (gọi AI mất 5-15s, YOLO xử lý video mất hàng chục giây) ra khỏi luồng HTTP request chính, tránh block người dùng, đồng thời có sẵn cơ chế retry, timeout, và theo dõi trạng thái job.

**3. Vì sao dùng SSE thay vì WebSocket cho thông báo realtime?**
> Luồng thông báo trong hệ thống là một chiều — server đẩy dữ liệu xuống client khi có sự kiện (AI xong, trip status đổi), client không cần gửi dữ liệu liên tục ngược lại. SSE đơn giản hơn WebSocket rất nhiều để triển khai cho use-case một chiều này, dùng được cơ chế reconnect có sẵn của trình duyệt (`EventSource`), và không cần thêm thư viện hay quản lý một giao thức riêng.

**4. Video-sensor sync có dùng WebSocket không, hoạt động thế nào?**
> Không cần WebSocket. Toàn bộ đồng bộ diễn ra ở phía client: video đã tải sẵn (qua presigned URL) và dữ liệu sensor cũng đã tải sẵn (React Query cache). "Đồng bộ" thực chất là một phép tính offset thời gian — mỗi khi trình duyệt bắn sự kiện `timeupdate` của thẻ `<video>`, em tính `chartTimestamp = recordedAt + currentTime` rồi tìm điểm dữ liệu gần nhất để vẽ `ReferenceLine` trên biểu đồ. Không cần server đẩy dữ liệu theo thời gian thực vì dữ liệu đã có sẵn ở client.

**5. Vì sao chọn YOLOv8 mà không phải model nhận diện khác?**
> YOLOv8 là một trong những model nhận diện vật thể real-time phổ biến nhất hiện nay, có phiên bản nano (yolov8n) rất nhẹ (~6MB), tốc độ suy luận nhanh trên CPU (100-500ms/frame) — phù hợp để chạy trên VPS không có GPU. Ngoài ra YOLOv8 dễ fine-tune thành model chuyên biệt sau này (ví dụ nhận diện cá, rác thải dưới nước) nếu có thêm dữ liệu training.

**6. Kiến trúc microservice YOLO viết bằng Python, backend chính bằng Node.js — hai service giao tiếp với nhau thế nào?**
> Backend Node.js gọi HTTP request (REST) đến YOLO service (FastAPI) qua endpoint nội bộ `POST /detect`, truyền vào URL media (presigned) và tham số model/confidence. YOLO service tải file, chạy inference, trả về danh sách nhãn kèm bbox. Việc gọi này được thực hiện trong Bull worker (bất đồng bộ), không phải trong request chính, nên nếu YOLO service chậm hoặc down cũng không ảnh hưởng đến luồng upload media.

---

## Nhóm 2 — Bảo mật

**7. JWT được lưu ở đâu phía client, có an toàn không?**
> Access token và refresh token hiện lưu ở phía client thông qua Zustand store (có thể kèm persist vào localStorage tùy cấu hình). Access token có thời hạn ngắn (15 phút) để giảm thiểu rủi ro nếu bị đánh cắp qua XSS. Về lý thuyết, lưu trong httpOnly cookie sẽ an toàn hơn localStorage trước tấn công XSS, đây là điểm em nhận thấy có thể cải thiện thêm nếu phát triển tiếp lên production thực sự.

**8. Nếu refresh token bị lộ thì sao?**
> Refresh token có thời hạn 7 ngày và được kiểm tra qua Redis blacklist khi logout — tức là sau khi logout, token cũ dù còn hạn cũng không dùng lại được. Nếu nghi ngờ lộ token mà chưa logout, hướng khắc phục thực tế nhất là đổi `JWT_REFRESH_SECRET` để vô hiệu hóa toàn bộ token đang tồn tại, hoặc bổ sung cơ chế lưu refresh token theo device/session trong DB để có thể thu hồi từng token riêng lẻ — đây là hướng mở rộng em ghi nhận.

**9. Vì sao access token 15 phút mà không phải 1 giờ hay 1 ngày?**
> Đây là sự cân bằng giữa bảo mật và trải nghiệm người dùng: 15 phút đủ ngắn để giảm cửa sổ tấn công nếu token bị đánh cắp, nhưng nhờ cơ chế auto-refresh tự động ở axios interceptor (khi gặp lỗi 401, tự gọi `/auth/refresh` rồi retry request), người dùng không cảm nhận được việc phải đăng nhập lại thường xuyên.

**10. Mật khẩu được hash như thế nào, có đủ an toàn không?**
> Dùng `bcryptjs` với cost factor 12, thực hiện tự động trong hook `pre('save')` của Mongoose — tức là không có chỗ nào trong code service/controller phải tự hash thủ công, tránh rủi ro quên hash. Cost factor 12 là mức phổ biến, cân bằng giữa độ an toàn và thời gian xử lý.

**11. RBAC được kiểm tra ở đâu, có thể bị bypass không?**
> RBAC được enforce ở 2 lớp: lớp route middleware `authorize(...roles)` chặn truy cập theo vai trò trước khi vào controller, và lớp service có thêm logic self-protection (ví dụ admin không thể tự hạ quyền hoặc tự khóa chính mình). Middleware `authenticate` luôn truy vấn lại `User.findById` từ DB mỗi request thay vì tin hoàn toàn vào payload trong JWT, nên nếu tài khoản bị khóa (`isActive=false`) thì token cũ (dù còn hạn) sẽ bị từ chối ngay ở request tiếp theo.

---

## Nhóm 3 — Nghiệp vụ

**12. Vì sao GCS không tự động đẩy dữ liệu lên hệ thống, phải upload thủ công?**
> Vì bối cảnh thực tế đặt ra cho đồ án là ROV và GCS hoạt động ngoài thực địa — đáy biển, đáy hồ — nơi hoàn toàn không có kết nối wifi hay mạng di động trong lúc lặn. GCS là trạm điều khiển đặt trên tàu, ghi lại dữ liệu tại chỗ (CSV/JSON/video/ảnh) trong suốt quá trình lặn, nhưng không thể truyền dữ liệu realtime lên server vì không có mạng. Giải pháp phù hợp với bối cảnh này là để GCS lưu offline, sau đó operator upload thủ công dữ liệu từ GCS qua giao diện web ngay khi tàu về đến bờ và có kết nối mạng trở lại.

**13. Upload Folder xử lý file trùng tên hoặc trùng dữ liệu thời gian thế nào?**
> Với sensor/DVL, hệ thống hiện tại (theo thiết kế TASK 6d) áp dụng nguyên tắc "first-in-first-keep": khi upload file mới, hệ thống lấy timestamp lớn nhất đang có trong DB của trip đó, sau đó chỉ giữ lại các dòng dữ liệu có timestamp lớn hơn — tránh trùng lặp dữ liệu ở phần overlap. Nếu file mới hoàn toàn nằm trong khoảng đã có sẵn, toàn bộ file đó sẽ bị bỏ qua và có cảnh báo rõ ràng cho operator. Nếu upload lại đúng file đã có (cùng tên), hệ thống thay thế dữ liệu cũ của đúng file đó chứ không xóa toàn bộ dữ liệu trip.

**14. Trip và Project khác nhau thế nào, vì sao lại tách hai cấp?**
> Project là chuyến khảo sát lớn — container ngoài cùng, có thể gồm nhiều lần lặn (Trip) trong cùng một đợt khảo sát. Trip là một lần lặn/recording session cụ thể — nơi thực sự gắn với dữ liệu sensor, video, ảnh, GPS. Việc tách hai cấp giúp mô hình hóa đúng thực tế vận hành ROV: một chuyến khảo sát ngoài khơi thường kéo dài nhiều ngày với nhiều lần lặn khác nhau, mỗi lần lặn có dữ liệu và vị trí GPS riêng biệt.

**15. AI Summary dùng thông tin gì để tạo tóm tắt, độ tin cậy ra sao?**
> Gemini nhận một prompt được xây dựng từ dữ liệu có cấu trúc: tên Project, địa điểm (ưu tiên `locationName` từ reverse-geocoding nếu có GPS), thời gian, danh sách các Trip kèm trạng thái, và số lượng media. Vì đây là tổng hợp thông tin có sẵn trong DB (không phải suy luận từ nội dung video/ảnh), độ chính xác về mặt dữ kiện khá cao, nhưng văn phong tóm tắt vẫn mang tính chất gợi ý, operator nên xem lại trước khi dùng cho báo cáo chính thức.

---

## Nhóm 4 — Điểm yếu tự phát hiện (chủ động thừa nhận)

**16. Trong code, có phát hiện chỗ nào tài liệu kế hoạch (CLAUDE.md) không khớp với code thực tế không?**
> Có, và em xin chủ động chia sẻ vì đây là quá trình em tự rà soát lại. Ví dụ: (1) tài liệu kế hoạch từng ghi "cascade delete chưa làm — bug lớn", nhưng thực tế em đã fix xong — khi xóa Trip hoặc Project, toàn bộ SensorData/DVLData/SonarFile/Media/Snapshot liên quan (bao gồm cả object trên S3) đều được xóa theo; (2) tài liệu có đề cập tên file manifest `trip_master.json` nhưng code hiện kiểm tra tên `trip.json` — cần đối chiếu lại với file thực tế xuất ra từ thiết bị ROV để thống nhất; (3) một số route thừa (dead code) như `dvl.routes.js` và `sonar.routes.js` được viết nhưng không đăng ký trong `app.js` — route thực tế đang chạy qua `trip.routes.js` dùng chung controller, đây là tàn dư từ giai đoạn thiết kế module độc lập trước khi gộp route theo `tripId`.

**17. Có component/code nào bị trùng lặp hoặc chết (dead code) trong frontend không?**
> Có một số, và em nhận ra khi rà soát lại. Component `SensorChart.jsx` và `LocationPanel.jsx` là các component "thế hệ đầu" của TASK 6, sau đó từ TASK 6a trở đi logic đã được inline trực tiếp vào `TripDetailPage.jsx` để tối ưu cho layout cockpit đặc thù, nhưng 2 file cũ chưa bị xóa hẳn. Ngoài ra trong `TripDetailPage.jsx` có một khối JSX cũ (evidence viewer phiên bản trước) bị vô hiệu hóa bằng điều kiện `{false && ...}` thay vì xóa hẳn — an toàn hơn nếu cần rollback nhanh nhưng để lại code chết cần dọn dẹp sau. Đây là hệ quả tự nhiên của việc phát triển qua nhiều task nối tiếp (6 → 6a → ... → 6e) mà không phải lúc nào cũng refactor lại ngay.

**18. Có endpoint nào không tuân theo convention response chuẩn của dự án không?**
> Có một trường hợp: hàm `generateAISummary` trong `project.controller.js` trả về bằng `res.status(202).json(...)` trực tiếp thay vì dùng hàm `success()` chuẩn mà toàn bộ dự án quy ước sử dụng. Đây là điểm không nhất quán em ghi nhận cần sửa lại cho đồng bộ, tuy không ảnh hưởng đến chức năng vì client vẫn đọc đúng cấu trúc dữ liệu trả về.

**19. Cơ chế auto-refresh token ở frontend có xử lý được trường hợp nhiều request cùng lúc bị 401 không?**
> Đây là một điểm em nhận thấy có thể cải thiện: hiện tại axios interceptor gọi `/auth/refresh` khi gặp lỗi 401, nhưng chưa có cơ chế "dedupe" — nếu nhiều request cùng lúc đều nhận 401 (ví dụ khi mở nhiều tab hoặc trang gọi nhiều API song song), có khả năng nhiều lệnh gọi `/auth/refresh` được kích hoạt gần như đồng thời. Hướng khắc phục chuẩn là dùng một biến cờ hoặc Promise dùng chung (singleton refresh promise) để đảm bảo chỉ một lệnh gọi refresh thực sự được gửi đi, các request khác đợi kết quả của lệnh đó.

---

## Nhóm 5 — Mở rộng

**20. Nếu có hàng trăm/hàng nghìn ROV hoạt động cùng lúc thì hệ thống có scale được không?**
> Với kiến trúc hiện tại (1 VPS chạy Node backend + Redis + YOLO service), hệ thống phù hợp cho quy mô đồ án hoặc một đội ROV nhỏ/vừa. Để scale lên quy mô lớn hơn, một số hướng cần bổ sung: (1) tách backend thành nhiều instance đứng sau load balancer, dùng Redis cho session/SSE connection thay vì lưu in-memory Map như hiện tại (vì SSE connection hiện lưu theo instance, cần Redis Pub/Sub để broadcast đúng instance đang giữ kết nối của user); (2) YOLO service cần scale ngang với GPU thực sự thay vì CPU nano-model để xử lý khối lượng video lớn; (3) MongoDB cần chuyển từ free tier lên cluster có sharding nếu dữ liệu sensor tăng đột biến; (4) hàng đợi Bull Queue cần theo dõi (monitoring) kỹ hơn để tránh nghẽn khi nhiều job AI/YOLO được enqueue cùng lúc.

**Câu hỏi phụ — Có thể thay Gemini bằng model AI khác không?**
> Hoàn toàn có thể, vì toàn bộ logic gọi AI được tách riêng trong `ai.service.js` — chỉ cần thay đổi phần gọi API (đổi từ Gemini SDK sang OpenAI SDK hoặc Anthropic SDK) mà không ảnh hưởng đến luồng Bull Queue hay cách lưu kết quả vào `project.aiSummary`. Lý do chọn Gemini 2.5 Flash ban đầu là vì có free tier miễn phí trên Google AI Studio, phù hợp với ngân sách đồ án sinh viên.

---
