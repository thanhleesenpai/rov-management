# PHIẾU GIAO NHIỆM VỤ ĐỒ ÁN TỐT NGHIỆP HỆ CỬ NHÂN
## Mẫu ĐATN 02

---

**KỲ:** [Điền kỳ học]

---

## Thông tin về sinh viên

- **Họ và tên sinh viên:** [Họ tên]
- **MSSV:** [MSSV]
- **Điện thoại liên lạc:** [SĐT]
- **Lớp:** [Lớp]
- **Email:** [Email]
- **Mã lớp:** [Mã lớp]

---

## Thông tin giáo viên hướng dẫn

- **Họ và tên GVHD:** [Tên GVHD]
- **Đồ án được thực hiện tại:** Trường Công nghệ Thông tin và Truyền thông
- **Thời gian làm ĐATN:** Từ ngày ________ đến ngày ________

---

## 1. Tên đề tài

**Hệ thống quản lý vận hành ROV (Remotely Operated Vehicle) tích hợp trí tuệ nhân tạo**

---

## 2. Lĩnh vực đề tài

- Lựa chọn 1: **Phần mềm doanh nghiệp**
- Lựa chọn 2: **AIoT**

---

## 3. Mục tiêu của ĐATN

### 3.1. Kiến thức sinh viên thu thập được:
- Quy trình xây dựng phần mềm quản lý vận hành thiết bị trong môi trường thực tế;
- Kinh nghiệm thiết kế hệ thống fullstack với phân quyền đa cấp (RBAC);
- Kiến thức tích hợp dịch vụ lưu trữ đám mây (AWS S3) vào ứng dụng web;
- Hiểu biết về cách ứng dụng AI (Large Language Model API) vào phân tích và tóm tắt dữ liệu kỹ thuật;
- Nắm vững quy trình xác thực bảo mật với JWT (access token + refresh token).

### 3.2. Công nghệ sinh viên thu thập được:
- MERN stack: công nghệ nguồn mở cho JavaScript (MongoDB, Express.js, React.js, Node.js);
- Dịch vụ lưu trữ đối tượng AWS S3 (upload video, ảnh, dữ liệu cảm biến từ thiết bị);
- Xử lý xác thực và phân quyền với JWT (access token + refresh token);
- Tích hợp AI API (OpenAI / Claude) để phân tích và tóm tắt dữ liệu kỹ thuật;
- Cách thức kết hợp nhiều công nghệ và dịch vụ bên thứ ba trong một hệ thống thống nhất.

### 3.3. Kỹ năng sinh viên phát triển được:
- Phân tích yêu cầu và thiết kế hệ thống phần mềm thực tế;
- Xây dựng RESTful API chuẩn, có phân quyền và bảo mật;
- Tích hợp nhiều dịch vụ bên thứ ba (AWS, AI API) vào một hệ thống thống nhất;
- Thiết kế giao diện người dùng responsive, thân thiện với nhiều vai trò;
- Khả năng xử lý luồng dữ liệu thời gian thực từ thiết bị phần cứng (GCS).

### 3.4. Sản phẩm kỳ vọng:
- Hệ thống web quản lý vận hành ROV hoàn chỉnh, có thể triển khai thực tế;
- Hỗ trợ operator theo dõi, ghi nhận và phân tích dữ liệu từng chuyến lặn (project);
- Tích hợp AI tự động tóm tắt chuyến lặn và phát hiện dữ liệu cảm biến bất thường;
- Dashboard trực quan với biểu đồ thống kê hoạt động ROV theo thời gian.

### 3.5. Vấn đề đề tài án giải quyết:
- Các đơn vị vận hành ROV hiện nay chưa có công cụ số hóa để quản lý thiết bị, theo dõi hành trình lặn và lưu trữ dữ liệu một cách hệ thống;
- Dữ liệu cảm biến (nhiệt độ, độ sâu, áp suất) từ GCS cần được phân tích để phát hiện sớm rủi ro, nhưng việc này đang làm thủ công;
- Cần nền tảng tập trung để nhiều thành viên vận hành (admin, operator, viewer) cùng truy cập và phối hợp theo phân quyền rõ ràng.

---

## 4. Các nội dung sẽ thực hiện và kế hoạch triển khai

> Lưu ý: khối lượng yêu cầu đối với đồ án tốt nghiệp hệ cử nhân là 6(0-0-12), ie. 12 tiết làm việc/tuần trong 17 tuần.

---

### Nội dung 1: Tìm hiểu tổng quan về bài toán — từ Tuần 1 đến Tuần 4

**Chi tiết:**
- Nghiên cứu tổng quan về ROV và quy trình vận hành trong thực tế;
- Khảo sát nhu cầu quản lý thiết bị, chuyến lặn, dữ liệu cảm biến của đơn vị vận hành;
- Khảo sát các hệ thống quản lý thiết bị tương tự trên thị trường;
- Xác định các usecase chính và phạm vi hệ thống cần xây dựng.

---

### Nội dung 2: Tìm hiểu tổng quan về công nghệ liên quan — từ Tuần 2 đến Tuần 6

**Chi tiết:**
- React.js, Node.js, Express.js, MongoDB / Mongoose;
- AWS S3: presigned URL, object storage, access control;
- JWT authentication flow (access token + refresh token);
- OpenAI API / Claude API: cách gọi API, thiết kế prompt kỹ thuật, xử lý response;
- React Query (server state), Zustand (client state), Recharts (data visualization).

---

### Nội dung 3: Phân tích thiết kế, từ Tuần 4 đến Tuần 8

Chi tiết:
- Phân tích các usecase và vai trò người dùng trong hệ thống;
- Thiết kế kiến trúc hệ thống — chi tiết các phân hệ Backend, Frontend;
- Thiết kế cơ sở dữ liệu;
- Thiết kế giao diện sử dụng mock up.

---

### Nội dung 4: Xây dựng chương trình, từ Tuần 7 đến Tuần 14

Chi tiết:
- Xây dựng các API services;
- Xây dựng module xác thực, phân quyền người dùng;
- Xây dựng module quản lý ROV, chuyến lặn (Project), công việc (Job);
- Xây dựng module lưu trữ và quản lý media trên AWS S3;
- Xây dựng module tích hợp AI phân tích và tóm tắt dữ liệu chuyến lặn;
- Xây dựng Dashboard thống kê và báo cáo.

---

### Nội dung 5: Thử nghiệm và đánh giá, từ Tuần 13 đến Tuần 17

Chi tiết:
- Kiểm thử các API services;
- Kiểm thử các module quản lý và luồng nghiệp vụ chính;
- Kiểm thử tích hợp AI và lưu trữ file trên AWS S3;
- Kiểm thử hệ thống khi chạy trên máy tính và thiết bị di động.

---

## Ghi chú thêm

- Dữ liệu cảm biến từ GCS (Ground Control Station) được giả lập trong giai đoạn phát triển nếu phần cứng chưa sẵn sàng;
- AI API sử dụng: OpenAI GPT-4o hoặc Anthropic Claude — lựa chọn cuối căn cứ vào chi phí và chất lượng trong quá trình thử nghiệm;
- Hệ thống hướng đến triển khai thực tế tại đơn vị vận hành ROV, không chỉ là demo học thuật.
