# Kịch bản thuyết trình — CHỈ PHẦN CỦA THÀNH (Module quản lý thông tin nhiệm vụ) — 2026-07-12

**Bối cảnh quan trọng — đọc trước:** đây không còn là 1 bài bảo vệ độc lập, mà là **1 phần trong slide chung của cả 4 người** (Cường: Subsea+GCS, Đăng: Camera+cảm biến, Chiến: tự động ổn định vị trí, **Thành: quản lý thông tin nhiệm vụ — phần này**). Vì vậy:
- **Bỏ hẳn** phần "Mở đầu" (trang bìa) — cả team đã có 1 trang bìa chung ở đầu deck.
- **Bỏ hẳn** phần "ROV & GCS là gì" — Cường đã giải thích kỹ ở phần phần cứng (slide 4-11), nhắc lại sẽ trùng.
- **Bỏ hẳn** slide "Mục tiêu đề tài" riêng — team đã có mục tiêu tổng ở "Giới thiệu tổng quan"; Use Case diagram ngay sau đó đã tự thể hiện phạm vi.
- **Bỏ hẳn** "Lời cảm ơn" riêng — cả team đã có 1 slide "THANK YOU!" chung ở cuối.
- **Đổi thứ tự:** Use Case đặt **trước** Luồng nghiệp vụ, khớp mẫu "Yêu cầu → Thiết kế" mà Cường/Đăng đã dùng.
- **Cập nhật lần này:** chuyển "Cấu trúc thư mục & Xử lý timestamp" xuống **sau** "Chức năng nền tảng" — vì đây thực chất là mô tả chi tiết của chức năng **Upload Folder**, nên gộp cùng nhóm chức năng thay vì đứng ở phần thiết kế đầu bài.

---

## Khối 1: Vấn đề thực trạng
**Thời lượng:** 35 giây

### Nội dung slide
🖼️ **Hình cần dùng:** 3 card màu (vàng/xanh/hồng) — card 3 cần sửa lại nội dung, xem bên dưới.

*(3 ý dưới đây bám sát nguyên văn "Mục tiêu" thầy hướng dẫn ghi — viết khái quát, không đi vào chi tiết kỹ thuật)*

- **01 — Vận hành tại hiện trường**: ROV thường vận hành ở hiện trường (sông, biển, trên tàu) — nơi không có kết nối mạng ổn định.
- **02 — Phân tích sau khi kết thúc**: dữ liệu hình ảnh ghi được chỉ có thể xem lại, phân tích sau khi nhiệm vụ đã kết thúc.
- **03 — Cần quản lý tập trung trên web**: cần có cơ chế quản lý thông tin nhiệm vụ trên nền web để truy cập, tra cứu thuận tiện hơn.

### Kịch bản thuyết trình
> Tiếp theo em xin trình bày phần của mình: module quản lý thông tin nhiệm vụ trên nền web. ROV thường vận hành ở hiện trường như sông, biển, trên tàu — nơi không có kết nối mạng ổn định. Vì vậy, dữ liệu hình ảnh ghi được trong quá trình vận hành chỉ có thể xem lại và phân tích sau khi nhiệm vụ đã kết thúc. Từ đó đặt ra yêu cầu: cần có một cơ chế quản lý thông tin nhiệm vụ trên nền web, giúp truy cập và tra cứu dữ liệu thuận tiện hơn — đó chính là phần em phụ trách.

---

## Khối 2: Sơ đồ Use Case tổng quát (= Yêu cầu)
**Thời lượng:** 75 giây

### Nội dung slide
- Chèn ảnh: `my_thesis/Hinhve/uc_tongquat.png`
- **Chi tiết nhóm chức năng theo vai trò** (kế thừa từ dưới lên):
  - **Viewer:** đăng nhập, xem Dashboard, xem danh sách/chi tiết ROV — Project — Trip, xem lại media/biểu đồ/báo cáo AI (chỉ đọc)
  - **Operator:** kế thừa Viewer + tạo/sửa Project — Trip — ROV, Upload Folder dữ liệu thực địa, chạy phân tích YOLO + Gemini, quản lý Evidence
  - **Admin:** kế thừa Operator + quản lý User (phân quyền, khoá tài khoản), xem Audit Log, xoá resource

### Kịch bản thuyết trình
> Về yêu cầu, sơ đồ Use Case này thể hiện ba vai trò theo quan hệ kế thừa: Viewer đăng nhập và giám sát, xem thống kê; Operator kế thừa toàn bộ quyền Viewer, cộng thêm quản lý chuyến khảo sát, dữ liệu thực địa, và chạy phân tích AI; Admin kế thừa toàn bộ quyền Operator, cộng thêm quản trị hệ thống — người dùng và audit log. Bên phải là hai hệ thống AI bên ngoài mà backend gọi tới khi Operator chạy phân tích: YOLO Service để nhận diện vật thể, và Gemini để tóm tắt báo cáo.
>
> Cụ thể hơn về chức năng từng vai trò: Viewer chỉ có quyền xem — Dashboard, danh sách và chi tiết ROV, Project, Trip, cùng media và báo cáo đã có sẵn. Operator kế thừa toàn bộ quyền đó, cộng thêm quyền tạo và sửa Project, Trip, ROV, upload dữ liệu thực địa qua tính năng Upload Folder, chạy phân tích AI, và quản lý Evidence. Admin kế thừa toàn bộ quyền Operator, cộng thêm quản lý người dùng — phân quyền, khoá tài khoản — và xem nhật ký thao tác toàn hệ thống qua Audit Log.

---

## Khối 3: Sơ đồ Luồng nghiệp vụ tổng quan (= bắt đầu Thiết kế)
**Thời lượng:** 40 giây

### Nội dung slide
- Chèn ảnh: `my_thesis/Hinhve/flow_tongquan.png`

### Kịch bản thuyết trình
> Về thiết kế, đây là sơ đồ luồng nghiệp vụ tổng quan. ROV lặn, dữ liệu được GCS ghi lại ngay tại hiện trường — vùng ngoài khơi không có mạng. Khi tàu về bờ, có kết nối trở lại, operator upload dữ liệu lên; backend xử lý: lưu trữ có tổ chức, tính Z-Score phát hiện bất thường, chạy YOLO nhận diện vật thể, và Gemini tóm tắt báo cáo. Cuối cùng, kết quả hiển thị trên Web App cho người dùng xem lại.

---

## Khối 4: Kiến trúc hệ thống & Công nghệ
**Thời lượng:** 95 giây

### Nội dung slide
- Chèn ảnh: "Kiến trúc tổng quan hệ thống web" (Trình duyệt Web / Backend / Dịch vụ đám mây)
- **Thiết kế Backend:** mỗi module (auth, projects, trips, media, sensor...) tách 4 lớp — routes (định nghĩa endpoint) → controller (xử lý request/response) → service (business logic) → model (schema Mongoose)
- **Thiết kế Frontend:** tổ chức theo feature-folder (mỗi tính năng 1 thư mục riêng); tách 2 loại state — React Query quản lý dữ liệu từ server (tự cache, tự làm mới), Zustand quản lý state cục bộ (đăng nhập, giao diện); axios tự gắn token + tự làm mới khi hết hạn

### Kịch bản thuyết trình
> Về kiến trúc: Frontend React giao tiếp Backend Express qua REST và SSE. Backend kết nối MongoDB Atlas cho dữ liệu có cấu trúc, AWS S3 cho video/ảnh qua presigned URL, Redis kết hợp Bull Queue cho tác vụ bất đồng bộ, và gọi ra 2 dịch vụ AI: YOLOv8 microservice Python và Gemini 2.5 Flash.
>
> Hai quyết định thiết kế đáng chú ý: chọn Server-Sent Events thay vì WebSocket vì chỉ cần đẩy dữ liệu một chiều; và tách YOLOv8 thành microservice Python riêng vì phân tích ảnh/video có thể mất vài chục giây — xử lý đồng bộ sẽ block request HTTP.
>
> Về thiết kế chi tiết hơn: backend tổ chức theo từng module nghiệp vụ, mỗi module tách 4 lớp rõ ràng — routes định nghĩa endpoint, controller xử lý request, service chứa toàn bộ logic nghiệp vụ, model định nghĩa schema dữ liệu — giúp code dễ bảo trì, dễ kiểm thử riêng từng lớp. Frontend tổ chức theo feature — mỗi tính năng gói gọn trong 1 thư mục riêng, dễ mở rộng khi thêm tính năng mới. Về quản lý trạng thái, em tách biệt 2 loại: React Query lo phần dữ liệu lấy từ server, tự động cache và làm mới; Zustand lo phần trạng thái cục bộ như đăng nhập hay giao diện. Axios được cấu hình tự động gắn token vào mỗi request và tự làm mới khi access token hết hạn, người dùng không bị gián đoạn khi đang thao tác.

---

## Khối 5: Nghiệp vụ & Mô hình dữ liệu (ERD)
**Thời lượng:** 45 giây

### Nội dung slide
- Chèn ảnh ERD (`projects`, `rovs`, `trips`, `sensordatas`, `media`, `snapshots`, `users`)
- **Cơ sở dữ liệu:** MongoDB Atlas (NoSQL, dạng document) — quản lý qua Mongoose ODM ở backend, 7 collection chính
- **Vì sao chọn NoSQL:** dữ liệu cảm biến từng loại thiết bị có cấu trúc khác nhau (DVL, sonar, sensor mỗi loại field riêng) — schema linh hoạt phù hợp hơn SQL cứng nhắc

### Kịch bản thuyết trình
> Về cơ sở dữ liệu, hệ thống dùng MongoDB Atlas — dạng NoSQL lưu theo document, quản lý qua Mongoose ODM ở backend. Sơ đồ ERD thể hiện rõ cấu trúc phân cấp: Project là chuyến khảo sát lớn, gắn với một ROV, chứa nhiều Trip; mỗi Trip lại chứa dữ liệu sensor, media và evidence riêng — đúng theo quan hệ đã thấy ở sơ đồ luồng nghiệp vụ. Em chọn NoSQL thay vì SQL truyền thống vì dữ liệu thực địa từ nhiều loại thiết bị — cảm biến, DVL, sonar — mỗi loại có cấu trúc field khác nhau, và schema linh hoạt của MongoDB phù hợp hơn so với phải định nghĩa cứng nhiều bảng SQL riêng biệt.

---

## Khối 6: Các chức năng nền tảng
**Thời lượng:** 60 giây

### Nội dung slide
🖼️ **Hình cần dùng:** ảnh **Dashboard** ("KPI cards và biểu đồ thống kê tổng quan" — đã có sẵn trong deck).

- **Auth:** JWT (access 15p/refresh 7 ngày) + Google OAuth2, Redis blacklist khi logout
- **ROV/Project/Trip:** CRUD đầy đủ, filter nâng cao, cascade delete
- **Upload Folder:** operator chọn thẳng thư mục dữ liệu từ GCS, hệ thống tự phân loại + xử lý timestamp *(chi tiết ở slide sau)*
- **Media & lưu trữ S3:** video/ảnh không đi qua backend — trình duyệt tải trực tiếp lên S3 bằng đường link tạm thời do backend cấp; cơ sở dữ liệu chỉ lưu đường dẫn file
  <br>*(ghi chú riêng, không cần chiếu: backend tạo presigned URL bằng cách ký cục bộ — offline, dùng secret key AWS, không gọi mạng tới S3 — trả về cho frontend; frontend PUT file thẳng lên S3; xong thì gọi API confirm để backend lưu `s3Key` + `s3Bucket` vào MongoDB. Xem lại file: bucket S3 đặt private, backend tạo 1 presigned URL GET mới mỗi lần được yêu cầu, có hạn dùng — không lộ link vĩnh viễn)*
- **Dashboard:** stat cards + 3 biểu đồ + activity timeline

### Kịch bản thuyết trình
> Về các chức năng nền tảng: hệ thống có xác thực JWT kết hợp Google OAuth, CRUD đầy đủ cho ROV/Project/Trip với cascade delete. Dashboard quý thầy cô thấy đây tổng hợp số liệu qua nhiều phép tổng hợp MongoDB chạy song song.
>
> Về việc lưu trữ file — đặc biệt là video, thường dung lượng lớn — em thiết kế để video không đi qua backend, tránh tốn băng thông và bộ nhớ server. Khi operator chọn file, frontend gọi backend xin một đường link tải lên tạm thời, có hạn dùng vài phút; backend tạo đường link này bằng cách ký cục bộ với khóa bí mật AWS, không cần gọi mạng tới S3. Sau đó trình duyệt tải file trực tiếp lên S3 bằng đường link đó, bỏ qua hoàn toàn backend. Tải xong, frontend gọi lại backend xác nhận — lúc này cơ sở dữ liệu chỉ lưu đường dẫn của file trên S3, không lưu file thật. Khi cần xem lại, vì bucket S3 đặt ở chế độ riêng tư, backend sẽ tạo một đường link xem tạm thời khác mỗi lần được yêu cầu.
>
> Riêng tính năng Upload Folder — nơi operator chọn thẳng cả thư mục dữ liệu để upload — em xin trình bày kỹ hơn ở slide tiếp theo, vì đây là chức năng có xử lý kỹ thuật đáng chú ý nhất trong nhóm này.

### Ghi chú
Trả lời câu hỏi "slide này có nên chèn hình không": **có, nhưng chỉ 1 ảnh duy nhất** — Dashboard, vì đây là chức năng dễ "nhìn là hiểu" nhất. Auth/CRUD/Media S3 không cần ảnh riêng — nói bằng lời là đủ. Không nhét cả 5 ảnh vào 1 slide 35 giây — sẽ rối.

---

## Khối 7: Chức năng Upload Folder — Cấu trúc thư mục & Cách xử lý timestamp
**Thời lượng:** 65 giây

### Nội dung slide
🖼️ **Hình cần dùng:** ảnh cây thư mục (`trip_20260623_112136/` với `trip.json`, `Camera/`, `Sensors/`, `DVL/`, `Sonar/`) — đã có sẵn.

- Operator chỉ cần **chọn thẳng cả thư mục** khi upload — không cần sắp xếp tay
- **Cách xử lý timestamp — 2 nguồn, có ưu tiên:**
  ```
  Ưu tiên 1: file trip.json (nếu có) → chính xác đến MILI-GIÂY
  Ưu tiên 2: tên file "_YYYYMMDD_HHMMSS" → chính xác đến GIÂY
             (quy ước giờ Việt Nam, UTC+7)
  ```
  Áp dụng thống nhất cho cả sensor, DVL, sonar, video, ảnh
- Upload nhiều lần cho cùng 1 Trip → **mỗi file giữ riêng, không ghi đè**, xem được danh sách file đã upload

### Kịch bản thuyết trình
> Đi sâu hơn vào tính năng Upload Folder vừa nhắc tới: đây là cấu trúc thư mục thật mà GCS xuất ra sau mỗi lần lặn — chia theo Camera, Sensors, DVL, Sonar. Operator chỉ cần chọn thẳng cả thư mục này, hệ thống tự động đọc và phân loại.
>
> Về cách xác định thời gian cho từng file — phần quan trọng vì ảnh hưởng trực tiếp đến tính năng đồng bộ video-cảm biến sẽ trình bày ngay sau đây — hệ thống dùng 2 nguồn theo thứ tự ưu tiên. Nếu GCS xuất kèm file manifest `trip.json`, hệ thống đọc từ đó vì có độ chính xác đến từng mili-giây. Nếu không có manifest, hệ thống parse trực tiếp từ tên file theo định dạng ngày-giờ nhúng sẵn, quy ước theo giờ Việt Nam UTC cộng bảy — chính xác đến giây. Cơ chế 2 lớp này áp dụng thống nhất cho mọi loại dữ liệu, đảm bảo luôn có timestamp dùng được kể cả khi thiết bị không xuất được manifest.
>
> Một chi tiết nhỏ: nếu operator upload nhiều lần cho cùng một Trip, hệ thống không ghi đè mất dữ liệu cũ — mỗi file được giữ riêng và liệt kê trong danh sách, có thể xoá từng file nếu cần.

### Ghi chú — Q&A dự phòng (không cần nói chủ động, chỉ dùng nếu bị hỏi)
**Hỏi: "Nếu 2 file sensor bị trùng khoảng thời gian ghi thì xử lý sao?"**
> Trả lời: Áp dụng nguyên tắc "first-in-first-keep" — khi upload file mới, hệ thống lấy mốc thời gian lớn nhất đang có trong dữ liệu của trip đó, rồi chỉ giữ lại các dòng của file mới có thời gian lớn hơn mốc đó, cắt bỏ phần trùng. Nếu toàn bộ file mới nằm gọn trong khoảng đã có sẵn, cả file bị bỏ qua và hệ thống báo rõ cho operator. Nếu upload lại đúng file cũ (trùng tên), hệ thống thay thế đúng dữ liệu của file đó, không ảnh hưởng các file khác.

**Hỏi: "DVL và Sonar có xử lý trùng giống Sensor không?"**
> Trả lời: Không — có chủ đích khác nhau. Sensor là chuỗi số liệu liên tục nên cắt trùng theo thời gian là hợp lý. DVL là dữ liệu quỹ đạo vị trí — mỗi điểm là 1 lần đo riêng biệt, dù trùng thời gian tuyệt đối vẫn giữ nguyên, chỉ ghép nhiều file theo đúng thứ tự thời gian thực (dựa vào manifest hoặc tên file) chứ không cắt bớt. Sonar chỉ xử lý theo tên file: trùng tên thì thay thế, khác tên thì coi là file độc lập, không có khái niệm "cắt trùng thời gian".

**Hỏi: "Khi có nhiều file cho 1 Trip thì hiển thị trên biểu đồ thế nào, có bị nối nhầm không?"**
> Trả lời: Trên biểu đồ sensor, hệ thống chèn 1 điểm trống tại đúng ranh giới đổi file, khiến đường biểu đồ bị đứt đoạn thay vì nối liền — dù 2 file có thể liền kề về thời gian, người xem vẫn biết rõ đây là 2 lần ghi khác nhau (ví dụ thiết bị bị ngắt giữa chừng).

**Hỏi: "Việc ghép nhiều file DVL theo đúng thời gian — tính 1 lần rồi lưu, hay tính lại mỗi lần xem?"** *(câu hay bị hỏi bẫy — 3 loại dữ liệu KHÔNG giống nhau)*
> Trả lời: Tuỳ loại. **Sensor và Sonar** resolve thời gian tuyệt đối **một lần duy nhất lúc upload** rồi lưu thẳng vào document (`timestamp`/`recordedAt`) — xem lại chỉ đọc field có sẵn, không tính lại. **Riêng DVL thì ngược lại**: lúc upload chỉ lưu `ts` tương đối theo đồng hồ nội bộ thiết bị (có thể reset mỗi lần khởi động lại) kèm `sourceFile`, hoàn toàn chưa có thời gian tuyệt đối. Việc ghép nhiều file theo đúng thứ tự thời gian thực chỉ diễn ra **mỗi khi operator mở trang xem quỹ đạo** — hệ thống tính lại từ đầu, không lưu cache. Lý do: đây là phép tính nhẹ (vài nghìn điểm, sắp xếp nhanh), không đáng lưu kết quả, và giữ dữ liệu thô linh hoạt hơn nếu sau này cải tiến thuật toán ghép mà không cần chạy migration lại toàn bộ dữ liệu cũ.

**Hỏi: "Tính lại mỗi lần xem như vậy có ảnh hưởng hiệu suất không? Sao không ghép 1 lần rồi lưu để đọc nhanh hơn?"**
> Trả lời: Ảnh hưởng không đáng kể, vì 2 lý do. Một, dữ liệu DVL của 1 Trip thường chỉ vài nghìn đến vài chục nghìn điểm — sắp xếp từng đó điểm trong JavaScript chỉ mất vài mili-giây. Hai, kết quả cuối cùng luôn bị giới hạn còn tối đa 2000 điểm để vẽ biểu đồ (`downsample`) — vì đã phải duyệt qua toàn bộ mảng để downsample dù sao đi nữa, việc tính thêm thời gian tuyệt đối trước khi sắp xếp gần như không tốn thêm chi phí đáng kể.
>
> Về việc tại sao không cache lại kết quả đã ghép: em cân nhắc 3 điều. Thứ nhất, nếu lưu sẵn bản đã ghép thì mỗi lần upload thêm file, xoá file, hay sửa thuật toán, đều phải nhớ tính lại và ghi đè cache — dễ phát sinh lỗi dữ liệu hiển thị sai mà không nhận ra, trong khi tính lại mỗi lần đọc luôn đảm bảo đúng theo dữ liệu thô mới nhất. Thứ hai, trang xem quỹ đạo không phải API gọi liên tục — chỉ gọi khi operator chủ động mở trang, tần suất thấp nên không cần tối ưu bằng cache. Thứ ba, nếu sau này cải tiến thuật toán ghép, cách tính-mỗi-lần-đọc áp dụng ngay cho mọi trip cũ lẫn mới mà không cần chạy migration lại dữ liệu đã lưu — nếu đã cache sẵn thì phải migrate lại toàn bộ, rủi ro hơn. Đây là một trường hợp cụ thể để dùng cache Redis nếu sau này dữ liệu lớn hơn nhiều hoặc tần suất truy cập cao hơn, nhưng ở quy mô đồ án hiện tại chưa cần thiết.

---

## Khối 8: Điểm nhấn — Cockpit, Anomaly Detection (Z-Score) & Video-Sensor Sync
**Thời lượng:** 155 giây

### Nội dung slide
🖼️ **Hình cần dùng (2 ảnh, đã có sẵn):**
1. Ảnh toàn cảnh **Cockpit TripDetailPage** (3 cột: map/KPI trái, video giữa, gauge/alerts phải)
2. Ảnh **zoom biểu đồ Environment** có đường ReferenceLine đỏ đứt nét + điểm tròn đỏ đánh dấu anomaly

- Trang `/trips/:id` — layout **"cockpit" 3 cột** không cuộn: trái (map+KPI), giữa (video), phải (gauge + cảnh báo)
- **Anomaly Detection — Z-Score, tính như nào:**
  ```
  mean = trung bình cộng của toàn bộ chuyến lặn
  std  = độ lệch chuẩn của toàn bộ chuyến lặn
  z    = |giá trị đo được − mean| / std
  → BẤT THƯỜNG nếu |z| > 2.5
  ```
- **Z-Score, dùng như nào (sau khi tính xong):** hệ thống ghi lại vị trí, chỉ số, giá trị và thời gian của từng điểm bất thường → frontend dùng đúng vị trí đó để tô đỏ chính xác điểm tương ứng trên biểu đồ
  <br>*(ghi chú riêng, không cần chiếu: backend trả về mảng `anomalies[] = { index, metric, value, zScore, timestamp }`, frontend dùng field `index` để khớp đúng điểm trong dữ liệu chart và vẽ custom dot màu đỏ)*
- Trên biểu đồ còn có **1 vạch đỏ đứt nét di chuyển theo thời gian thực** (khác với chấm đỏ tĩnh của anomaly) — đây chính là đường tham chiếu đồng bộ theo video, giải thích ngay sau
- **Video-Sensor Sync**: video phát đến đâu → tự động tính đúng thời điểm thực tương ứng → tìm điểm cảm biến gần nhất → vẽ 1 đường kẻ dọc chạy theo trên biểu đồ
  <br>*(ghi chú riêng, không cần chiếu: công thức thật là `syncTs = recordedAt + currentTime × 1000`, đường kẻ dọc đó tên kỹ thuật là "ReferenceLine" — 1 component có sẵn của thư viện Recharts để vẽ đường đánh dấu tại 1 giá trị bất kỳ trên biểu đồ)*
- *(chèn video demo ngắn tại đây)*

### Kịch bản thuyết trình
> Điểm nhấn công nghệ đầu tiên là trang chi tiết Trip, thiết kế theo triết lý "cockpit" — buồng lái — chia ba cột: bản đồ và KPI cảm biến bên trái, video ở giữa, đồng hồ mô phỏng góc nghiêng và cảnh báo bất thường bên phải, tất cả vừa đúng một màn hình không cần cuộn.
>
> Ngay tại đây, hệ thống tự động phát hiện bất thường trong dữ liệu cảm biến bằng thuật toán Z-Score. Cách tính: với mỗi chỉ số như nhiệt độ hay độ sâu, em tính giá trị trung bình và độ lệch chuẩn của cả chuyến lặn, rồi với từng điểm đo, tính xem nó lệch bao nhiêu lần độ lệch chuẩn so với trung bình — nếu lệch quá hai phẩy năm lần, điểm đó được đánh dấu bất thường.
>
> Còn kết quả này được dùng thế nào? Backend trả về một danh sách các điểm bất thường, mỗi điểm kèm theo vị trí, chỉ số, giá trị, điểm z, và thời gian. Frontend dùng đúng vị trí đó để vẽ một chấm đỏ tại điểm dữ liệu tương ứng trên biểu đồ — như quý thầy cô thấy ở đây. Nhờ vậy hệ thống tự động cảnh báo được sự cố như tụt điện áp hay nhiệt độ tăng vọt.
>
> Quý thầy cô cũng để ý trên biểu đồ còn có một vạch đỏ đứt nét khác, không phải chấm tròn tĩnh mà là 1 đường thẳng đứng di chuyển liên tục theo thời gian thực — đây không phải cảnh báo bất thường, mà là đường tham chiếu đồng bộ với video, em xin giải thích ngay sau đây.
>
> Bài toán khó thứ hai em giải quyết là đồng bộ video với dữ liệu cảm biến — hai nguồn hoàn toàn độc lập. Em dùng thời điểm bắt đầu quay cộng với thời gian phát hiện tại của video để tính ra mốc thời gian tuyệt đối — chính nhờ cơ chế xác định timestamp 2 lớp vừa trình bày — từ đó tìm điểm dữ liệu cảm biến gần nhất và vẽ một đường tham chiếu di chuyển đồng bộ trên biểu đồ khi video đang phát.

---

## Khối 9: Điểm nhấn — Tích hợp AI (YOLOv8, Evidence, Gemini Summary)
**Thời lượng:** 200 giây

### Nội dung slide
🖼️ **Hình cần dùng (3 ảnh, đã có sẵn, dùng đúng thứ tự khi nói):**
1. Ảnh video có khung vàng "Fish 81%" + popover "AI Analysis Settings" (model/confidence) — dùng khi nói về YOLOv8
2. Ảnh **Evidence System** (panel Video/Photo/Photo bên phải video) — dùng khi nói về Evidence
3. Ảnh **AI Project Summary** (đoạn text Gemini sinh ra trong ProjectDetailPage) — dùng khi nói về Gemini

- **YOLOv8 Object Detection — cách hoạt động:** với mỗi khung ảnh hoặc khung hình video đưa vào, mô hình YOLOv8 đã huấn luyện sẵn trả về danh sách vật thể nhận diện được — gồm tên loại, vị trí trên khung hình, độ tin cậy, thời điểm xuất hiện, và 1 mã để theo dõi cùng 1 vật thể xuyên suốt nhiều khung hình
  <br>*(ghi chú riêng, không cần chiếu: chạy trên microservice Python riêng, xử lý bất đồng bộ qua Bull Queue; đầu ra thật `{ tên lớp, bbox (0-1), % tin cậy, frameTime, trackId }`; video dùng `track` + ByteTrack để gán trackId ổn định)*
- **Khung detect hiển thị trên video như nào (đây là phần frontend, không phải YOLO):** frontend theo dõi thời gian video đang phát, tìm đúng kết quả nhận diện gần thời điểm đó nhất, rồi vẽ khung ngay tại đúng vị trí — tự động co giãn theo kích thước video hiển thị, khung tự cập nhật bám theo vật thể khi video tiếp tục phát
  <br>*(ghi chú riêng, không cần chiếu: YOLO chỉ trả toạ độ, Backend chỉ lưu — không bên nào vẽ gì cả. Frontend nghe sự kiện `timeupdate` (~4 lần/giây), tìm label có `frameTime` gần nhất trong ngưỡng 0.7s (quá xa thì ẩn khung), vẽ bằng 1 lớp SVG đè lên video — toạ độ bbox chuẩn hoá 0-1 nhân với kích thước video thật để luôn đúng vị trí dù video hiển thị to nhỏ khác nhau)*
- Popover chọn model + điều chỉnh **confidence** (quan trọng vì ảnh dưới nước mờ/tối)
- **Evidence System**: chụp Photo hoặc ghi Clip ngay trong lúc xem video → phân tích AI riêng, không cần re-analyze cả video dài
- **AI Project Summary**: Project completed → Gemini 2.5 Flash tóm tắt song ngữ Việt/Anh, dùng `locationName` thay vì tọa độ số
- *(chèn video demo ngắn: bật Detect toggle + chụp evidence)*

### Kịch bản thuyết trình
> Điểm nhấn công nghệ thứ hai là tích hợp AI xuyên suốt hệ thống, bắt đầu với nhận diện vật thể bằng YOLOv8. Để dễ hình dung cách hoạt động: đầu vào là một khung ảnh hoặc một khung hình video, đi qua mô hình YOLOv8 đã được huấn luyện sẵn, và trả về đầu ra là danh sách vật thể phát hiện được, mỗi vật thể gồm tên lớp, khung tọa độ bao quanh, phần trăm độ tin cậy, thời điểm xuất hiện trong video, và mã theo dõi. Toàn bộ việc này chạy trên một microservice Python riêng, bất đồng bộ qua Bull Queue để không làm chậm trải nghiệm người dùng.
>
> Một điểm hay bị hỏi là: vậy khung vàng hiển thị trên video ai vẽ? Câu trả lời là YOLO không vẽ gì cả, chỉ trả về toạ độ; backend cũng chỉ lưu nguyên vào cơ sở dữ liệu. Việc vẽ thực sự diễn ra ở frontend: mỗi khi video phát, hệ thống liên tục kiểm tra thời điểm hiện tại, tìm khung hình đã phân tích gần nhất, rồi vẽ đúng khung đó đè lên video bằng một lớp đồ hoạ vector. Đây chính là lý do khung nhận diện di chuyển mượt theo vật thể, như quý thầy cô thấy ở đây với cá được nhận diện tám mươi mốt phần trăm.
>
> Với video, em dùng thêm ByteTrack để gán một mã theo dõi ổn định cho từng vật thể xuyên suốt nhiều khung hình. Operator cũng tự điều chỉnh được ngưỡng độ tin cậy qua popover này, vì hình ảnh dưới nước thường mờ và thiếu sáng.
>
> Thứ hai là hệ thống Evidence — cho phép operator, ngay trong lúc xem lại video, chụp nhanh một khung hình hoặc đánh dấu một đoạn clip quan trọng làm bằng chứng, như quý thầy cô thấy ở panel bên phải, phân tích AI riêng cho đúng đoạn đó mà không cần chạy lại toàn bộ video dài.
>
> Thứ ba là tính năng tự động sinh tóm tắt chuyến khảo sát bằng Gemini 2.5 Flash, sử dụng tên địa danh thực tế thay vì tọa độ số để bản tóm tắt dễ đọc hơn, trả về đồng thời cả bản tiếng Việt và tiếng Anh như đoạn văn bản quý thầy cô thấy đây.

---

## Khối 10: Điểm nhấn — Control xem dữ liệu (phần 1: control chung toàn hệ thống)
**Thời lượng:** 50 giây

### Nội dung slide
🖼️ **Hình cần dùng:** ảnh ProjectsPage/TripsPage đang mở panel filter, hoặc MediaGallery đang kéo-thả *(cần chụp thêm nếu chưa có sẵn trong deck)*.

- **Danh sách & lọc dữ liệu:** filter nâng cao theo trạng thái, ROV, khoảng thời gian, từ khoá — nút "Clear filters" xoá nhanh
- **Xuất dữ liệu:** Export CSV + PDF cho mọi danh sách (Project, Trip, ROV, User)
- **Thao tác hàng loạt:** chọn nhiều dòng, xử lý cùng lúc (kích hoạt/khoá nhiều user, xoá nhiều media)
- **Thư viện Media:** kéo-thả sắp xếp thứ tự ảnh/video, phóng to xem toàn màn hình (lightbox)

### Kịch bản thuyết trình
> Về các control giúp người dùng xem và thao tác với dữ liệu, đầu tiên là nhóm control chung áp dụng cho mọi danh sách trong hệ thống. Mỗi trang danh sách — Project, Trip, ROV, User — đều có bộ lọc nâng cao theo trạng thái, thiết bị, khoảng thời gian, và có thể xuất ra file CSV hoặc PDF để lưu trữ, báo cáo. Với các thao tác quản trị, em hỗ trợ chọn nhiều dòng cùng lúc để xử lý hàng loạt, ví dụ khoá nhiều tài khoản người dùng một lúc. Thư viện ảnh/video hỗ trợ kéo-thả sắp xếp lại thứ tự hiển thị, và phóng to xem toàn màn hình khi cần xem chi tiết.

---

## Khối 11: Điểm nhấn — Control xem dữ liệu (phần 2: control chuyên biệt dữ liệu thực địa)
**Thời lượng:** 55 giây

### Nội dung slide
🖼️ **Hình cần dùng:** ảnh SonarViewer đang phát + ảnh TrajectoryViewer (bản đồ quỹ đạo DVL) *(cần chụp thêm nếu chưa có sẵn trong deck)*.

- **Biểu đồ cảm biến (Recharts):** bật/tắt từng đường đo qua chú thích (Legend), kéo thanh trượt để phóng to/thu nhỏ theo thời gian, xuất ảnh biểu đồ
- **Bản đồ GPS (Leaflet):** ghim vị trí lặn, tên địa danh tự động (reverse geocoding)
- **Quỹ đạo di chuyển ROV** (từ dữ liệu DVL): vẽ lại đường đi thực tế dưới nước trên bản đồ
- **Xem dữ liệu Sonar:** phát lại dạng waterfall đồng bộ theo thời gian thực, chỉnh khoảng hiển thị và bảng màu

### Kịch bản thuyết trình
> Ngoài các control chung, hệ thống còn có nhóm control chuyên biệt để xem từng loại dữ liệu thực địa. Biểu đồ cảm biến — quý thầy cô đã thấy ở phần Cockpit — cho phép bật tắt từng đường đo, kéo thanh trượt để phóng to thu nhỏ theo thời gian, và xuất ra ảnh khi cần. Bản đồ GPS ghim đúng vị trí lặn, kèm tên địa danh tự động nhờ tra cứu ngược toạ độ. Với dữ liệu DVL, hệ thống vẽ lại quỹ đạo di chuyển thực tế của ROV dưới nước trên bản đồ. Và với dữ liệu Sonar, em xây dựng bộ phát lại riêng, hiển thị dạng waterfall đồng bộ theo đúng thời gian thực — người dùng chỉnh được khoảng hiển thị và đổi bảng màu để quan sát rõ hơn.

---

## Khối 12: Thử nghiệm — Đánh giá mô hình AI phát hiện cá trên video thực tế
**Thời lượng:** 60 giây

### Nội dung slide
🖼️ **Hình cần dùng:** ảnh so sánh video mẫu (rõ nét) và video thực tế ROV (mờ/đục), hoặc ảnh kết quả detect trên video thực tế *(cần chụp thêm nếu chưa có sẵn trong deck)*.

- **Bối cảnh:** video mẫu công khai trên mạng (dùng để train/test AI) đều rõ nét, ánh sáng tốt — trong khi video thực tế quay tại hiện trường thường mờ, nước đục, ánh sáng yếu, rung lắc nhiều
- **Mục tiêu thử nghiệm:** đánh giá xem các model YOLO phát hiện cá đã có sẵn có áp dụng tốt trên video thực tế hay không — **đây là thử nghiệm đánh giá tính khả thi, chưa phải tính năng đã hoàn thiện**
- **Kết quả:** chưa hứa hẹn nhiều — độ chính xác nhận diện giảm rõ rệt so với video mẫu, nhiều trường hợp bỏ sót do điều kiện hình ảnh kém

### Kịch bản thuyết trình
> Bên cạnh các tính năng chính, em có làm một thử nghiệm nhỏ: thử áp dụng các mô hình YOLO đã huấn luyện sẵn cho việc phát hiện cá lên video quay thực tế tại hiện trường. Lý do em làm thử nghiệm này: hầu hết video mẫu công khai dùng để huấn luyện và kiểm thử các mô hình AI đều rất đẹp, rõ nét, ánh sáng tốt. Nhưng video thực tế ROV quay tại hiện trường thường mờ hơn nhiều — nước đục, ánh sáng yếu, camera rung lắc. Em muốn kiểm chứng xem các mô hình có còn hoạt động tốt trong điều kiện thực tế hay không.
>
> Kết quả thử nghiệm cho thấy chưa hứa hẹn nhiều — độ chính xác giảm rõ rệt so với khi chạy trên video mẫu, nhiều vật thể bị bỏ sót do ảnh hưởng của điều kiện hình ảnh kém. Em xin nhấn mạnh đây là một thử nghiệm đánh giá tính khả thi, không phải một tính năng đã hoàn thiện — và đây cũng chính là động lực cho hướng phát triển tiếp theo mà em sẽ trình bày ngay sau đây: cần huấn luyện lại mô hình với dữ liệu thực tế của chính hiện trường ROV.

---

## Khối 13: Kết quả, Hạn chế & Hướng phát triển (phần của riêng Thành)
**Thời lượng:** 35 giây

### Nội dung slide
- **Kết quả:** hoàn thành đầy đủ các module trên; kiểm thử tự động **37/37 test case pass**
- **Hạn chế:** Email Notification chưa triển khai, mới dừng ở thiết kế
- **Hướng phát triển:** fine-tune YOLO riêng cho môi trường dưới nước + cải thiện tracking, GCS tự động đồng bộ khi có kết nối ngoài khơi

### Kịch bản thuyết trình
> Về kết quả module quản lý thông tin nhiệm vụ: em đã hoàn thành đầy đủ các chức năng đã trình bày, kiểm thử tự động đạt 37 trên 37 trường hợp. Hạn chế còn lại là tính năng gửi email thông báo tự động chưa triển khai, mới dừng ở thiết kế. Hướng phát triển tiếp theo, em dự định huấn luyện model YOLO chuyên biệt cho môi trường dưới nước, cải thiện độ ổn định tracking, và nghiên cứu cho GCS tự động đồng bộ khi có kết nối ngoài khơi. Em xin phép chuyển lại phần trình bày kết quả chung cho cả nhóm.

### Ghi chú
Không cần "lời cảm ơn" riêng — chuyển thẳng sang slide "Kết quả thực nghiệm và đánh giá" chung của team, và slide "THANK YOU!" chung ở cuối deck.

---

## Khối 14: Video Demo (thuyết minh theo video, không phải slide)

**Vị trí:** sau khi trình bày xong toàn bộ slide (hết Khối 13), mở video demo đã quay sẵn — video chạy đến cảnh nào thì nói câu tương ứng cảnh đó. Không cần đọc nguyên văn, chỉ cần bám đúng ý và đúng thứ tự.

| # | Video đang chạy | Câu nói khi tới cảnh đó |
|---|---|---|
| 1 | Dashboard | Đây là Dashboard — tổng quan số Project, Trip, ROV đang hoạt động. |
| 2 | ROVsPage | Trang quản lý ROV — danh sách thiết bị và trạng thái hoạt động. |
| 3 | RovDetailPage | Vào chi tiết 1 ROV — thông tin thiết bị và lịch sử các Project đã dùng ROV này. |
| 4 | ProjectsPage | Trang danh sách Project — từng chuyến khảo sát lớn. |
| 5 | ProjectDetailPage | Vào chi tiết 1 Project, bên dưới là danh sách Trip — từng lượt lặn cụ thể. |
| 6 | Mở Upload Folder | Sau khi ROV về bờ, operator chọn Upload Folder — chọn trực tiếp thư mục dữ liệu ROV xuất ra, không cần sắp xếp lại tay. |
| 7 | Folder đã load, chưa import | Hệ thống tự động phân loại từng file theo tên — cảm biến, DVL, sonar, video, cả file manifest trip.json nếu có — hiển thị trước để operator xác nhận. |
| 8 | Import xong, show kết quả | Import xong, hệ thống báo kết quả — số file mỗi loại nhận được, cảnh báo nếu có file trùng dữ liệu hoặc lỗi định dạng. |
| 9 | AI Summary, ấn Regenerate | Em bấm tạo lại báo cáo tóm tắt AI — job này chạy ngầm qua Bull Queue, không chặn các thao tác khác, em sẽ quay lại xem sau. |
| 10 | TripDetailPage | Đây là màn hình trọng tâm của module — thiết kế dạng cockpit 3 cột: bản đồ và số liệu bên trái, video ở giữa, gauge điều hướng bên phải, biểu đồ cảm biến bên dưới. |
| 11 | Bật Detect | Bật Detect — khung nhận diện vật thể do YOLOv8 phát hiện, đồng bộ đúng theo thời điểm đang phát trong video. |
| 12 | Evidence — chụp ảnh + quay clip | Khi phát hiện vật thể quan trọng, operator chụp nhanh 1 ảnh hoặc đánh dấu 1 đoạn clip làm bằng chứng, lưu riêng vào mục Evidence. |
| 13 | Ấn Analyze clip Evidence | Bấm phân tích AI cho đoạn clip vừa đánh dấu — job cũng chạy ngầm, em tiếp tục các thao tác khác trong lúc chờ. |
| 14 | Click thông báo AI Summary xong | Báo cáo AI vừa xong, hệ thống đẩy thông báo realtime qua SSE — bấm vào để xem ngay kết quả. |
| 15 | UsersPage | Trang quản lý người dùng, chỉ admin truy cập được — phân quyền theo 3 vai trò Viewer/Operator/Admin. |
| 16 | Disable user | Admin vô hiệu hoá 1 tài khoản. |
| 17 | Audit Log | Chuyển sang trang Audit Log — thao tác vô hiệu hoá user vừa rồi đã được ghi lại ở đây. |
| 18 | Click thông báo Evidence analyze xong | Thông báo phân tích Evidence cũng vừa xong — bấm vào xem kết quả. |
| 19 | Xem kết quả Detect trên Evidence | Khung nhận diện vật thể trên đoạn clip Evidence hiển thị đúng theo từng khung hình đã đánh dấu — giúp operator xác nhận nhanh bằng chứng thu thập được. |

**Lưu ý:** thời lượng phần này phụ thuộc độ dài video đã quay, không tính cứng vào bảng tổng thời lượng slide bên dưới — nên canh tốc độ nói theo tốc độ video, ưu tiên nói xong trước khi cảnh tiếp theo xuất hiện.

---

## Kiểm tra lại tổng thời lượng (chỉ phần của Thành)

| Khối | Nội dung | Số hình cần | Giây |
|---|---|---|---|
| 1 | Vấn đề thực trạng | 1 | 35 |
| 2 | Sơ đồ Use Case (= Yêu cầu) + chi tiết chức năng theo vai trò | 1 | 75 |
| 3 | Sơ đồ Luồng nghiệp vụ (= Thiết kế) | 1 | 40 |
| 4 | Kiến trúc & Công nghệ + thiết kế Backend/Frontend | 1 | 95 |
| 5 | ERD + mô tả CSDL (MongoDB, vì sao NoSQL) | 1 | 45 |
| 6 | Chức năng nền tảng + luồng lưu trữ S3 (presigned URL) | 1 (Dashboard) | 60 |
| 7 | **Upload Folder — Cấu trúc thư mục + xử lý timestamp** (+ Q&A dự phòng: trùng timestamp, hiển thị multi-file) | 1 | 65 |
| 8 | Cockpit + Z-Score (tính + dùng như nào) + Sync | 2 | 155 |
| 9 | Tích hợp AI — YOLO (+ cơ chế vẽ bbox) + Evidence + Gemini | 3 | 200 |
| 10 | Control xem dữ liệu — phần 1: control chung (filter/export/bulk/gallery) | 1 | 50 |
| 11 | Control xem dữ liệu — phần 2: chuyên biệt (chart/map/DVL/sonar) | 2 | 55 |
| 12 | Thử nghiệm — đánh giá AI phát hiện cá trên video thực tế | 1 | 60 |
| 13 | Kết quả/Hạn chế/Hướng phát triển | 0 | 35 |
| **Tổng** | | **16 hình** | **≈ 970 giây ≈ 16 phút 10 giây** |

**Vì sao dài hơn 10 phút:** giải thích rõ 3 cơ chế kỹ thuật (xử lý timestamp, Z-Score tính+dùng, bbox detect hiển thị như nào) — đây đúng là những câu hội đồng hay hỏi xoáy, đầu tư thêm thời gian là xứng đáng. Bổ sung thêm mô tả CSDL, luồng lưu trữ S3 (presigned URL), chi tiết use case theo vai trò, thiết kế Backend/Frontend, 2 slide control xem dữ liệu, và 1 slide thử nghiệm AI phát hiện cá — theo đúng yêu cầu bổ sung của giảng viên hướng dẫn/phản biện.

**Thứ tự mới hợp lý hơn ở điểm gì:** "Chức năng nền tảng" (Khối 6) giờ liệt kê đủ 5 chức năng bao gồm Upload Folder, rồi Khối 7 mới đi sâu chi tiết cơ chế của riêng Upload Folder — đúng mạch "liệt kê chức năng → zoom vào 1 chức năng đáng chú ý nhất" thay vì tách rời khỏi nhóm chức năng như bản trước. Khối 10-11 (control xem dữ liệu) đặt sau 2 khối điểm nhấn (Cockpit, AI) vì đã dùng phần lớn ví dụ trực quan ở đó — giờ tổng hợp lại các control chưa nhắc tới. Khối 12 (thử nghiệm AI cá) đặt ngay trước Kết quả vì kết quả "chưa hứa hẹn" của nó chính là tiền đề cho phần Hướng phát triển.

**⚠️ 16 phút là khá dài cho 1 phần trong slide chung — cần bàn lại với nhóm về tổng thời gian được phân bổ.** Nếu bắt buộc phải cắt về ngắn hơn, cắt theo thứ tự, **không đụng vào 5 phần kỹ thuật cốt lõi** (timestamp/Z-Score/bbox + CSDL + luồng S3, vì đây là các phần bị phản biện nhận xét thiếu ban đầu):
1. Khối 12 (Thử nghiệm AI cá): rút gọn còn 1 câu bối cảnh + 1 câu kết quả → **−30s**
2. Khối 10-11 (Control xem dữ liệu): gộp lại còn 1 slide duy nhất, mỗi ý 1 dòng → **−50s**
3. Khối 2 (Use Case chi tiết vai trò): đọc lướt, không liệt kê hết từng gạch đầu dòng → **−20s**
4. Khối 4 (thiết kế Backend/Frontend): rút còn 2 câu tổng hợp → **−30s**
5. Khối 9, đoạn Evidence + đoạn Gemini: mỗi đoạn rút còn 1 câu → **−30s**

Tổng cắt được ~160s, đưa về gần 13-14 phút mà vẫn giữ đủ nội dung phản biện yêu cầu.
