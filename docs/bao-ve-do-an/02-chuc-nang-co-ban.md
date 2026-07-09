# Phần B — Chức năng cơ bản / Nghiệp vụ nền tảng (Slide 9-16)

---

## Slide 9: Authentication & Authorization
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2 phút

### Nội dung slide (bullet trình chiếu)
- JWT 2 lớp: Access token 15 phút + Refresh token 7 ngày
- Đăng nhập Google OAuth2 (Passport.js) — account linking theo email
- Đổi mật khẩu, cập nhật hồ sơ cá nhân
- Logout bảo mật: access token cũ bị chặn ngay qua Redis blacklist
- Rate limiting: 20 request / 15 phút cho `/auth/login`, `/auth/register`
- RBAC 3 vai trò: `viewer` / `operator` / `admin` qua middleware `authorize(roles)`

### Kịch bản thuyết trình (lời nói)
> Em xin trình bày module nền tảng đầu tiên: Authentication và Authorization. Hệ thống sử dụng JWT với hai loại token: access token có thời hạn ngắn 15 phút, và refresh token có thời hạn dài 7 ngày. Access token ngắn hạn giúp giảm rủi ro nếu bị đánh cắp, trong khi refresh token cho phép người dùng không phải đăng nhập lại liên tục — cơ chế này được tự động hoá ở phía frontend thông qua axios interceptor, khi access token hết hạn sẽ tự gọi API refresh và thực hiện lại request cũ.
>
> Bên cạnh đăng nhập bằng email/mật khẩu, hệ thống hỗ trợ đăng nhập nhanh qua Google OAuth2 sử dụng Passport.js, với cơ chế account linking — nếu email đã tồn tại thì gắn thêm Google ID vào tài khoản cũ thay vì tạo trùng lặp.
>
> Về bảo mật đăng xuất, khi người dùng logout, access token hiện tại sẽ được đưa vào danh sách đen trên Redis, nên nếu dùng lại token cũ sẽ bị từ chối ngay lập tức dù token chưa hết hạn tự nhiên. Cuối cùng, phân quyền RBAC được thực hiện qua middleware `authorize`, kiểm tra vai trò người dùng trước khi cho phép truy cập từng endpoint, với ba vai trò: viewer chỉ đọc, operator được tạo/sửa dữ liệu, và admin có toàn quyền.

### Ghi chú (nếu có)
Demo: đăng nhập bằng tài khoản thường → logout → dùng lại access token cũ (Postman/DevTools) → nhận lỗi 401 "Token has been revoked". Chuẩn bị sẵn 3 tài khoản test (admin/operator/viewer) để minh hoạ phân quyền nhanh.

---

## Slide 10: Quản lý ROV
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 1.5 phút

### Nội dung slide (bullet trình chiếu)
- CRUD thiết bị ROV: tên, model, serial number (unique), trạng thái (active/maintenance/retired), thông số kỹ thuật tự do
- Trang chi tiết ROV: 4 KPI card (Total Projects, Completed, Active Now, Total Hours vận hành)
- Lịch sử toàn bộ Project đã sử dụng ROV này
- Ràng buộc nghiệp vụ: không cho xóa ROV đang được Project tham chiếu
- Export danh sách ra CSV/PDF

### Kịch bản thuyết trình (lời nói)
> Tiếp theo là module Quản lý ROV — quản lý thông tin các thiết bị lặn vật lý trong hệ thống. Mỗi ROV có các trường thông tin cơ bản gồm tên, model, số serial (là trường duy nhất để tránh trùng thiết bị), trạng thái vận hành gồm đang hoạt động, đang bảo trì, hoặc đã ngừng sử dụng, và một trường thông số kỹ thuật dạng tự do để linh hoạt lưu các thông số khác nhau tuỳ loại ROV.
>
> Trang chi tiết ROV hiển thị bốn thẻ chỉ số gồm tổng số Project đã tham gia, số Project đã hoàn thành, số Project đang hoạt động, và tổng số giờ vận hành được tính bằng cách cộng dồn khoảng thời gian giữa thời điểm bắt đầu và kết thúc của các Project. Phía dưới là bảng lịch sử toàn bộ Project đã từng sử dụng ROV đó.
>
> Về mặt nghiệp vụ, em có thiết kế một ràng buộc quan trọng: hệ thống sẽ không cho phép xoá một ROV nếu nó đang được tham chiếu bởi bất kỳ Project nào, nhằm bảo toàn dữ liệu lịch sử sử dụng thiết bị. Cuối cùng, danh sách ROV có thể xuất ra file CSV hoặc PDF để phục vụ báo cáo.

### Ghi chú (nếu có)
Demo: mở RovDetailPage của 1 ROV có nhiều project, chỉ ra 4 KPI card và bảng lịch sử. Có thể demo thử xóa ROV đang được dùng để thấy thông báo chặn.

---

## Slide 11: Quản lý Project & Trip
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2 phút

### Nội dung slide (bullet trình chiếu)
- **Project** = chuyến khảo sát lớn (gắn 1 ROV, nhiều Trip bên trong)
- **Trip** = một lần lặn cụ thể (nơi gắn sensor/DVL/sonar/media/snapshot)
- CRUD đầy đủ cả 2 cấp, filter nâng cao: status, ROV, khoảng ngày, từ khoá
- Cascade delete: xóa Project → xóa toàn bộ Trip con → xóa toàn bộ sensor/DVL/sonar/media/snapshot + object trên S3
- GPS + tên địa danh (reverse geocoding) lưu riêng ở từng Trip

### Kịch bản thuyết trình (lời nói)
> Em xin trình bày module lõi thứ hai: Quản lý Project và Trip. Đây là hai khái niệm quan trọng cần phân biệt rõ: Project là một chuyến khảo sát lớn — đơn vị quản lý cấp cao, gắn với một ROV cụ thể, có thể kéo dài nhiều ngày và chứa nhiều Trip bên trong. Trong khi đó, Trip là một lần lặn cụ thể — nơi thực sự gắn với dữ liệu thô như sensor, DVL, sonar, video và ảnh. Sở dĩ tách GPS ra ở cấp Trip chứ không phải Project, vì trong cùng một chuyến khảo sát, mỗi lần lặn có thể diễn ra ở vị trí khác nhau.
>
> Cả hai cấp đều hỗ trợ đầy đủ CRUD, cùng với bộ lọc nâng cao theo trạng thái, theo ROV, theo khoảng thời gian, và tìm kiếm theo tên hoặc địa điểm.
>
> Điểm em muốn nhấn mạnh là cơ chế cascade delete: khi xoá một Project, hệ thống sẽ tự động xoá toàn bộ Trip con bên trong, và với mỗi Trip đó lại tiếp tục xoá sạch toàn bộ dữ liệu liên quan — sensor data, dữ liệu DVL, file sonar, media, và cả các evidence snapshot — bao gồm cả việc xoá vật lý các file tương ứng trên AWS S3. Điều này đảm bảo không để lại dữ liệu rác mồ côi trong hệ thống khi người dùng xoá một chuyến khảo sát.

### Ghi chú (nếu có)
Demo: tạo 1 Project test có vài Trip + upload thử sensor/media, sau đó xóa Project và kiểm tra trên MongoDB Atlas / S3 console để chứng minh cascade xóa sạch.

---

## Slide 12: Upload Folder — Upload hàng loạt dữ liệu ROV
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2.5 phút

### Nội dung slide (bullet trình chiếu)
- Vấn đề thực tế: mỗi lần lặn, GCS sinh ra hàng chục file trong 1 thư mục (sensor log, DVL, sonar, video, ảnh) — upload tay từng file rất bất tiện
- Giải pháp: operator bấm **"Select folder"** (hoặc kéo-thả cả thư mục vào trình duyệt) → chọn thẳng nguyên thư mục dữ liệu từ GCS, không cần nén — hệ thống tự đọc toàn bộ file bên trong và xử lý
- Tự động phân loại theo tên file: `log_*.csv`→sensor, `DVL_*.json`→dvl, `*.sonar`→sonar, video/ảnh→bỏ qua (dùng luồng Media riêng)
- Tự parse timestamp từ tên file (`_YYYYMMDD_HHMMSS`, giờ Việt Nam UTC+7)
- Tự đọc manifest `trip.json`/`trip_master.json` (nếu GCS xuất ra) để gợi ý `recordedAt` chính xác cho video
- Tự reverse-geocode GPS (dòng đầu CSV) thành tên địa danh qua OpenStreetMap Nominatim
- Xử lý tuần tự từng file (không song song) để logic gộp/overlap không bị race condition
- *(Vẫn hỗ trợ nhận thêm 1 file `.zip` nếu operator quen thao tác nén sẵn, nhưng cách dùng chính là chọn thẳng thư mục)*

### Kịch bản thuyết trình (lời nói)
> Tiếp theo là điểm nhấn nghiệp vụ thực tế của đồ án: tính năng Upload Folder — upload hàng loạt dữ liệu ROV. Trong thực tế vận hành, sau mỗi lần lặn, GCS sinh ra một thư mục chứa hàng chục file khác nhau: file log cảm biến dạng CSV, file dữ liệu DVL dạng JSON, file sonar dạng nhị phân, video, và ảnh chụp. Nếu operator phải upload tay từng file một thì rất mất thời gian và dễ sai sót, đặc biệt khi thao tác ngoài thực địa.
>
> Để giải quyết vấn đề này, em cho phép operator bấm một nút để chọn thẳng cả thư mục dữ liệu — trình duyệt sẽ đọc toàn bộ file bên trong thư mục đó và gửi lên cùng lúc, không cần phải tự nén thành file ZIP trước. Backend nhận toàn bộ danh sách file, phân loại từng file dựa theo quy ước đặt tên: file bắt đầu bằng `log_` là dữ liệu sensor, `DVL_` là dữ liệu quỹ đạo, đuôi `.sonar` là dữ liệu quét sonar; riêng video và ảnh sẽ được bỏ qua ở bước này vì đã có luồng upload media riêng qua presigned URL.
>
> Hệ thống cũng tự động trích xuất mốc thời gian từ tên file theo định dạng ngày giờ nhúng sẵn, với lưu ý quan trọng là thời gian này được ghi theo giờ Việt Nam UTC cộng 7, không phải giờ UTC chuẩn. Nếu GCS có xuất thêm file manifest tổng hợp, hệ thống sẽ đọc file này để gợi ý chính xác thời điểm quay video đến từng mili giây. Cuối cùng, nếu file CSV có toạ độ GPS ở dòng đầu tiên, hệ thống sẽ tự động gọi dịch vụ reverse geocoding miễn phí của OpenStreetMap để chuyển toạ độ số thành tên địa danh dễ đọc.

### Ghi chú (nếu có)
Demo: chuẩn bị sẵn 1 thư mục mẫu chứa vài file sensor CSV + DVL JSON + sonar, bấm "Select folder" (hoặc kéo-thả cả thư mục), cho hội đồng xem kết quả phân loại tự động (results.sensor/dvl/sonar/unknown).

---

## Slide 13: Sensor Data & Anomaly Detection
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2.5 phút

### Nội dung slide (bullet trình chiếu)
- Upload CSV sensor: depth, temp, pressure (bắt buộc) + yaw/pitch/roll, voltage, battery_percent, humidity (optional)
- Format mẫu:
  ```
  timestamp,depth,temp,pressure[,lat,lng,yaw,pitch,roll,voltage,battery_percent,humidity]
  2026-05-07T08:00:00Z,10.5,24.3,1.23,16.0544,108.2022,183.2,-1.2,0.8,16.80,100,28.1
  ```
- Thống kê min/max/avg cho từng chỉ số
- **Anomaly Detection bằng Z-Score**: `z = |x - mean| / std`, đánh dấu bất thường khi `|z| > 2.5`
- Ý nghĩa: cảnh báo sớm sự cố (tụt áp đột ngột, nhiệt độ tăng vọt...)

### Kịch bản thuyết trình (lời nói)
> Em xin trình bày module Sensor Data — nơi lưu trữ và phân tích dữ liệu cảm biến từ ROV. Sau khi ROV về bờ, operator upload file CSV chứa các chỉ số đo được trong suốt quá trình lặn. Ba trường bắt buộc là thời gian, độ sâu và nhiệt độ; ngoài ra file có thể chứa thêm áp suất, góc yaw-pitch-roll, điện áp, phần trăm pin, và độ ẩm — đây đều là các trường tùy chọn.
>
> Sau khi upload, hệ thống tự động tính toán giá trị nhỏ nhất, lớn nhất và trung bình cho từng chỉ số, phục vụ hiển thị biểu đồ.
>
> Điểm em muốn nhấn mạnh nhất trong module này là thuật toán phát hiện bất thường bằng Z-Score. Với mỗi chỉ số, hệ thống tính độ lệch chuẩn của toàn bộ tập dữ liệu, sau đó với mỗi điểm dữ liệu, tính giá trị z bằng trị tuyệt đối của hiệu giữa giá trị đó và giá trị trung bình, chia cho độ lệch chuẩn. Nếu trị tuyệt đối của z lớn hơn ngưỡng 2.5, điểm đó được đánh dấu là bất thường. Về mặt nghiệp vụ, đây chính là cách hệ thống tự động phát hiện sớm các sự cố thiết bị, ví dụ điện áp tụt đột ngột do lỗi nguồn, hoặc nhiệt độ tăng vọt bất thường — những dấu hiệu mà nếu chỉ nhìn biểu đồ thông thường rất khó nhận ra ngay, nhưng thuật toán thống kê có thể phát hiện tự động và highlight trực tiếp trên biểu đồ bằng chấm đỏ.

### Ghi chú (nếu có)
Chuẩn bị file test-data/sensor-sample-full.csv (60 readings, 2 anomaly spikes, GPS Đà Nẵng) để demo trực tiếp: upload → chart hiện 3 đường + các điểm đỏ bất thường + panel "Anomalies Detected".

---

## Slide 14: DVL Trajectory & Sonar Data
**Mức độ ưu tiên:** 🔸 Có thể lược bớt nếu thiếu thời gian
**Thời lượng ước tính:** 1.5 phút

### Nội dung slide (bullet trình chiếu)
- **DVL (Doppler Velocity Log)**: đo vận tốc tương đối, dùng dead-reckoning để vẽ quỹ đạo di chuyển dưới nước — vì GPS không hoạt động dưới nước
- **Sonar**: quét địa hình/vật thể đáy biển-hồ bằng sóng âm, lưu dạng file nhị phân custom (`SONAR360`)
- Cả 2 hỗ trợ multi-file/trip, merge nhiều file theo thời gian thực khi có nhiều lần ghi
- Bổ sung cho GPS: GPS chỉ có tại điểm nổi lên mặt nước; DVL/Sonar cho biết ROV di chuyển và "nhìn thấy" gì trong lòng nước

### Kịch bản thuyết trình (lời nói)
> Tiếp theo, em xin giới thiệu hai loại dữ liệu đặc thù của thiết bị ROV: DVL và Sonar. Như đã biết, tín hiệu GPS không thể xuyên qua nước, nên khi ROV lặn xuống, hệ thống định vị vệ tinh thông thường sẽ mất tác dụng. Để giải quyết vấn đề này, thiết bị DVL — Doppler Velocity Log — đo vận tốc tương đối của ROV so với đáy biển bằng hiệu ứng Doppler, từ đó tính toán ra vị trí tương đối theo phương pháp dead-reckoning, giúp vẽ lại được quỹ đạo di chuyển của ROV dưới nước dù không có GPS.
>
> Loại dữ liệu thứ hai là Sonar, sử dụng sóng âm để quét địa hình và phát hiện vật thể ở đáy biển hoặc đáy hồ — nơi mà camera thông thường không thể nhìn xa do độ đục của nước. Dữ liệu sonar được lưu dưới dạng file nhị phân theo định dạng riêng, hệ thống sẽ đọc phần header để lấy thông tin số khung hình và thời lượng mà không cần load toàn bộ waveform vào cơ sở dữ liệu.
>
> Tóm lại, nếu GPS chỉ cho biết vị trí tại thời điểm ROV nổi lên mặt nước, thì DVL và Sonar chính là hai nguồn dữ liệu bổ sung, giúp tái hiện lại hành trình di chuyển và những gì ROV quan sát được trong suốt quá trình lặn dưới nước.

### Ghi chú (nếu có)
Demo: TrajectoryViewer (DVL path) và SonarViewer (playback file sonar) nếu có dữ liệu mẫu sẵn.

---

## Slide 15: Media Management (S3)
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2 phút

### Nội dung slide (bullet trình chiếu)
- Upload video/ảnh qua **presigned URL** — client upload thẳng lên S3, không qua backend
- Gallery xem media theo Project/Trip, phân loại tab (Videos/Images/Docs)
- Drag-to-reorder (kéo thả sắp xếp thứ tự playlist)
- Lightbox xem full-màn-hình, điều hướng bằng phím mũi tên
- Bulk select + delete (chỉ admin)

### Kịch bản thuyết trình (lời nói)
> Em xin trình bày module Quản lý Media, nơi lưu trữ video và hình ảnh thu được từ ROV lên Amazon S3. Điểm kỹ thuật đáng chú ý ở đây là cơ chế upload thông qua presigned URL. Thay vì để file đi qua backend rồi mới chuyển tiếp lên S3 — cách làm sẽ tốn băng thông và tài nguyên server — hệ thống sẽ để backend chỉ tạo ra một đường link tạm thời có chữ ký hợp lệ trong 5 phút, sau đó client sẽ upload file trực tiếp lên S3 bằng đường link đó. Cách làm này giúp giảm tải hoàn toàn cho server, vì server không phải xử lý luồng dữ liệu file nặng, mà chỉ đóng vai trò cấp quyền và xác nhận sau khi upload xong.
>
> Sau khi upload, người dùng có thể xem lại toàn bộ media theo từng Project hoặc Trip thông qua giao diện thư viện, được phân chia theo tab video, hình ảnh, và tài liệu. Người dùng có quyền operator hoặc admin có thể kéo-thả để sắp xếp lại thứ tự hiển thị của các file, ví dụ để sắp xếp đúng trình tự phát video liên tiếp. Khi click vào một file, giao diện lightbox sẽ mở ra xem toàn màn hình, có thể điều hướng qua lại bằng phím mũi tên. Cuối cùng, tính năng chọn nhiều và xóa hàng loạt được giới hạn chỉ dành cho vai trò admin, theo đúng bảng phân quyền của hệ thống.

### Ghi chú (nếu có)
Demo: mở MediaGallery của 1 trip có video/ảnh, thử kéo-thả sắp xếp lại, mở lightbox xem full-screen.

---

## Slide 16: Dashboard tổng quan & Thống kê
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2 phút

### Nội dung slide (bullet trình chiếu)
- 4 stat card: Total Projects, Running Trips, Active ROVs, Total Users (admin)
- Donut chart: Project Status
- Bar chart: Trips by Status
- Horizontal bar chart: ROV Utilization (top 8 ROV bận rộn nhất)
- Activity Timeline 6 tháng gần nhất (Project/Trip/Media)
- Backend chạy **7 MongoDB aggregation song song** để tối ưu tốc độ phản hồi

### Kịch bản thuyết trình (lời nói)
> Slide cuối cùng trong phần này, em xin trình bày trang Dashboard tổng quan — nơi hiển thị bức tranh toàn cảnh của hệ thống ngay khi người dùng đăng nhập. Trang này có bốn thẻ chỉ số nhanh: tổng số Project, số Trip đang chạy, số ROV đang hoạt động, và nếu là admin thì thêm tổng số người dùng trong hệ thống.
>
> Phía dưới là ba biểu đồ được vẽ bằng thư viện Recharts: biểu đồ donut thể hiện tỷ lệ Project theo từng trạng thái, biểu đồ cột thể hiện số lượng Trip theo trạng thái, và biểu đồ cột ngang thể hiện mức độ sử dụng của từng ROV — liệt kê tám thiết bị được sử dụng nhiều nhất. Ngoài ra còn có biểu đồ dòng thời gian hoạt động trong sáu tháng gần nhất, thể hiện số lượng Project, Trip và Media được tạo mới theo từng tháng.
>
> Về mặt kỹ thuật, để có đủ dữ liệu cho toàn bộ Dashboard này, backend phải chạy tổng cộng bảy phép tổng hợp MongoDB. Thay vì thực hiện tuần tự, em đã tối ưu bằng cách cho cả bảy aggregation này chạy song song cùng lúc, giúp giảm đáng kể thời gian phản hồi so với việc gọi từng cái một.

### Ghi chú (nếu có)
Demo: mở Dashboard, chỉ rõ 4 stat card + 3 biểu đồ hàng trên + activity timeline hàng dưới. Nếu có số liệu load-test thực tế (avg ~906ms, P95 ~1842ms cho endpoint stats/overview) có thể nhắc tới nếu hội đồng hỏi về hiệu năng.
