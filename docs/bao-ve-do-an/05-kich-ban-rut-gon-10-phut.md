# Kịch bản thuyết trình RÚT GỌN — đúng 10 phút (600 giây)

**Bản đã sửa sau góp ý phản biện (2026-07-08 → 2026-07-09):** góp ý thứ nhất là phần mở đầu nhảy thẳng vào kiến trúc kỹ thuật mà chưa giải thích ROV là gì, GCS là gì, web này chức năng gì. Góp ý thứ hai là nên có 1 slide mô tả rõ **cấu trúc thư mục dữ liệu đầu vào** (cụ thể hoá phần "đầu vào" bằng ví dụ thật). Bản này đã thêm 3 khối mới ở đầu (**ROV & GCS là gì**, **Web này làm gì — Đầu vào/Đầu ra**, **Cấu trúc thư mục dữ liệu đầu vào**) trước khi vào kiến trúc, đồng thời cắt gọn các phần khác để vẫn giữ đúng 10 phút.

Đây là bản cắt gọn từ 30 slide đầy đủ (file 01-04) xuống còn **12 khối nội dung, tổng đúng 10 phút**. Bạn có thể tách mỗi khối thành nhiều slide PowerPoint thật (chèn ảnh/sơ đồ) như deck bạn đã làm — số khối ở đây là để tính thời gian nói, không bắt buộc = số slide PowerPoint.

**Khuyến nghị quan trọng:** với chỉ 10 phút, **không nên demo trực tiếp phần mềm** trong lúc thuyết trình — rủi ro lỗi mạng/service chưa khởi động sẽ nuốt hết thời gian quý giá. Thay vào đó:
- Chèn **video quay màn hình sẵn** (10-15 giây/clip, đã cắt gọn, không tiếng) vào đúng khối 10 và 11 để minh hoạ Cockpit Layout + Video-Sensor Sync + YOLO detect — vừa an toàn vừa trực quan hơn ảnh tĩnh.
- Phần demo trực tiếp đầy đủ để dành cho buổi phản biện sơ bộ hoặc phần hỏi-đáp sau khi trình bày (xem file `06-kich-ban-demo-chi-tiet.md`).

---

## Khối 1: Mở đầu
**Thời lượng:** 15 giây

### Nội dung slide
- ĐẠI HỌC BÁCH KHOA HÀ NỘI — ĐỒ ÁN TỐT NGHIỆP
- **Xây dựng hệ thống quản lý ROV (Remotely Operated Vehicle)**
- [Tên sinh viên] — [MSSV] — GVHD: [Tên GVHD]

### Kịch bản thuyết trình
> Kính thưa quý thầy cô trong hội đồng, em tên là [Tên sinh viên], mã số sinh viên [MSSV]. Em xin trình bày đồ án tốt nghiệp với đề tài "Xây dựng hệ thống quản lý ROV", dưới sự hướng dẫn của thầy/cô [GVHD].

---

## Khối 2: ROV & GCS là gì?
**Thời lượng:** 50 giây

### Nội dung slide
- **ROV (Remotely Operated Vehicle)** = robot lặn không người lái, nối dây cáp với tàu/thuyền trên mặt nước, gắn camera + đèn + cảm biến (độ sâu, nhiệt độ, la bàn...) để khảo sát dưới nước — con người không lặn xuống, chỉ điều khiển từ xa
- **GCS (trạm điều khiển)** = đặt trên tàu/thuyền, nơi vận hành viên (operator) ngồi cầm tay điều khiển ROV qua dây cáp, màn hình GCS hiển thị hình ảnh trực tiếp từ camera + **ghi lại toàn bộ dữ liệu trong suốt quá trình lặn** (video, cảm biến...)
- *(dùng ảnh ROV thật đã có sẵn trong slide "Đặt vấn đề" của bạn)*

### Kịch bản thuyết trình
> Trước khi vào chi tiết, em xin giải thích nhanh hai khái niệm sẽ dùng xuyên suốt bài trình bày. ROV — Remotely Operated Vehicle — là một robot lặn không người lái, được nối với tàu bằng một dây cáp, có gắn camera, đèn và các cảm biến đo độ sâu, nhiệt độ. Con người không trực tiếp lặn xuống, mà điều khiển ROV từ xa, tương tự như lái một chiếc flycam nhưng hoạt động dưới nước và có dây nối.
>
> GCS — trạm điều khiển — là khu vực đặt trên tàu, nơi vận hành viên ngồi cầm tay điều khiển để lái ROV, đồng thời màn hình ở đây hiển thị hình ảnh trực tiếp từ camera của ROV. Quan trọng hơn, trong suốt quá trình lặn, chính GCS là nơi ghi lại toàn bộ dữ liệu — video, ảnh, và các chỉ số cảm biến — vào bộ nhớ tại chỗ.

### Ghi chú
Đây là slide quan trọng nhất để hội đồng "vào bài" — nên có ảnh minh họa thật (ROV, hoặc sơ đồ tàu-dây cáp-ROV) thay vì chỉ chữ.

---

## Khối 3: Đặt vấn đề
**Thời lượng:** 40 giây

### Nội dung slide
- GCS ghi dữ liệu **offline, rời rạc** — ngoài khơi không có wifi nên không tự động gửi lên đâu cả
- Sau mỗi chuyến, muốn xem lại phải **đối chiếu thủ công** giữa video và file CSV cảm biến — tốn thời gian, dễ bỏ sót
- Không có nơi lưu trữ tập trung lịch sử các chuyến khảo sát → khó tra cứu, khó phát hiện bất thường, khó tìm lại bằng chứng quan trọng

### Kịch bản thuyết trình
> Vấn đề thực tế nảy sinh từ chính đặc điểm vận hành này: vì ngoài khơi không có kết nối mạng, GCS chỉ có thể ghi dữ liệu offline, rời rạc theo từng chuyến. Khi về bờ, muốn phân tích lại, người vận hành phải tự tay đối chiếu video với file CSV cảm biến để tìm đúng thời điểm — tốn thời gian và dễ bỏ sót. Ngoài ra, không có nơi lưu trữ tập trung khiến việc tra cứu lịch sử các chuyến khảo sát cũ gần như không thể.

---

## Khối 4: Web này làm gì? — Đầu vào, Đầu ra, Người dùng
**Thời lượng:** 65 giây

### Nội dung slide
```
ĐẦU VÀO                    HỆ THỐNG WEB LÀM GÌ              ĐẦU RA
────────────                ──────────────────              ──────────────
Video, ảnh          │                                │  Giao diện xem lại
File CSV cảm biến   │──▶  Lưu trữ có tổ chức          │  video + biểu đồ
File DVL (định vị)  │     (theo Project → Trip)       │  Cảnh báo bất thường
File Sonar          │     Phân tích tự động           │  (tô đỏ trên chart)
(do GCS ghi ra,      │     (Z-Score, YOLO, AI tóm tắt)│  Video có khoanh vùng
 operator upload     │                                │  vật thể (AI)
 lên sau khi về bờ)  │                                │  Báo cáo tóm tắt tự động
```
**3 vai trò sử dụng (Use Case):**
- **Operator** — upload dữ liệu, tạo/quản lý chuyến khảo sát, xem lại & chạy phân tích AI
- **Viewer** — chỉ xem lại dữ liệu và báo cáo (không được sửa/xóa/upload)
- **Admin** — mọi quyền của Operator + quản lý tài khoản người dùng + xem nhật ký thao tác

### Kịch bản thuyết trình
> Vậy hệ thống Web mà em xây dựng cụ thể làm gì? Nói đơn giản nhất: **đầu vào** là toàn bộ dữ liệu thô mà GCS đã ghi lại — video, ảnh, file cảm biến, file định vị, file sonar — được operator upload lên sau khi tàu về bờ. Hệ thống sẽ **lưu trữ có tổ chức** theo từng chuyến khảo sát, và **tự động phân tích**: phát hiện điểm bất thường trong cảm biến, nhận diện vật thể trong video bằng AI, và tự viết báo cáo tóm tắt. **Đầu ra** là một giao diện web cho phép xem lại toàn bộ những thứ đó một cách trực quan.
>
> Về người dùng, hệ thống phục vụ ba vai trò: Operator là người trực tiếp upload và quản lý dữ liệu; Viewer chỉ cần xem lại kết quả, ví dụ khách hàng hoặc người giám sát; và Admin có toàn quyền quản trị hệ thống.

### Ghi chú
Đây chính là slide hội đồng cần để hiểu "web này để làm gì" trước khi nghe kiến trúc — nên vẽ lại thành sơ đồ Input → Process → Output đơn giản (3 hộp nối tiếp) thay vì bảng ASCII, và có thể vẽ thêm 1 sơ đồ Use Case UML nhỏ (3 actor: Operator/Viewer/Admin, nối vào các hình oval "Upload dữ liệu", "Xem báo cáo", "Quản lý người dùng"...) nếu còn thời gian chuẩn bị.

---

## Khối 5 (MỚI): Cấu trúc thư mục dữ liệu đầu vào
**Thời lượng:** 40 giây

### Nội dung slide
```
trip_20260623_112136/              ← 1 thư mục = 1 lần lặn, do GCS xuất ra
├── trip_master.json               ← file mô tả tổng hợp (tùy chọn)
├── Camera/
│   └── record_20260623_112414.mp4      → video
├── Sensors/
│   └── log_20260623_112136.csv         → dữ liệu cảm biến (CSV)
├── DVL/
│   └── DVL_20260623_112414.json        → dữ liệu định vị dưới nước
├── Sonar/
│   └── sonar_20260623_112414.sonar     → dữ liệu quét sonar
└── Snapshots/
    └── capture_20260623_113445.png     → ảnh chụp nhanh trong lúc lặn
```
- Tên file **nhúng sẵn mốc thời gian** (`_YYYYMMDD_HHMMSS`) → hệ thống tự đọc, không cần nhập tay
- Operator chỉ cần **chọn thẳng cả thư mục** `trip_20260623_112136/` này khi upload — không cần tự sắp xếp hay đổi tên file

### Kịch bản thuyết trình
> Để cụ thể hoá phần đầu vào vừa nói, đây là ví dụ cấu trúc thư mục thật mà GCS xuất ra sau mỗi lần lặn — một thư mục đặt tên theo thời gian bắt đầu, chia thành các thư mục con Camera, Sensors, DVL, Sonar, Snapshots tương ứng từng loại dữ liệu, mỗi tên file đã nhúng sẵn mốc thời gian ghi. Khi upload, operator chỉ cần chọn thẳng cả thư mục này — không cần sắp xếp tay từng file — hệ thống sẽ tự động đọc và phân loại theo đúng tên và thư mục con.

### Ghi chú
Nếu deck của bạn dùng font monospace cho khối cây thư mục này sẽ dễ đọc hơn nhiều — tránh dùng font thường vì các ký tự `├──`/`└──` sẽ lệch dòng.

---

## Khối 6: Mục tiêu đề tài
**Thời lượng:** 30 giây

### Nội dung slide
1. Xây dựng web quản lý ROV / Project / Trip tập trung
2. Trực quan hoá dữ liệu cảm biến + tự động phát hiện bất thường (Z-Score)
3. Tích hợp AI: YOLOv8 nhận diện vật thể, Gemini tóm tắt tự động
4. Bảo mật, phân quyền, thông báo thời gian thực

### Kịch bản thuyết trình
> Từ bối cảnh và chức năng đã nêu, đồ án đặt ra bốn mục tiêu: xây dựng hệ thống quản lý tập trung cho ROV, chuyến khảo sát và từng lần lặn; trực quan hoá dữ liệu cảm biến kèm tự động phát hiện bất thường; tích hợp AI nhận diện vật thể và tự động tóm tắt; và đảm bảo phân quyền, bảo mật, thông báo thời gian thực.

---

## Khối 7: Kiến trúc hệ thống & Công nghệ
**Thời lượng:** 60 giây

### Nội dung slide
```
Frontend (React+Vite) ↔ Backend (Express) ↔ MongoDB Atlas + AWS S3
                                            ↔ Redis + Bull Queue
                                            ↔ YOLOv8 microservice (Python FastAPI)
                                            ↔ Gemini 2.5 Flash API
```
- SSE (không phải WebSocket) — chỉ cần đẩy 1 chiều server→client
- Bull Queue — AI/YOLO call mất 5-15s, không block HTTP request
- YOLOv8 tách microservice Python riêng — hệ sinh thái AI/CV (Ultralytics, OpenCV) chỉ mạnh trên Python

### Kịch bản thuyết trình
> Về kiến trúc, hệ thống gồm Frontend React giao tiếp với Backend Express qua REST và SSE. Backend kết nối tới MongoDB Atlas cho dữ liệu có cấu trúc, AWS S3 cho video/ảnh qua presigned URL, và Redis kết hợp Bull Queue để xử lý bất đồng bộ các tác vụ nặng.
>
> Em xin nhấn mạnh hai quyết định thiết kế: chọn Server-Sent Events thay vì WebSocket vì chỉ cần đẩy dữ liệu một chiều từ server xuống client; và tách YOLOv8 thành microservice Python riêng, giao tiếp qua Bull Queue bất đồng bộ, vì phân tích ảnh/video có thể mất vài giây đến vài chục giây — xử lý đồng bộ sẽ block request HTTP, và hệ sinh thái AI/Computer Vision hiện mạnh nhất trên Python.

---

## Khối 8: Nghiệp vụ & Mô hình dữ liệu
**Thời lượng:** 35 giây

### Nội dung slide
- **Project** = chuyến khảo sát lớn (1 ROV, nhiều Trip) · **Trip** = 1 lần lặn cụ thể (chứa sensor/DVL/sonar/media/snapshot)
- RBAC 3 vai trò như đã nêu ở khối "Web này làm gì" — áp dụng nhất quán ở cả Backend (middleware) lẫn Frontend (ẩn UI)

### Kịch bản thuyết trình
> Về mô hình dữ liệu, em phân hai cấp: Project là chuyến khảo sát lớn gắn với một ROV, chứa nhiều Trip; Trip là một lần lặn cụ thể, gắn với dữ liệu sensor, DVL, sonar, media và evidence. Ba vai trò người dùng đã giới thiệu được áp dụng nhất quán ở cả Backend và Frontend.

---

## Khối 9: Các chức năng nền tảng
**Thời lượng:** 50 giây

### Nội dung slide
- **Auth:** JWT (access 15p/refresh 7 ngày) + Google OAuth2, Redis blacklist khi logout
- **ROV/Project/Trip:** CRUD đầy đủ, filter nâng cao, cascade delete
- **Upload Folder:** như cấu trúc thư mục đã trình bày — hệ thống tự phân loại + parse timestamp + reverse-geocode GPS
- **Sensor Data:** upload CSV, **Anomaly Detection Z-Score** (`|z|>2.5`)
- **Dashboard:** stat cards + 3 biểu đồ + activity timeline

### Kịch bản thuyết trình
> Về các chức năng nền tảng: hệ thống có xác thực JWT kết hợp Google OAuth, module ROV/Project/Trip với CRUD đầy đủ và cascade delete. Tính năng Upload Folder cho phép operator chọn thẳng thư mục dữ liệu như vừa trình bày, hệ thống tự phân loại và parse timestamp. Sensor data được trực quan hoá bằng biểu đồ kèm Z-Score phát hiện bất thường, và Dashboard tổng hợp số liệu qua nhiều phép tổng hợp MongoDB song song.

---

## Khối 10: Điểm nhấn — TripDetailPage Cockpit & Video-Sensor Sync
**Thời lượng:** 80 giây

### Nội dung slide
- Trang `/trips/:id` — layout **"cockpit" 3 cột** không cuộn: trái (map+KPI), giữa (video), phải (gauge Artificial Horizon/Compass + cảnh báo)
- **Video-Sensor Sync**: đường ReferenceLine chạy theo trên biểu đồ khi video phát
- Công thức: `chartTimestamp = recordedAt + currentTime × 1000` → tìm điểm sensor gần nhất
- *(chèn video demo ngắn tại đây)*

### Kịch bản thuyết trình
> Điểm nhấn công nghệ đầu tiên là trang chi tiết Trip, thiết kế theo triết lý "cockpit" — buồng lái — chia ba cột: bản đồ và KPI cảm biến bên trái, video ở giữa, đồng hồ mô phỏng góc nghiêng/hướng đi và cảnh báo bất thường bên phải, tất cả vừa đúng một màn hình không cần cuộn.
>
> Bài toán khó nhất em giải quyết ở đây là đồng bộ video với dữ liệu cảm biến — hai nguồn hoàn toàn độc lập. Em dùng trường `recordedAt` — thời điểm bắt đầu quay — cộng với thời gian phát hiện tại của video để tính ra một mốc thời gian tuyệt đối, từ đó tìm điểm dữ liệu cảm biến gần nhất và vẽ một đường tham chiếu di chuyển đồng bộ trên biểu đồ khi video đang phát.

---

## Khối 11: Điểm nhấn — Tích hợp AI (YOLOv8, Evidence, Gemini Summary)
**Thời lượng:** 95 giây

### Nội dung slide
- **YOLOv8 Object Detection**: microservice Python, xử lý bất đồng bộ qua Bull Queue; ảnh dùng `predict`, video dùng `track` + **ByteTrack** cho bbox di chuyển mượt theo object
- Popover chọn model + điều chỉnh **confidence** (quan trọng vì ảnh dưới nước mờ/tối)
- **Evidence System**: chụp Photo hoặc ghi Clip ngay trong lúc xem video → phân tích AI riêng
- **AI Project Summary**: Project completed → Gemini 2.5 Flash tóm tắt song ngữ Việt/Anh, dùng `locationName` thay vì tọa độ số
- *(chèn video demo ngắn: bật Detect toggle + chụp evidence)*

### Kịch bản thuyết trình
> Điểm nhấn công nghệ thứ hai là tích hợp AI xuyên suốt hệ thống. Đầu tiên là nhận diện vật thể bằng YOLOv8, chạy trên microservice Python riêng, bất đồng bộ qua Bull Queue để không làm chậm trải nghiệm người dùng. Với video, em dùng ByteTrack để gán mã theo dõi ổn định cho từng vật thể xuyên suốt nhiều khung hình, giúp khung nhận diện di chuyển mượt theo đúng vị trí thực tế. Operator cũng tự điều chỉnh được ngưỡng độ tin cậy, vì hình ảnh dưới nước thường mờ và thiếu sáng.
>
> Thứ hai là hệ thống Evidence — cho phép operator, ngay trong lúc xem lại video, chụp nhanh một khung hình hoặc đánh dấu một đoạn clip quan trọng làm bằng chứng, phân tích AI riêng cho đúng đoạn đó mà không cần chạy lại toàn bộ video dài.
>
> Thứ ba là tính năng tự động sinh tóm tắt chuyến khảo sát bằng Gemini 2.5 Flash, cũng chạy bất đồng bộ, sử dụng tên địa danh thực tế thay vì tọa độ số để bản tóm tắt dễ đọc hơn, trả về đồng thời cả bản tiếng Việt và tiếng Anh.

---

## Khối 12: Kết quả, Hạn chế, Hướng phát triển & Lời cảm ơn
**Thời lượng:** 40 giây

### Nội dung slide
- **Kết quả:** hoàn thành đầy đủ các module trên; kiểm thử tự động **37/37 test case pass**
- **Hạn chế:** Email Notification chưa triển khai, mới dừng ở thiết kế
- **Hướng phát triển:** fine-tune YOLO riêng cho môi trường dưới nước + cải thiện tracking, GCS tự động đồng bộ khi có kết nối ngoài khơi
- Lời cảm ơn GVHD, hội đồng

### Kịch bản thuyết trình
> Qua đồ án, em đã hoàn thành đầy đủ các module đã trình bày, kiểm thử tự động đạt 37 trên 37 trường hợp. Hạn chế còn lại là tính năng gửi email thông báo tự động chưa triển khai, mới dừng ở thiết kế. Hướng phát triển tiếp theo, em dự định huấn luyện model YOLO chuyên biệt cho môi trường dưới nước, cải thiện độ ổn định tracking, và nghiên cứu cho GCS tự động đồng bộ khi có kết nối ngoài khơi.
>
> Em xin chân thành cảm ơn thầy/cô [GVHD] đã tận tình hướng dẫn, và cảm ơn quý thầy cô trong hội đồng đã lắng nghe. Em xin phép kết thúc phần trình bày và sẵn sàng lắng nghe câu hỏi. Em xin cảm ơn.

---

## Kiểm tra lại tổng thời lượng

| Khối | Nội dung | Giây |
|---|---|---|
| 1 | Mở đầu | 15 |
| 2 | ROV & GCS là gì | 50 |
| 3 | Đặt vấn đề | 40 |
| 4 | Web này làm gì — Đầu vào/Đầu ra/Use case | 65 |
| 5 | **Cấu trúc thư mục dữ liệu đầu vào (mới)** | 40 |
| 6 | Mục tiêu | 30 |
| 7 | Kiến trúc & Công nghệ | 60 |
| 8 | Nghiệp vụ & Mô hình dữ liệu | 35 |
| 9 | Chức năng nền tảng | 50 |
| 10 | Cockpit & Video-Sensor Sync | 80 |
| 11 | Tích hợp AI | 95 |
| 12 | Kết quả/Hạn chế/Cảm ơn | 40 |
| **Tổng** | | **600 giây = 10 phút** |

**Những gì đã đổi ở lần sửa này:**
- Thêm **Khối 5 (mới)** ngay sau "Web này làm gì": cấu trúc thư mục dữ liệu đầu vào thật (ví dụ `trip_20260623_112136/` với các thư mục con Camera/Sensors/DVL/Sonar/Snapshots) — cụ thể hoá khái niệm "đầu vào" bằng ví dụ nhìn thấy được, thay vì chỉ liệt kê tên loại file.
- Rút gọn nhẹ khối "Đặt vấn đề" (45→40s), "Mục tiêu" (35→30s), "Kiến trúc & Công nghệ" (70→60s), "Nghiệp vụ & Mô hình dữ liệu" (40→35s), "Chức năng nền tảng" (65→50s, bỏ bớt phần giải thích Upload Folder vì đã có ví dụ cụ thể ở khối 5) để bù đúng 40 giây cho khối mới.
- Khối 10-11 (điểm nhấn công nghệ — Cockpit/Sync/AI) giữ nguyên hoàn toàn vì là phần ghi điểm chính, không đụng vào.

**Lưu ý luyện tập:** tập đọc thành tiếng có bấm giờ ít nhất 2-3 lần. Nếu bị vấp hoặc chậm hơn dự kiến, ưu tiên cắt bớt ở khối 9 (chức năng nền tảng) — **tuyệt đối không cắt khối 2, 4, 5** vì đó chính là phần thầy phản biện yêu cầu phải rõ ràng.
