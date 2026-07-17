# Mô tả nhanh mở đầu + Câu hỏi nghiệp vụ hay bị hỏi trước

## 1. Câu mở đầu — mô tả web ngắn gọn, dễ hiểu (nói trước khi vào slide chi tiết)

Dùng đoạn này để nói **bằng lời, không cần đọc slide**, ngay khi người phản biện hỏi "đồ án làm cái gì" hoặc trước khi bắt đầu trình bày — mục đích để người nghe hình dung được sản phẩm trong 15-20 giây trước khi đi vào kỹ thuật.

> "Em làm một trang web quản lý cho đội vận hành ROV — tức là thiết bị lặn điều khiển từ xa dùng để khảo sát dưới nước. Trong lúc lặn, ROV nối dây với một trạm điều khiển GCS đặt trên tàu, GCS này ghi lại toàn bộ dữ liệu — video, ảnh, số liệu cảm biến như độ sâu, nhiệt độ — ngay tại hiện trường, nhưng vì ngoài khơi không có sóng wifi/mạng nên GCS không thể tự động đẩy dữ liệu lên cloud. Web của em cho phép người vận hành, khi tàu về đến đất liền và có mạng trở lại, upload toàn bộ dữ liệu đã lưu trong GCS lên hệ thống, rồi mọi người có thể đăng nhập xem lại: xem video kèm AI tự nhận diện vật thể dưới nước, xem biểu đồ cảm biến có cảnh báo bất thường tự động, và có thể bấm một nút để AI tự viết tóm tắt cho cả chuyến khảo sát. Nói ngắn gọn, đây là hệ thống lưu trữ — phân tích — báo cáo dữ liệu ROV sau lặn, chứ không phải phần mềm điều khiển ROV."

**Bản còn ngắn hơn (nếu bị ngắt lời/chỉ có 5-7 giây):**
> "Web quản lý dữ liệu cho ROV — thiết bị lặn khảo sát dưới nước — cho phép upload video, ảnh, dữ liệu cảm biến đã ghi trong GCS tại hiện trường lên hệ thống sau khi tàu về bờ, xem lại có AI hỗ trợ nhận diện vật thể và tự tóm tắt báo cáo."

---

## 2. Câu hỏi nghiệp vụ hay bị hỏi TRƯỚC (trước khi hỏi sâu kỹ thuật)

Đây là các câu hỏi định hướng/nghiệp vụ mà người phản biện thường hỏi **ngay đầu buổi**, trước khi đi vào kiến trúc hay code. Trả lời ngắn, tự tin, không lan man.

**1. ROV là gì, khác gì tàu ngầm hay drone dưới nước?**
> ROV — Remotely Operated Vehicle — là thiết bị lặn không người lái, điều khiển từ xa qua dây cáp nối với tàu/thuyền trên mặt nước, dùng để khảo sát đáy biển, đáy hồ, kiểm tra công trình ngầm. Khác drone ở chỗ ROV nối dây (không phải không dây hoàn toàn) vì sóng radio không truyền được trong nước.

**2. Web này có điều khiển được ROV không?**
> Không. Đây là hệ thống quản lý dữ liệu **sau khi lặn xong**, không điều khiển ROV theo thời gian thực. Việc điều khiển do phần cứng/phần mềm riêng của ROV đảm nhiệm.

**3. GCS là gì, vì sao GCS không tự động đẩy dữ liệu lên web ngay khi đang lặn?**
> GCS — Ground Control Station — là trạm điều khiển đặt trên tàu/thuyền, nối dây với ROV trong suốt quá trình lặn để vừa điều khiển vừa ghi lại dữ liệu (sensor, video, DVL, sonar) theo thời gian thực tại hiện trường. Vì ngoài khơi không có sóng wifi/di động, GCS chỉ có thể lưu dữ liệu tại chỗ (offline), không thể tự động đẩy lên server. Khi tàu về đến đất liền và có mạng trở lại, operator mới thao tác upload dữ liệu đã lưu trong GCS lên web.

**4. Ai là người dùng hệ thống này trong thực tế?**
> Ba nhóm: **operator** — người trực tiếp vận hành ROV, upload dữ liệu sau khi lặn; **viewer** — người chỉ cần xem lại kết quả (ví dụ khách hàng, người giám sát dự án); **admin** — người quản trị hệ thống, quản lý tài khoản và toàn quyền dữ liệu.

**5. Project và Trip khác nhau thế nào, sao không gộp làm một?**
> Project là một chuyến khảo sát lớn — có thể kéo dài nhiều ngày, dùng một ROV. Trip là một lần lặn cụ thể bên trong chuyến đó. Tách ra vì mỗi lần lặn có video/cảm biến/vị trí GPS riêng — nếu gộp chung sẽ không biết dữ liệu nào thuộc lần lặn nào.

**6. Dữ liệu lưu ở đâu, mất mạng/mất điện có bị mất dữ liệu không?**
> Trước khi upload, dữ liệu gốc nằm trong GCS tại hiện trường. Sau khi operator upload thành công, bản dữ liệu có cấu trúc được lưu trên MongoDB Atlas (cloud) và video/ảnh trên AWS S3 — cả hai đều là dịch vụ cloud có sẵn cơ chế sao lưu. Dữ liệu gốc trong GCS vẫn còn cho tới khi operator xoá tay, nên nếu upload lỗi giữa chừng cũng không làm mất dữ liệu gốc, chỉ cần upload lại.

**7. Hệ thống đã chạy thực tế với ROV thật chưa hay chỉ là mô phỏng?**
> [Điền theo thực tế của bạn — ví dụ: "Em đã test với dữ liệu mẫu mô phỏng đúng định dạng file thật mà GCS xuất ra (CSV cảm biến, JSON DVL, sonar, manifest), chưa có điều kiện chạy với ROV và GCS thật ngoài thực địa."] Trả lời trung thực, không nói quá.

**8. Nếu GCS của đội khác xuất file không đúng tên/định dạng hệ thống yêu cầu thì sao?**
> Hệ thống dựa vào quy ước đặt tên file do GCS xuất ra để tự phân loại (ví dụ `log_*.csv`, `DVL_*.json`). Nếu GCS khác xuất định dạng khác, cần điều chỉnh lại bộ phân loại `classifyFile` — đây là phần được viết tách riêng, dễ mở rộng thêm quy tắc mới mà không ảnh hưởng phần còn lại của hệ thống.

**9. Đồ án này có phải chỉ là một web CRUD thông thường không, đâu là phần khó/sáng tạo?**
> Phần CRUD (quản lý ROV/Project/Trip) chỉ là nền tảng. Điểm khó và tốn công sức nhất là: (1) đồng bộ video với dữ liệu cảm biến theo thời gian thực trên cùng một giao diện, (2) tích hợp AI nhận diện vật thể chạy bất đồng bộ không làm chậm hệ thống, (3) xử lý dữ liệu thô đa dạng định dạng từ thiết bị thực tế (CSV/JSON/binary sonar) với timestamp, GPS, đơn vị đo khác chuẩn.

**10. Chi phí vận hành hệ thống có cao không (S3, Gemini, MongoDB...)?**
> Với quy mô đồ án, các dịch vụ đều dùng free tier hoặc gần như miễn phí: MongoDB Atlas free tier 512MB, Gemini 2.5 Flash có free tier, S3 tính theo dung lượng thực tế nên rất rẻ với vài chục file demo, YOLOv8n chạy CPU không cần thuê GPU. Chi phí đáng kể duy nhất là VPS ~6 USD/tháng nếu deploy thật.

---

## 3. Câu hỏi "vì sao chọn công nghệ X mà không chọn Y" — nhóm hay bị hỏi ngay sau câu hỏi nghiệp vụ

**11. Vì sao dùng YOLOv8 mà không dùng bản mới hơn (YOLOv9/v10/v11...)?**
> Tại thời điểm em chọn, YOLOv8 là bản ổn định nhất, tài liệu và cộng đồng hỗ trợ đầy đủ trong thư viện Ultralytics, và quan trọng là Ultralytics dùng chung một API cho toàn bộ các bản sau này — nên nếu cần nâng cấp, em chỉ cần đổi tên file model (`.pt`) chứ không phải viết lại code. Ưu tiên của em là một pipeline chạy ổn định trên CPU (không có GPU) hơn là chạy bản mới nhất — bản nano của YOLOv8 chỉ ~6MB, đủ nhẹ cho VPS giá rẻ.

**12. Vì sao không dùng Machine Learning phức tạp hơn để phát hiện bất thường, mà chỉ dùng Z-Score?**
> Z-Score là thuật toán thống kê đơn giản, dễ giải thích, không cần dữ liệu huấn luyện — phù hợp với bài toán phát hiện điểm lệch chuẩn cơ bản (tụt áp đột ngột, nhiệt độ tăng vọt) trong phạm vi đồ án. Một mô hình ML phức tạp hơn (ví dụ Isolation Forest, Autoencoder) sẽ cần lượng dữ liệu lịch sử lớn để huấn luyện mà đồ án chưa có, và độ phức tạp tăng thêm không tương xứng với giá trị mang lại ở quy mô hiện tại.

**13. AI tóm tắt bằng Gemini có đáng tin không, lỡ AI "bịa" thông tin thì sao?**
> Prompt gửi cho Gemini chỉ chứa dữ liệu có thật lấy từ database (tên project, địa danh, danh sách trip, số lượng media) — Gemini chỉ đóng vai trò viết lại thành văn xuôi mạch lạc, không được yêu cầu suy luận thêm thông tin ngoài dữ liệu cung cấp. Tuy nhiên đây vẫn là văn bản do AI sinh ra nên em khuyến nghị operator xem lại trước khi dùng cho báo cáo chính thức — hệ thống không tự động gửi báo cáo mà không qua người kiểm tra.

**14. Vì sao chọn MongoDB mà không phải SQL — dữ liệu ROV có cần quan hệ chặt (transaction) không?**
> Dữ liệu chính (Project → Trip → Sensor/Media) có quan hệ phân cấp rõ ràng nhưng không cần transaction phức tạp kiểu ngân hàng — mỗi lần ghi dữ liệu (upload sensor, tạo trip) là một thao tác độc lập. MongoDB phù hợp hơn vì schema linh hoạt cho các trường mở rộng (labels AI, aiSummary...) mà không cần migration như SQL mỗi khi thêm tính năng mới.

**15. Nếu sau này phải đổi từ Gemini sang model AI khác (OpenAI, Claude...) thì có dễ không?**
> Dễ — toàn bộ logic gọi AI được tách riêng trong một file service (`ai.service.js`), chỉ cần đổi phần gọi API bên trong, không ảnh hưởng đến Bull Queue hay cách lưu kết quả vào database. Đây là chủ đích thiết kế tách lớp (service layer) ngay từ đầu.

---

## Ghi chú sử dụng

- Phần 1 (mô tả mở đầu) nên **thuộc lòng và luyện nói tự nhiên**, không đọc — vì đây là câu đầu tiên tạo ấn tượng.
- Phần 2-3 không cần thuộc lòng nguyên văn, chỉ cần nắm ý chính — người phản biện đánh giá cao câu trả lời tự nhiên hơn là học vẹt.
- Xem thêm 20 câu hỏi kỹ thuật/kiến trúc sâu hơn ở phụ lục cuối file [04-ket-qua-ket-luan-qa.md](04-ket-qua-ket-luan-qa.md) nếu buổi phản biện đi sâu hơn vào code.
