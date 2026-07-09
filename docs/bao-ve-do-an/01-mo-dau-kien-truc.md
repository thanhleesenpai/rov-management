# Phần A — Mở đầu & Kiến trúc hệ thống (Slide 1-8)

---

## Slide 1: Trang bìa
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 45 giây

### Nội dung slide (bullet trình chiếu)
- ĐẠI HỌC BÁCH KHOA HÀ NỘI
- [Trường/Viện: Điện – Điện tử / Công nghệ Thông tin và Truyền thông]
- ĐỒ ÁN TỐT NGHIỆP
- **Đề tài: Xây dựng hệ thống quản lý ROV (Remotely Operated Vehicle)**
- Sinh viên thực hiện: [Tên sinh viên] — MSSV: [MSSV]
- Ngành/Chuyên ngành: [Ngành/Khoa]
- Giảng viên hướng dẫn: [GVHD]
- Hà Nội, [Tháng/Năm]

### Kịch bản thuyết trình (lời nói)
> Kính thưa quý thầy cô trong hội đồng, em xin phép được bắt đầu buổi bảo vệ đồ án tốt nghiệp của mình.
>
> Em xin tự giới thiệu, em tên là [Tên sinh viên], mã số sinh viên [MSSV], sinh viên ngành [Ngành/Khoa], Trường Đại học Bách Khoa Hà Nội. Đồ án tốt nghiệp của em được thực hiện dưới sự hướng dẫn của thầy/cô [GVHD], với đề tài: **"Xây dựng hệ thống quản lý ROV — Remotely Operated Vehicle"**.
>
> Trong phần trình bày hôm nay, em xin phép trình bày lần lượt theo bốn phần chính: thứ nhất là lý do chọn đề tài và mục tiêu; thứ hai là kiến trúc tổng thể hệ thống và công nghệ sử dụng; thứ ba là các chức năng chính đã xây dựng được; và cuối cùng là kết quả thử nghiệm cũng như hướng phát triển tiếp theo. Em xin bắt đầu với phần đặt vấn đề.

### Ghi chú (nếu có)
Điền đầy đủ [Tên sinh viên], [MSSV], [GVHD], [Ngành/Khoa] trước khi in slide. Nên có logo trường/viện ở slide bìa theo đúng mẫu quy định của BKHN.

---

## Slide 2: Đặt vấn đề / Lý do chọn đề tài
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 70 giây

### Nội dung slide (bullet trình chiếu)
- ROV nối dây với **GCS** (trạm điều khiển) trên tàu, hoạt động ngoài thực địa (khảo sát đáy biển/hồ) — **không có kết nối wifi/mạng**
- GCS ghi dữ liệu offline tại chỗ: sensor CSV, DVL JSON, sonar, video, ảnh — rời rạc, chưa đồng bộ lên hệ thống trung tâm
- Chưa có công cụ tập trung để quản lý lịch sử các chuyến khảo sát (Project) và từng lần lặn (Trip)
- Khó phân tích thủ công dữ liệu cảm biến để phát hiện bất thường (nhiệt độ, áp suất, độ sâu bất thường)
- Khó tìm lại bằng chứng hình ảnh/video quan trọng trong khối lượng dữ liệu lớn
- → Nhu cầu: một **hệ thống quản lý tập trung**, cho phép upload, lưu trữ, trực quan hóa và phân tích dữ liệu sau mỗi chuyến khảo sát

### Kịch bản thuyết trình (lời nói)
> Thưa quý thầy cô, trước khi đi vào chi tiết hệ thống, em xin trình bày về thực trạng và lý do chọn đề tài.
>
> ROV — thiết bị lặn điều khiển từ xa — nối dây với một trạm điều khiển GCS đặt trên tàu, thường hoạt động ở thực địa như đáy biển, đáy hồ, những nơi hoàn toàn không có kết nối wifi hay mạng di động. Trong suốt quá trình lặn, GCS liên tục ghi lại rất nhiều loại dữ liệu khác nhau truyền lên từ ROV: dữ liệu cảm biến như độ sâu, nhiệt độ, áp suất dưới dạng file CSV; dữ liệu định vị DVL dưới dạng JSON; dữ liệu sonar quét đáy; cùng với video và hình ảnh từ camera. Tất cả các dữ liệu này, sau mỗi lần lặn, nằm rời rạc trong GCS tại hiện trường, chưa có nơi lưu trữ tập trung.
>
> Điều này dẫn đến ba khó khăn thực tế: một là không quản lý được lịch sử các chuyến khảo sát đã thực hiện; hai là rất khó để phân tích dữ liệu cảm biến bằng mắt thường nhằm phát hiện các điểm bất thường; và ba là khi cần tìm lại một khoảnh khắc hình ảnh quan trọng — ví dụ phát hiện vật thể lạ — thì gần như phải xem lại thủ công toàn bộ video.
>
> Từ thực trạng đó, em nhận thấy nhu cầu cấp thiết phải xây dựng một hệ thống quản lý tập trung, cho phép operator upload dữ liệu từ GCS lên hệ thống ngay sau khi tàu về bờ, và cho phép người dùng xem lại, phân tích dữ liệu một cách trực quan qua giao diện web.

### Ghi chú (nếu có)
Có thể chèn 1 ảnh minh họa ROV thực địa hoặc sơ đồ "trước và sau" (dữ liệu rời rạc → hệ thống tập trung) để tăng tính trực quan.

---

## Slide 3: Mục tiêu đề tài
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 60 giây

### Nội dung slide (bullet trình chiếu)
1. Xây dựng web app quản lý **ROV / Project / Trip** — CRUD đầy đủ, lịch sử khảo sát
2. Cho phép **upload dữ liệu sensor/DVL/sonar/video/ảnh từ GCS** lên hệ thống sau khi tàu về bờ (upload thủ công vì GCS không tự động đồng bộ ngoài khơi)
3. **Trực quan hóa dữ liệu cảm biến** (biểu đồ depth/temp/pressure) + **phát hiện bất thường tự động** (Z-Score)
4. Tích hợp **AI hỗ trợ phân tích**: nhận diện vật thể bằng YOLOv8, tóm tắt chuyến khảo sát bằng Gemini
5. Đảm bảo **bảo mật, phân quyền (RBAC)**, và **thông báo realtime** (SSE) cho hệ thống nhiều operator

### Kịch bản thuyết trình (lời nói)
> Từ những vấn đề đã nêu, em đặt ra năm mục tiêu cụ thể cho đồ án.
>
> Mục tiêu thứ nhất là xây dựng một ứng dụng web hoàn chỉnh để quản lý ba đối tượng chính: ROV — tức thiết bị lặn, Project — tức chuyến khảo sát lớn, và Trip — tức từng lần lặn cụ thể, với đầy đủ chức năng tạo, xem, sửa, xóa và tra cứu lịch sử.
>
> Mục tiêu thứ hai là cho phép operator upload dữ liệu sensor, DVL, sonar, video và ảnh đã được GCS ghi lại, ngay sau khi tàu về bờ — đây là điểm quan trọng vì hệ thống của em được thiết kế cho bối cảnh không có kết nối mạng ngoài thực địa, nên GCS không thể tự động đồng bộ, mà hoàn toàn dựa vào việc operator upload thủ công qua web.
>
> Mục tiêu thứ ba là trực quan hóa dữ liệu cảm biến bằng biểu đồ, đồng thời tự động phát hiện các điểm bất thường trong dữ liệu bằng thuật toán Z-Score.
>
> Mục tiêu thứ tư là tích hợp trí tuệ nhân tạo để hỗ trợ phân tích: cụ thể là YOLOv8 để nhận diện vật thể trong ảnh và video, và Gemini để tự động tóm tắt nội dung một chuyến khảo sát.
>
> Và cuối cùng, mục tiêu thứ năm là đảm bảo hệ thống có cơ chế bảo mật, phân quyền rõ ràng theo vai trò, cùng với thông báo thời gian thực để phục vụ môi trường làm việc có nhiều operator cùng lúc.

### Ghi chú (nếu có)
Nên trình bày 5 mục tiêu dưới dạng số thứ tự rõ ràng trên slide (1-2-3-4-5), vì đây là phần hội đồng hay đối chiếu lại ở cuối buổi bảo vệ để đánh giá mức độ hoàn thành.

---

## Slide 4: Phạm vi & Đối tượng nghiệp vụ
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 65 giây

### Nội dung slide (bullet trình chiếu)
- **Có làm:** quản lý, lưu trữ và phân tích dữ liệu ROV **sau khi đã về bờ**, upload từ GCS lên hệ thống (post-dive analysis)
- **Không làm:** điều khiển ROV trực tiếp / real-time control dưới nước (việc đó do GCS + phần cứng ROV đảm nhiệm)
- **Không làm:** GCS **không** tự động đồng bộ dữ liệu lên hệ thống ngoài thực địa — vì không có wifi, phải đợi về bờ upload thủ công
- 3 vai trò người dùng (RBAC):
  - **viewer** — chỉ xem (đọc dữ liệu, không sửa/xóa/upload)
  - **operator** — vận hành: tạo/sửa Project, Trip; upload sensor/media
  - **admin** — toàn quyền: quản lý user, xóa resource, xem audit log

### Kịch bản thuyết trình (lời nói)
> Để hội đồng dễ hình dung đúng phạm vi công việc, em xin làm rõ ranh giới của đề tài.
>
> Hệ thống em xây dựng tập trung vào việc quản lý, lưu trữ và phân tích dữ liệu **sau khi ROV đã hoàn thành lặn và tàu về bờ** — em gọi đây là mô hình "post-dive analysis". Trong lúc lặn, việc điều khiển ROV và ghi dữ liệu tại chỗ do GCS — Ground Control Station — đảm nhiệm, đây là thiết bị có sẵn trên tàu, không thuộc phạm vi đồ án. Hệ thống web của em **không** thực hiện điều khiển ROV theo thời gian thực, và GCS cũng **không** tự động đồng bộ dữ liệu lên hệ thống ngoài thực địa, bởi vì như đã trình bày, khu vực khảo sát hoàn toàn không có kết nối mạng — phải đợi tàu về bờ, operator mới upload thủ công.
>
> Về phân quyền, hệ thống định nghĩa ba vai trò người dùng. Vai trò **viewer** chỉ có quyền xem dữ liệu, không được chỉnh sửa. Vai trò **operator** là người trực tiếp vận hành ROV, được phép tạo và sửa Project, Trip, cũng như upload dữ liệu sensor và media sau mỗi chuyến khảo sát. Và vai trò **admin** có toàn quyền trên hệ thống, bao gồm quản lý người dùng, xóa tài nguyên, và xem nhật ký kiểm toán — audit log.
>
> Việc phân định rõ phạm vi này giúp đồ án tập trung đúng vào giá trị cốt lõi: xây dựng công cụ quản lý và phân tích dữ liệu hậu kỳ, thay vì mở rộng sang bài toán điều khiển thiết bị phần cứng thời gian thực — vốn là một bài toán khác với yêu cầu kỹ thuật khác biệt.

### Ghi chú (nếu có)
Đây là slide dễ bị hội đồng hỏi xoáy "vậy hệ thống có điều khiển được ROV không" — cần trả lời dứt khoát ngay tại slide này để tránh hiểu lầm về sau.

---

## Slide 5: Luồng nghiệp vụ tổng quan
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 75 giây

### Nội dung slide (bullet trình chiếu)
```
   ROV lặn dưới nước ── nối dây ──▶ GCS (trạm điều khiển trên tàu)
                                     │  ghi dữ liệu offline tại hiện trường
                                     │  (không wifi, không đồng bộ tự động)
                                     ▼
                              Tàu về bờ, có mạng trở lại
                                     │
                                     ▼
                    Operator upload CSV/JSON/video/ảnh từ GCS qua Web
                                     │
                                     ▼
                            Backend API (Node.js)
                    ├── Lưu sensor/DVL/sonar data → MongoDB Atlas
                    └── Lưu video/ảnh → AWS S3
                                     ▼
                    Web App (React) — người dùng đăng nhập xem lại:
                    ROV info · Project/Trip history · Sensor charts · Media gallery
```
- Đây là hệ thống **"post-dive analysis"** — không phải hệ thống điều khiển thời gian thực
- GCS ghi dữ liệu tại hiện trường nhưng không đồng bộ tự động — mọi thứ lên hệ thống bắt đầu từ hành động **upload thủ công** của operator khi về bờ

### Kịch bản thuyết trình (lời nói)
> Tiếp theo, em xin trình bày luồng nghiệp vụ tổng quan của toàn hệ thống.
>
> Luồng bắt đầu khi ROV lặn, nối dây với GCS — trạm điều khiển đặt trên tàu — GCS vừa điều khiển ROV vừa ghi lại toàn bộ dữ liệu tại hiện trường: file CSV chứa sensor data, file JSON chứa dữ liệu định vị DVL, file sonar, cùng với video và ảnh chụp. Khi lặn xong và tàu quay về bờ, có kết nối mạng trở lại, operator sẽ lấy dữ liệu đã lưu trong GCS rồi upload toàn bộ lên hệ thống thông qua giao diện web.
>
> Khi dữ liệu được gửi lên, Backend viết bằng Node.js sẽ tiếp nhận và xử lý: với dữ liệu cảm biến dạng số như độ sâu, nhiệt độ, áp suất, tọa độ GPS, hệ thống sẽ lưu vào MongoDB Atlas; còn với video và ảnh, hệ thống sẽ lưu trực tiếp lên AWS S3 thông qua cơ chế presigned URL.
>
> Sau khi dữ liệu đã được lưu trữ, người dùng — có thể là operator khác, hoặc admin, hoặc viewer — chỉ cần đăng nhập vào Web App bằng React để xem lại toàn bộ lịch sử: thông tin ROV, lịch sử các Project và Trip, biểu đồ dữ liệu cảm biến, và thư viện media.
>
> Em xin nhấn mạnh lại một lần nữa: đây là một hệ thống phân tích hậu kỳ — "post-dive analysis" — toàn bộ luồng dữ liệu đều bắt đầu từ hành động upload thủ công của operator sau khi về bờ, không có bất kỳ luồng dữ liệu tự động nào diễn ra ngoài thực địa.

### Ghi chú (nếu có)
Nên vẽ lại sơ đồ này bằng draw.io hoặc PowerPoint SmartArt cho đẹp hơn ASCII, giữ đúng thứ tự và nhãn như trên. Có thể demo nhanh màn hình upload ngay sau slide này nếu hội đồng cho phép xen kẽ demo.

---

## Slide 6: Kiến trúc tổng thể hệ thống
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 90 giây

### Nội dung slide (bullet trình chiếu)
```
┌─────────────┐      HTTP/REST       ┌──────────────────┐
│  Frontend    │◀────────────────────▶│  Backend          │
│  React+Vite  │      SSE (push)      │  Express.js       │
└─────────────┘                       └─────────┬─────────┘
                                                  │
                     ┌────────────────────────────┼───────────────────────┐
                     ▼                            ▼                       ▼
            ┌─────────────────┐         ┌──────────────────┐    ┌──────────────────┐
            │ MongoDB Atlas    │         │ AWS S3            │    │ Redis + Bull Queue│
            │ (Project/Trip/   │         │ (video, ảnh,       │    │ (token blacklist, │
            │ Sensor/Media...) │         │  presigned URL)    │    │  async jobs)      │
            └─────────────────┘         └──────────────────┘    └────────┬─────────┘
                                                                          │
                                                       ┌──────────────────┼───────────────────┐
                                                       ▼                                       ▼
                                          ┌─────────────────────────┐          ┌──────────────────────┐
                                          │ YOLOv8 microservice      │          │ Gemini 2.5 Flash API  │
                                          │ (Python FastAPI)         │          │ (Project AI Summary)  │
                                          └─────────────────────────┘          └──────────────────────┘
```
- Kiến trúc nhiều tầng, tách rời rõ ràng: **Frontend ↔ Backend ↔ Data/Storage ↔ AI services**
- **YOLOv8 tách thành microservice Python riêng** — lý do: Node.js không phù hợp chạy inference AI/ML; Python có hệ sinh thái (Ultralytics, OpenCV) hỗ trợ tốt hơn
- Giao tiếp Backend ↔ YOLO service qua REST nội bộ (`YOLO_SERVICE_URL`)

### Kịch bản thuyết trình (lời nói)
> Về mặt kiến trúc, hệ thống được thiết kế theo mô hình nhiều tầng, tách bạch rõ ràng trách nhiệm của từng thành phần.
>
> Tầng Frontend được xây dựng bằng React kết hợp Vite, giao tiếp với tầng Backend viết bằng Express.js thông qua hai kênh: REST API cho các thao tác thông thường, và Server-Sent Events để nhận thông báo đẩy từ server theo thời gian thực.
>
> Tầng Backend kết nối tới ba nhóm hạ tầng dữ liệu. Thứ nhất là MongoDB Atlas, lưu trữ toàn bộ dữ liệu có cấu trúc như Project, Trip, sensor data. Thứ hai là AWS S3, lưu trữ file nhị phân dung lượng lớn như video và ảnh, thông qua cơ chế presigned URL để client upload trực tiếp mà không phải đi qua backend, giảm tải cho server. Thứ ba là Redis kết hợp Bull Queue, phục vụ hai việc: lưu danh sách token bị thu hồi để tăng cường bảo mật đăng xuất, và làm hàng đợi xử lý các tác vụ bất đồng bộ.
>
> Đặc biệt, hệ thống tích hợp hai dịch vụ AI: một microservice Python riêng chạy YOLOv8 để nhận diện vật thể trong ảnh và video, và Gemini 2.5 Flash để sinh tóm tắt tự động cho Project.
>
> Em xin giải thích lý do vì sao YOLOv8 được tách thành một microservice độc lập bằng Python, thay vì tích hợp thẳng vào Backend Node.js. Lý do là bởi hệ sinh thái AI/Machine Learning — cụ thể là thư viện Ultralytics chạy YOLOv8 và OpenCV để xử lý video — được hỗ trợ tốt nhất trên Python, trong khi Node.js không có thư viện tương đương đủ mạnh và ổn định. Việc tách microservice cũng giúp hai phần này có thể scale độc lập, và nếu dịch vụ YOLO gặp sự cố thì không ảnh hưởng tới luồng nghiệp vụ chính của Backend.

### Ghi chú (nếu có)
Nên vẽ lại sơ đồ kiến trúc này bằng draw.io hoặc Excalidraw thành dạng box-diagram đẹp mắt thay vì ASCII thô. Chuẩn bị sẵn để trả lời câu hỏi "tại sao không dùng WebSocket thay vì SSE" (trả lời: chỉ cần đẩy 1 chiều server→client, SSE đơn giản hơn, tự động reconnect).

---

## Slide 7: Tech stack & lý do lựa chọn
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 100 giây

### Nội dung slide (bullet trình chiếu)
| Layer | Công nghệ | Lý do chọn |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind CSS | Vite build/HMR nhanh; Tailwind viết UI nhất quán, hỗ trợ dark mode qua token |
| UI Components | shadcn/ui | Component có sẵn, dễ tùy biến, không phụ thuộc runtime nặng |
| State | React Query + Zustand | Tách bạch server state (cache, refetch) và client state (auth, theme) |
| Charts | Recharts | Tích hợp React tốt, đủ mạnh cho biểu đồ sensor + dashboard |
| Map | Leaflet.js + OpenStreetMap | Vẽ route GPS **miễn phí**, không cần API key trả phí như Google Maps |
| Backend | Node.js + Express.js | Đơn giản, phổ biến, cùng ngôn ngữ JS với Frontend |
| Database | MongoDB Atlas + Mongoose | Schema linh hoạt, hợp với dữ liệu sensor đa dạng field theo từng đời ROV |
| Realtime | SSE (Server-Sent Events) | Chỉ cần đẩy 1 chiều server→client; đơn giản hơn WebSocket, tự động reconnect |
| Cache | Redis | Token blacklist khi logout (bảo mật) |
| Rate Limiting | express-rate-limit | Giới hạn 20 request/15 phút cho `/auth/login`, `/auth/register` — chống brute-force (in-memory, chưa nối Redis) |
| Queue | Bull (Redis-backed) | AI/YOLO call mất 5-15s → không nên block HTTP request |
| Storage | AWS S3 (presigned URL) | Chuẩn công nghiệp cho lưu trữ file lớn, giảm tải backend |
| Auth | JWT (access 15p + refresh 7 ngày) + Google OAuth2 | Stateless, dễ scale; refresh token cho phép revoke |
| AI tóm tắt | Gemini 2.5 Flash | Free tier tốt, tốc độ nhanh, đủ cho tóm tắt văn bản |
| Computer Vision | YOLOv8 (FastAPI) | Nhẹ (yolov8n ~6MB), inference nhanh trên CPU, đủ cho demo |
| Anomaly Detection | Z-Score (tự implement) | Đơn giản, không cần ML phức tạp cho phát hiện bất thường cơ bản |

### Kịch bản thuyết trình (lời nói)
> Về lựa chọn công nghệ, em xin trình bày ngắn gọn lý do chọn cho từng tầng, vì mỗi lựa chọn đều có cân nhắc riêng chứ không chọn ngẫu nhiên.
>
> Ở tầng Frontend, em chọn React 18 kết hợp Vite và Tailwind CSS — Vite cho tốc độ build và hot-reload nhanh, Tailwind giúp viết giao diện nhất quán và hỗ trợ tốt cho việc chuyển đổi sáng-tối thông qua hệ thống design token. Về quản lý state, em tách riêng hai loại: React Query quản lý dữ liệu lấy từ server — có cơ chế cache và tự động làm mới, còn Zustand quản lý state thuần phía client như thông tin đăng nhập và theme.
>
> Về bản đồ, em chọn Leaflet.js kết hợp OpenStreetMap thay vì Google Maps, vì đây là giải pháp hoàn toàn miễn phí, phù hợp với quy mô đồ án, mà vẫn đủ để vẽ lại lộ trình GPS của mỗi lần lặn.
>
> Ở tầng Backend, em dùng Node.js với Express.js, và MongoDB Atlas làm cơ sở dữ liệu chính — MongoDB phù hợp vì dữ liệu cảm biến từ các đời ROV khác nhau có thể có cấu trúc field khác nhau, và schema linh hoạt của MongoDB xử lý tốt việc này.
>
> Về cơ chế thời gian thực, em chọn Server-Sent Events thay vì WebSocket, bởi vì nhu cầu thực tế chỉ là đẩy thông báo một chiều từ server xuống client — SSE đơn giản hơn để triển khai, và trình duyệt tự động thử kết nối lại nếu mất kết nối, không cần code thêm.
>
> Về xử lý bất đồng bộ, em dùng Redis kết hợp Bull Queue cho các tác vụ nặng như gọi AI hoặc chạy YOLOv8 — vì các lệnh gọi này có thể mất từ năm đến mười lăm giây, nếu xử lý đồng bộ sẽ khiến request HTTP bị block, ảnh hưởng trải nghiệm người dùng.
>
> Cuối cùng, về phát hiện bất thường trong dữ liệu cảm biến, em chọn thuật toán Z-Score tự triển khai, thay vì các mô hình Machine Learning phức tạp, vì với bài toán phát hiện điểm dữ liệu lệch chuẩn cơ bản, Z-Score đã đủ hiệu quả và dễ giải thích, phù hợp với phạm vi đồ án.

### Ghi chú (nếu có)
Bảng này khá dài — nếu thiếu thời gian, có thể chỉ đọc to 5-6 dòng quan trọng nhất (Frontend, Backend, Database, Realtime, Queue, AI) và để cả bảng trên slide cho hội đồng tự đọc thêm.

---

## Slide 8: Mô hình dữ liệu (ERD) & Phân quyền RBAC
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 95 giây

### Nội dung slide (bullet trình chiếu)
**Các collection chính & quan hệ 1-nhiều:**
```
User          (độc lập — chủ thể thao tác + chủ sở hữu Project/Trip)
ROV  ──1:N──▶ Project ──1:N──▶ Trip ──1:N──▶ SensorData
                                        ├──1:N──▶ DVLData
                                        ├──1:N──▶ SonarFile
                                        ├──1:N──▶ Media
                                        └──1:N──▶ Snapshot (Evidence: photo/clip)
Notification  (gắn với User, không phụ thuộc cascade delete)
AuditLog      (ghi lại hành động: user, action, entity, entityId)
```
- **Project** = chuyến khảo sát lớn (gắn 1 ROV, chứa nhiều Trip)
- **Trip** = 1 lần lặn cụ thể (chứa dữ liệu sensor/DVL/sonar/media/snapshot)

**Bảng phân quyền RBAC:**

| Tính năng | admin | operator | viewer |
|-----------|-------|----------|--------|
| Quản lý user | ✅ | ❌ | ❌ |
| CRUD ROV | ✅ | Tạo/Sửa | Chỉ xem |
| CRUD Project/Trip | ✅ | Tạo/Sửa | Chỉ xem |
| Upload media | ✅ | ✅ | ❌ |
| Xóa media (bulk) | ✅ | ❌ | ❌ |
| Xem media | ✅ | ✅ | ✅ |
| Export CSV/PDF | ✅ | ✅ | ❌ |
| Upload sensor data | ❌ | ✅ | ❌ |
| Xem audit log | ✅ | ❌ | ❌ |
| Generate AI summary | ✅ | ✅ | ❌ |

### Kịch bản thuyết trình (lời nói)
> Về mô hình dữ liệu, hệ thống được tổ chức theo quan hệ phân cấp một-nhiều rất rõ ràng, phản ánh đúng thực tế nghiệp vụ.
>
> Ở tầng cao nhất là **ROV** — thiết bị lặn vật lý. Một ROV có thể được gán cho nhiều **Project** — tức các chuyến khảo sát lớn. Mỗi Project lại chứa nhiều **Trip** — tức từng lần lặn cụ thể bên trong chuyến khảo sát đó. Em xin lưu ý một điểm quan trọng về mặt thuật ngữ: trong quá trình làm đồ án, theo yêu cầu của giảng viên hướng dẫn, em đã đổi tên khái niệm từ Trip/Dive ban đầu thành **Project/Trip** như hiện tại, để phù hợp hơn với thuật ngữ chuẩn trong lĩnh vực vận hành ROV.
>
> Từ mỗi Trip, dữ liệu tiếp tục phân nhánh thành nhiều loại: SensorData chứa các bản ghi cảm biến theo thời gian; DVLData chứa dữ liệu quỹ đạo định vị; SonarFile chứa file quét sonar; Media chứa video và ảnh; và Snapshot là hệ thống bằng chứng — cho phép operator chụp nhanh một khung hình hoặc đánh dấu một đoạn clip quan trọng trong lúc xem lại video.
>
> Ngoài ra, hệ thống còn có hai collection hỗ trợ xuyên suốt: Notification phục vụ thông báo thời gian thực, và AuditLog ghi lại toàn bộ hành động quan trọng của người dùng để phục vụ truy vết.
>
> Về phân quyền, như đã giới thiệu, hệ thống có ba vai trò. Bảng trên slide thể hiện chi tiết quyền hạn của từng vai trò trên từng tính năng cụ thể. Có thể thấy, **viewer** chỉ có quyền xem; **operator** được tạo, sửa Project/Trip, upload dữ liệu sensor và media, nhưng không được xóa hàng loạt hay quản lý người dùng; còn **admin** có toàn quyền, bao gồm cả những thao tác nhạy cảm như xóa tài nguyên, quản lý user, và xem audit log. Cơ chế phân quyền này được áp dụng nhất quán ở cả hai tầng: tầng route của Backend thông qua middleware kiểm tra vai trò, và tầng giao diện Frontend để ẩn đi các chức năng người dùng không có quyền sử dụng.

### Ghi chú (nếu có)
Nên vẽ ERD dạng hộp-mũi tên bằng draw.io thay vì text thuần. Nếu hội đồng hỏi "vì sao GPS lưu ở Trip mà không phải Project" — trả lời: vì mỗi lần lặn (Trip) trong cùng 1 chuyến khảo sát (Project) có thể diễn ra ở vị trí khác nhau, nên GPS phải gắn ở cấp Trip mới chính xác.
