# Phần C — Chức năng nổi bật / Điểm nhấn công nghệ (Slide 17-24)

---

## Slide 17: TripDetailPage — Thiết kế Cockpit Layout 3 cột
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2 phút

### Nội dung slide (bullet trình chiếu)
- Trang `/trips/:id` — nơi operator xem lại toàn bộ dữ liệu 1 lần lặn (Trip) sau khi ROV về bờ
- Layout "buồng lái" (cockpit) 3 cột, không cuộn trang trên desktop (`h-[calc(100vh-4rem)] overflow-hidden`)
  - **Header**: status badge, tên trip, project/location, nút hành động, Export
  - **Cột trái**: bản đồ vị trí (Location) + KPI cards (Depth / Temperature / Pressure trung bình)
  - **Cột giữa**: video player nền đen, playlist thu gọn dạng overlay/thanh ngang
  - **Cột phải**: đồng hồ bay Artificial Horizon + Compass Rose (SVG), panel cảnh báo bất thường
  - **Khu vực dưới**: biểu đồ 3 tab — Environment / Navigation / System
- Responsive: mobile chuyển sang layout xếp chồng, cho phép cuộn dọc

### Kịch bản thuyết trình (lời nói)
> Kính thưa hội đồng, đây là trang chi tiết một lần lặn — TripDetailPage, được em thiết kế theo triết lý "cockpit", tức buồng lái, giống như màn hình điều khiển của phi công hay của các hệ thống giám sát công nghiệp. Lý do em chọn hướng thiết kế này là vì sau mỗi lần lặn, operator cần xem lại đồng thời rất nhiều loại dữ liệu — video quay được, vị trí GPS, các thông số cảm biến như độ sâu, nhiệt độ, áp suất, và cả tư thế chuyển động của ROV — mà không muốn phải cuộn qua nhiều màn hình hay chuyển tab liên tục.

> Em chia màn hình thành ba cột chính. Cột trái hiển thị bản đồ vị trí lặn và ba thẻ chỉ số quan trọng nhất — độ sâu, nhiệt độ, áp suất trung bình — dạng KPI card để operator nắm nhanh tình trạng chuyến lặn. Cột giữa là trái tim của trang — trình phát video nền đen, có thanh công cụ trượt phía trên và playlist có thể thu gọn để không chiếm diện tích màn hình. Cột phải là hai đồng hồ mô phỏng theo phong cách thiết bị bay thật — Artificial Horizon thể hiện góc nghiêng pitch/roll, và Compass Rose thể hiện hướng yaw — cùng với panel cảnh báo các điểm bất thường phát hiện được. Phía dưới cùng là khu vực biểu đồ có ba tab, cho phép operator chuyển đổi xem dữ liệu môi trường, dữ liệu điều hướng, hoặc dữ liệu hệ thống như điện áp và pin.

> Toàn bộ layout này được tính toán để vừa đúng một màn hình 1080p mà không cần cuộn — đây là một bài toán CSS không đơn giản khi phải cân bằng giữa nhiều thành phần động, và em đã dùng ResizeObserver để tự động điều chỉnh vị trí playlist tùy theo không gian video còn trống.

### Ghi chú (nếu có)
Nên demo trực tiếp bằng 1 trip có đầy đủ dữ liệu (video + sensor + GPS) để hội đồng thấy toàn bộ layout hoạt động đồng thời — không dùng ảnh chụp màn hình tĩnh vì phần "không cuộn trang" là điểm nhấn khó truyền tải qua ảnh.

---

## Slide 18: Video-Sensor Sync — Đồng bộ thời gian thực
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2-2.5 phút

### Nội dung slide (bullet trình chiếu)
- 2 chế độ hoạt động dựa trên field `media.recordedAt` (thời điểm bắt đầu quay)
  - **Video có metadata**: đường tham chiếu dọc (ReferenceLine) chạy theo trên biểu đồ sensor khi video phát; brush tự động "zoom" đúng khoảng thời gian video
  - **Video thường** (không có `recordedAt`): phát playlist nối tiếp, chart hiển thị độc lập toàn bộ dữ liệu
- Công thức đồng bộ: `chartTimestamp = recordedAt(ms) + video.currentTime × 1000`
- Badge "LIVE SYNC" hiện góc video khi đang đồng bộ
- Cùng cơ chế UTC-ms áp dụng đồng thời cho bản đồ trajectory (DVL) và sonar viewer

### Kịch bản thuyết trình (lời nói)
> Một trong những bài toán khó nhất của đồ án là làm sao đồng bộ được video với dữ liệu cảm biến, vì đây là hai nguồn dữ liệu hoàn toàn độc lập — video có thời lượng tính bằng giây phát, còn cảm biến có dấu thời gian tuyệt đối theo UTC. Em giải quyết bằng cách dùng trường `recordedAt` lưu trong Media — là thời điểm bắt đầu quay video, được nhập tay hoặc tự động parse từ tên file hoặc từ file manifest `trip_master.json` mà ROV xuất ra.

> Khi video đang phát, cứ mỗi sự kiện `timeupdate` của thẻ video HTML5, em tính một mốc thời gian tuyệt đối gọi là `chartTimestamp`, bằng công thức: `recordedAt` cộng với `currentTime` của video nhân một nghìn để đổi ra mili-giây. Giá trị này sau đó được dùng để tìm điểm dữ liệu cảm biến gần nhất trong mảng đã sắp xếp, rồi vẽ một đường thẳng đứng — ReferenceLine của thư viện Recharts — chạy theo đúng vị trí đó trên biểu đồ. Người xem sẽ thấy đường kẻ đỏ di chuyển đồng bộ hoàn toàn với những gì đang diễn ra trong video.

> Cùng một cơ chế mốc thời gian UTC tuyệt đối này, em còn dùng để đồng bộ luôn bản đồ quỹ đạo DVL — điểm đánh dấu di chuyển theo đúng vị trí ROV tại thời điểm đó — và cả sonar viewer, tự động chuyển đúng file sonar và đúng khung quét tương ứng. Với video không có metadata thời gian, hệ thống tự động chuyển sang chế độ "graceful degrade" — không đồng bộ, nhưng vẫn hiển thị đầy đủ dữ liệu độc lập, không bị lỗi hay trắng màn hình.

> Ngoài ra em còn xây dựng cơ chế tự động "frame" thanh brush — tức thanh chọn khoảng thời gian hiển thị của biểu đồ — để khi chọn một video trong playlist, biểu đồ tự động zoom đúng vào khoảng thời gian video đó bao phủ, có thêm biên đệm mười phần trăm hai bên để giữ ngữ cảnh, và nếu người dùng tự kéo tay thì tính năng tự động này sẽ tạm ngưng cho đến khi chọn video khác.

### Ghi chú (nếu có)
Demo: phát 1 video có `recordedAt`, chỉ vào đường ReferenceLine di chuyển trên chart bên dưới đồng thời với video đang chạy — đây là hiệu ứng trực quan nhất, nên để camera/máy chiếu lấy được cả 2 khu vực cùng lúc.

### Câu hỏi phản biện dự kiến
- **"Nếu không có đồng hồ thời gian thực chính xác giữa các thiết bị (video, sensor) trên ROV thì độ lệch đồng bộ sẽ như thế nào?"** → Trả lời: độ chính xác phụ thuộc vào nguồn `recordedAt` — nếu lấy từ manifest `trip_master.json` thì chính xác đến mili-giây (do ROV tự ghi timestamp phiên quay), còn nếu suy ra từ tên file thì chỉ chính xác đến giây; đồ án ưu tiên dùng manifest khi có, fallback về tên file, và cuối cùng là fallback theo timestamp dòng đầu của sensor CSV — độ chính xác giảm dần theo 3 mức nhưng luôn có phương án dự phòng.
- **"Vì sao chọn ReferenceLine của Recharts thay vì tự vẽ canvas riêng?"** → Trả lời: Recharts đã tối ưu sẵn việc re-render theo props thay đổi và tương thích tốt với các control khác (Brush, Legend, Tooltip) trong cùng hệ sinh thái, tránh phải đồng bộ thủ công 2 hệ render khác nhau (SVG chart và canvas riêng).

---

## Slide 19: YOLOv8 Object Detection — Kiến trúc AI Microservice
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2.5 phút

### Nội dung slide (bullet trình chiếu)
- Tách riêng microservice Python (FastAPI) thay vì tích hợp vào Node.js backend
- Giao tiếp qua Bull Queue (Redis-backed) — xử lý bất đồng bộ, không block HTTP request
- Ảnh: `model.predict()` một lần
- Video: `model.track()` theo từng frame, sample interval thích ứng theo độ dài video
  - < 30s → 0.2s/frame · 30-180s → 0.5s/frame · ≥ 180s → 1.0s/frame
- Cross-class NMS (IoU > 0.3) — loại bỏ detection trùng lặp giữa các class khác nhau chồng lên cùng 1 vật thể
- Timeout Bull job: 300 giây (5 phút) cho video dài trên VPS

### Kịch bản thuyết trình (lời nói)
> Tính năng nhận diện vật thể bằng YOLOv8 là một trong những điểm nhấn công nghệ cao nhất của đồ án. Em quyết định tách hoàn toàn phần xử lý AI này thành một microservice Python riêng biệt, dùng FastAPI, thay vì cố gắng tích hợp trực tiếp vào backend Node.js. Lý do là vì hệ sinh thái AI/Computer Vision — cụ thể là thư viện Ultralytics chạy YOLOv8 và OpenCV để xử lý video — được hỗ trợ tốt nhất trong Python, trong khi Node.js không có thư viện tương đương đủ trưởng thành. Việc tách microservice còn giúp hai phần này scale độc lập — nếu sau này cần nâng cấp GPU cho việc suy luận AI, em chỉ cần thay đổi container YOLO mà không đụng đến toàn bộ backend chính.

> Hai service giao tiếp với nhau qua Bull Queue chạy trên nền Redis. Đây là điểm quan trọng cần nhấn mạnh: việc phân tích một bức ảnh có thể mất vài trăm mili-giây, nhưng một video dài vài phút có thể mất tới hàng chục giây thậm chí vài phút để xử lý trên CPU. Nếu xử lý đồng bộ ngay trong request HTTP, client sẽ phải chờ rất lâu và có nguy cơ timeout. Vì vậy khi operator bấm "Run Analysis", backend chỉ đẩy một job vào hàng đợi, trả về mã 202 ngay lập tức, rồi một worker chạy nền sẽ gọi sang service Python, đợi kết quả, lưu vào database, và đẩy thông báo qua SSE khi hoàn tất.

> Về mặt xử lý AI, với ảnh tĩnh em dùng hàm `predict` để chạy suy luận một lần. Với video, em dùng hàm `track` xử lý theo từng khung hình được lấy mẫu — không phân tích toàn bộ video vì sẽ quá tải, mà lấy mẫu thích ứng: video dưới 30 giây lấy mẫu mỗi 0.2 giây, từ 30 giây đến 3 phút lấy mỗi 0.5 giây, và trên 3 phút thì mỗi 1 giây — cân bằng giữa độ chi tiết và thời gian xử lý trên CPU. Ngoài ra em còn áp dụng một kỹ thuật gọi là cross-class Non-Max Suppression, tức là loại bỏ các khung nhận diện chồng lấn lên nhau dù thuộc các lớp khác nhau — vì đôi khi mô hình có thể nhầm lẫn phân loại cùng một vật thể thành hai lớp khác nhau ở cùng vị trí.

### Ghi chú (nếu có)
Chuẩn bị sẵn 1 video có vật thể rõ ràng (cá, rác thải, v.v.) đã upload trước để demo nút "Run Analysis" — vì xử lý video có thể mất 10-60 giây, nên bấm trước khi thuyết trình slide 20-21 để lúc demo kết quả đã sẵn sàng (SSE push xong).

### Câu hỏi phản biện dự kiến
- **"Tại sao không tích hợp YOLO trực tiếp vào Node.js bằng ONNX runtime hay TensorFlow.js?"** → Trả lời: hệ sinh thái Python (Ultralytics + OpenCV) hỗ trợ đầy đủ và ổn định hơn nhiều so với các binding YOLOv8 cho Node.js hiện tại; tách microservice cũng giúp cô lập rủi ro — nếu YOLO service down, chỉ tính năng phân tích bị ảnh hưởng, không kéo sập toàn bộ backend chính (đã có xử lý "graceful fail" khi service down).
- **"Nếu YOLO service bị down giữa lúc đang xử lý thì sao?"** → Trả lời: Bull job sẽ fail, có cấu hình `attempts` retry, job không thành công không ảnh hưởng luồng upload chính; `analysisStatus` sẽ ở trạng thái phù hợp để operator biết và có thể chạy lại.

---

## Slide 20: YOLOv8 — Model Switching, Confidence Tuning & Per-frame Tracking
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2.5 phút

### Nội dung slide (bullet trình chiếu)
- Popover "AI Analysis Settings" — chọn model + điều chỉnh ngưỡng confidence trước khi chạy
- `GET /media/models` — chỉ liệt kê model có file `.pt` thực tế tồn tại trên service (không hiện model "ảo")
- Thêm model mới: chỉ cần thả file `.pt` vào thư mục `yolo-service/` — không cần sửa code, tùy chọn khai báo thêm metadata (label, speed, warning)
- Confidence slider (0.1 - 0.9) — hạ thấp để bắt vật thể trong ảnh mờ/tối dưới nước, tăng cao để lọc false positive
- Per-frame bbox tracking bằng thuật toán ByteTrack (`tracker="bytetrack.yaml"`) — gán `trackId` ổn định xuyên suốt các frame
- Kết quả **overwrite** (ghi đè) labels cũ — không versioning lịch sử

### Kịch bản thuyết trình (lời nói)
> Sau khi có kiến trúc microservice, em nâng cấp thêm một lớp linh hoạt cho phép operator tùy chỉnh cách AI phân tích dữ liệu, thay vì chỉ có một nút "Re-analyze" cố định. Em xây dựng một popover nhỏ gọi là "AI Analysis Settings", xuất hiện ngay cạnh nút Detect trên thanh công cụ video, cho phép chọn model nhận diện và điều chỉnh độ nhạy trước khi chạy.

> Về việc chọn model, em thiết kế endpoint `GET /models` phía service Python quét toàn bộ file có đuôi `.pt` đang tồn tại thực sự trong thư mục — nghĩa là danh sách hiển thị luôn khớp với những gì service có thể chạy được, không bao giờ hiện một lựa chọn "chết". Điểm hay ở đây là quy ước đặt tên: nếu sau này em fine-tune một mô hình riêng cho ROV, ví dụ chuyên nhận diện rác thải hoặc sinh vật biển, em chỉ cần thả file trọng số vào đúng thư mục, không cần sửa một dòng code nào, hệ thống sẽ tự động nhận diện và hiển thị lên giao diện.

> Về ngưỡng confidence, đây là một chi tiết rất thực tế của bài toán ROV dưới nước — hình ảnh dưới nước thường mờ, thiếu sáng, độ tương phản thấp, khiến độ tin cậy của mô hình nhận diện thường thấp hơn nhiều so với ảnh trên cạn. Vì vậy em cho phép operator hạ ngưỡng confidence xuống thấp, ví dụ 0.15 đến 0.2, để bắt được nhiều vật thể hơn, hoặc tăng lên trên 0.5 nếu muốn lọc bớt các nhận diện không chắc chắn.

> Cuối cùng, và đây là phần kỹ thuật sâu nhất — thay vì chỉ lưu một khung nhận diện tĩnh cho mỗi loại vật thể, em dùng thuật toán ByteTrack tích hợp sẵn trong Ultralytics, gán một `trackId` ổn định cho từng vật thể xuyên suốt nhiều khung hình. Nhờ vậy khi operator xem lại video, khung bao — bounding box — sẽ di chuyển mượt mà theo đúng vị trí thực tế của vật thể trên màn hình, thay vì đứng yên một chỗ như trước đây. Phía frontend, em tìm khung hình gần nhất với thời điểm video đang phát trong phạm vi sai số 0.7 giây, đúng bằng khoảng sample interval của service, để hiển thị đúng bộ nhãn tại đúng thời điểm.

### Ghi chú (nếu có)
Demo: mở popover Analysis Settings, kéo slider confidence để hội đồng thấy giá trị thay đổi realtime; nếu đã có video phân tích xong từ trước, phát video và chỉ vào bbox di chuyển theo vật thể để minh họa per-frame tracking.

### Câu hỏi phản biện dự kiến
- **"ByteTrack có đảm bảo trackId không bị đổi giữa các frame khi vật thể bị che khuất tạm thời không?"** → Trả lời: ByteTrack có cơ chế theo dõi cả các detection có confidence thấp để duy trì track qua các khung hình bị che khuất ngắn hạn, nhưng nếu vật thể biến mất quá lâu hoặc tracker bị reset (mỗi lần gọi `/detect` mới là 1 tracking session độc lập, dùng `persist=False` ở frame đầu), track cũ sẽ không được khôi phục — đây là giới hạn chấp nhận được vì mục tiêu chính là hiển thị trực quan, không phải theo dõi định danh dài hạn.
- **"Tại sao kết quả phân tích lại overwrite thay vì lưu lịch sử qua các lần chạy?"** → Trả lời: vì kết quả là deterministic với cùng cặp model + confidence, việc versioning không mang lại giá trị thực tế cho phạm vi đồ án, và overwrite giúp đơn giản hóa schema, tránh phình dữ liệu không cần thiết — nếu mở rộng thực tế sau này có thể bổ sung collection lịch sử riêng.

---

## Slide 21: Evidence System — Bằng chứng Photo/Clip
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2.5 phút

### Nội dung slide (bullet trình chiếu)
- Operator đang xem video → chụp nhanh 1 khung hình (Photo) hoặc đánh dấu 1 đoạn clip (Start/Stop) → lưu vào collection `Snapshot` riêng biệt, tách khỏi Media Playlist
- Photo: canvas burn-in bounding box nếu đang bật overlay Detect — bbox "nướng" cố định vào ảnh PNG
- Clip: chỉ lưu `startTime`/`endTime` + thumbnail — không tạo file video mới, dùng lại presigned URL của video gốc
- Phân tích YOLO riêng cho từng evidence — video dài không cần re-analyze toàn bộ
- `EvidenceViewer` overlay: xem lại photo/clip kèm bbox, clip tự dừng đúng điểm kết thúc

### Kịch bản thuyết trình (lời nói)
> Tính năng thứ ba em muốn nhấn mạnh là Evidence System, hay hệ thống bằng chứng. Đây là tính năng xuất phát từ một nhu cầu rất thực tế trong vận hành ROV: khi operator đang xem lại một video dài, phát hiện một vật thể quan trọng — ví dụ một vết nứt trên đường ống, hoặc một loài sinh vật lạ — họ cần "ghim" lại khoảnh khắc đó ngay lập tức để phục vụ báo cáo, thay vì phải nhớ thời điểm rồi tua lại video dài sau này.

> Em thiết kế hai loại bằng chứng. Loại thứ nhất là Photo — operator bấm một nút, hệ thống chụp khung hình hiện tại của video bằng Canvas API của trình duyệt, và nếu đang bật chế độ hiện khung nhận diện, các bounding box sẽ được "nướng" trực tiếp vào ảnh bằng cách vẽ thêm lên canvas — nghĩa là ảnh xuất ra sẽ có sẵn khung nhận diện cố định vĩnh viễn, khác với overlay SVG chỉ tồn tại lúc xem trực tuyến. Loại thứ hai là Clip — operator bấm nút Start khi bắt đầu một đoạn quan trọng, nút chuyển sang màu đỏ và nhấp nháy để báo hiệu đang ghi, rồi bấm Stop khi kết thúc. Điều thú vị là em không tạo ra một file video vật lý mới cho clip này — mà chỉ lưu lại hai mốc thời gian bắt đầu và kết thúc, cùng với một ảnh thumbnail preview, rồi khi xem lại, hệ thống dùng chính presigned URL của video gốc trên S3, nhưng "kẹp" video chỉ phát trong đúng khoảng thời gian đó, tự động dừng lại khi đến điểm kết thúc clip.

> Bằng chứng được lưu trong một collection riêng gọi là Snapshot, hoàn toàn tách biệt khỏi danh sách media chính, và có thể được phân tích AI độc lập — tức là nếu video gốc dài 10 phút nhưng operator chỉ quan tâm 5 giây trong đó, họ có thể chạy YOLO chỉ trên đúng đoạn clip đó, tiết kiệm rất nhiều thời gian xử lý so với phân tích lại toàn bộ video.

### Ghi chú (nếu có)
Chuẩn bị sẵn video có vật thể để demo trực tiếp: bấm nút chụp Photo, sau đó bấm Start/Stop để tạo Clip, mở Evidence Panel để hội đồng thấy cả 2 loại bằng chứng đã lưu, click vào 1 evidence để mở EvidenceViewer.

### Câu hỏi phản biện dự kiến
- **"Nếu video gốc bị xóa thì Evidence (đặc biệt là Clip) có còn xem được không?"** → Trả lời: Clip phụ thuộc vào presigned URL của `parentMediaId` (video gốc) nên nếu video gốc bị xóa, clip sẽ không phát lại được nữa — đây là đánh đổi có chủ đích để tiết kiệm dung lượng lưu trữ (không nhân bản file video), phù hợp với ngữ cảnh Evidence được tạo và dùng trong cùng vòng đời của Trip; cascade delete (TASK 6d-0) đã đảm bảo khi xóa Trip/Media thì Snapshot liên quan cũng được xóa theo để tránh dữ liệu mồ côi.
- **"Vì sao ảnh Photo bị lỗi canvas tainted (CORS) thì xử lý thế nào?"** → Trả lời: nếu `canvas.toDataURL` thất bại do lỗi tainted canvas (khi video load cross-origin từ S3), frontend gửi `dataUrl = null` lên backend, và backend sẽ tự trích xuất khung hình từ file gốc bằng FFmpeg qua endpoint riêng — đảm bảo tính năng vẫn hoạt động dù trình duyệt chặn client-side capture.

---

## Slide 22: AI Project Summary — Tích hợp Gemini qua Bull Queue
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2 phút

### Nội dung slide (bullet trình chiếu)
- Project `completed` → operator/admin bấm "Generate Summary" → `POST /projects/:id/ai-summary` trả về 202 ngay lập tức
- Enqueue Bull job (`ai-summary` queue) → worker gọi **Gemini 2.5 Flash**, không block HTTP request
- Prompt gồm: tên project, `locationName` (từ reverse geocoding, ưu tiên hơn tọa độ số), thời gian, danh sách trip + status, số lượng media
- Output song ngữ Việt/Anh, tách bằng separator cứng `===VI===` / `===EN===`
- Timeout kép: 45s (nội bộ service) + 60s (Bull job) — tránh job treo vô hạn
- Lỗi phân loại "non-retryable" (429/quota/API key sai) → không lãng phí 3 lần retry
- Frontend poll `GET /projects/:id` mỗi 3s khi `status === 'pending'`

### Kịch bản thuyết trình (lời nói)
> Tính năng AI thứ hai, ở tầm project chứ không phải trip, là tự động sinh tóm tắt vận hành bằng mô hình Gemini 2.5 Flash của Google. Khi một Project chuyển sang trạng thái hoàn tất, operator hoặc admin có thể bấm nút "Generate Summary". Vì gọi API của Gemini có thể mất từ 5 đến 15 giây tùy độ dài prompt và tải hệ thống, em áp dụng đúng nguyên lý xử lý bất đồng bộ như với YOLO — request trả về mã 202 ngay lập tức, còn việc gọi AI thực sự được đẩy vào một Bull job riêng, xử lý trong nền bởi một worker.

> Điểm em muốn nhấn mạnh là cách xây dựng prompt gửi cho Gemini. Thay vì chỉ đưa tọa độ GPS thô, em ưu tiên dùng trường `locationName` — là tên địa danh thu được từ việc reverse geocoding qua OpenStreetMap Nominatim khi operator upload dữ liệu cảm biến có GPS — để Gemini nhận được một tên địa danh có ý nghĩa, ví dụ "Bán đảo Sơn Trà", thay vì một chuỗi số tọa độ khó diễn giải. Cùng với đó là danh sách toàn bộ các trip thuộc project kèm trạng thái, và số lượng file media đã upload thành công. Một chi tiết kỹ thuật quan trọng là em yêu cầu Gemini trả về đồng thời cả bản tiếng Việt và tiếng Anh trong một lần gọi duy nhất, phân tách bằng một cặp dấu phân cách cứng, để tránh phải gọi API hai lần cho hai ngôn ngữ — vừa tiết kiệm quota miễn phí, vừa giảm độ trễ.

> Về độ tin cậy, em thiết lập cơ chế timeout hai lớp: bốn mươi lăm giây timeout nội bộ trong lúc gọi Gemini, và sáu mươi giây timeout ở tầng hàng đợi Bull — đảm bảo job không bao giờ bị treo vô hạn nếu Gemini không phản hồi. Em cũng phân loại các lỗi không nên thử lại, ví dụ hết quota hoặc sai API key, để tránh lãng phí ba lần retry cho một lỗi chắc chắn sẽ lặp lại y hệt. Phía giao diện, trong lúc chờ, frontend sẽ tự động hỏi lại server mỗi ba giây để cập nhật khi bản tóm tắt đã sẵn sàng, kết hợp với thông báo đẩy qua SSE để trải nghiệm mượt mà hơn.

### Ghi chú (nếu có)
Demo: dùng 1 project đã completed sẵn có nhiều trip, bấm "Generate Summary", chỉ ra spinner xuất hiện trong lúc chờ, rồi hiển thị kết quả song ngữ khi xong (có thể chuẩn bị sẵn kết quả từ trước để tránh chờ lâu trên sân khấu).

### Câu hỏi phản biện dự kiến
- **"Nếu Gemini trả về text không đúng format `===VI===`/`===EN===` thì hệ thống xử lý thế nào?"** → Trả lời: hệ thống dùng regex để tách 2 phần; nếu thiếu 1 trong 2 phần, service sẽ ném lỗi kèm theo 200 ký tự đầu của response gốc để debug, và `aiSummary.status` sẽ chuyển thành `failed` để operator biết và có thể bấm Regenerate.
- **"Chi phí gọi Gemini có được kiểm soát không, tránh spam Regenerate liên tục?"** → Trả lời: hiện tại chưa có rate-limit riêng cho endpoint AI summary ngoài rate-limit chung của `/auth`; đây là điểm có thể cải tiến (ví dụ giới hạn số lần generate/giờ) nếu triển khai thực tế ở quy mô lớn hơn, tuy nhiên với Gemini free tier và ngữ cảnh đồ án, rủi ro chi phí không đáng kể.

---

## Slide 23: Notification Realtime — SSE + Redis
**Mức độ ưu tiên:** ⭐ Bắt buộc
**Thời lượng ước tính:** 2 phút

### Nội dung slide (bullet trình chiếu)
- Chọn **SSE** (Server-Sent Events) thay vì WebSocket — chỉ cần đẩy 1 chiều server → client
- `EventSource` tự động reconnect có sẵn — không cần tự viết cơ chế reconnect
- Kết nối lưu trong `Map<userId, res>` in-memory — mỗi user tối đa 1 kết nối SSE (mở tab mới sẽ đóng tab cũ)
- Xác thực JWT qua query string (`?token=`) vì `EventSource` không set được header `Authorization`
- Giữ kết nối sống: ping comment `: ping` mỗi 30 giây (tránh timeout qua reverse proxy)
- Trigger từ: trip done/failed, project completed, AI summary xong, YOLO analysis xong
- Bell icon + badge số chưa đọc, lưu DB nên reload vẫn đúng số lượng

### Kịch bản thuyết trình (lời nói)
> Về thông báo thời gian thực, em chọn công nghệ Server-Sent Events, viết tắt là SSE, thay vì WebSocket. Lý do lựa chọn nằm ở bản chất luồng dữ liệu: hệ thống của em chỉ cần đẩy thông báo một chiều từ server xuống client — khi có trip hoàn thành, project completed, AI summary xong, hay YOLO phân tích xong — chứ client không cần gửi ngược dữ liệu qua cùng kênh đó. WebSocket là giao thức hai chiều đầy đủ, mạnh hơn nhưng cũng phức tạp hơn để triển khai và bảo trì so với nhu cầu thực tế này. SSE chạy trên nền HTTP thông thường, và quan trọng nhất là trình duyệt đã tích hợp sẵn cơ chế tự động kết nối lại trong đối tượng EventSource, giúp em không phải tự viết logic reconnect phức tạp.

> Về mặt kiến trúc lưu trữ kết nối, vì hệ thống chỉ chạy một instance Node duy nhất theo thiết kế deployment trên VPS, em dùng một cấu trúc Map lưu trong bộ nhớ, ánh xạ từ userId sang đối tượng response đang mở. Khi có sự kiện cần thông báo, hệ thống tra map theo đúng userId và ghi trực tiếp vào response đó. Một chi tiết kỹ thuật đáng chú ý là EventSource của trình duyệt không cho phép gắn header Authorization tùy chỉnh, nên em phải truyền JWT qua query string của URL, sau đó xác thực thủ công ngay trong controller thay vì dùng middleware authenticate chuẩn — token vẫn được verify đầy đủ nên không có lỗ hổng bảo mật, chỉ là đổi kênh truyền. Để giữ kết nối không bị ngắt bởi các tầng trung gian như reverse proxy hay load balancer, em gửi một dòng comment ping mỗi ba mươi giây.

> Về trải nghiệm người dùng, có một chuông thông báo với số huy hiệu đỏ hiển thị số lượng chưa đọc, được lưu vào MongoDB nên dù người dùng tải lại trang hay đăng nhập lại, số lượng vẫn chính xác — không phụ thuộc hoàn toàn vào kết nối SSE tức thời.

### Ghi chú (nếu có)
Demo: mở 2 tab trình duyệt cùng tài khoản, thực hiện một hành động sinh ra thông báo (ví dụ đổi trạng thái trip) ở tab thao tác, quan sát chuông thông báo cập nhật ngay ở tab còn lại mà không cần F5.

### Câu hỏi phản biện dự kiến
- **"Tại sao không dùng WebSocket mà dùng SSE?"** → Trả lời: nhu cầu thực tế chỉ cần đẩy 1 chiều server→client, SSE đơn giản hơn để triển khai/bảo trì, chạy trên HTTP thuần (dễ qua proxy/firewall hơn WebSocket), và có auto-reconnect có sẵn trong EventSource — WebSocket sẽ là lựa chọn thừa thãi cho bài toán này.
- **"Nếu 2 tab cùng đăng nhập thì notification có bị nhân đôi hay xung đột không?"** → Trả lời: không — thiết kế cố ý chỉ cho phép 1 kết nối SSE active mỗi user tại một thời điểm; khi mở tab thứ 2, `registerSSE` sẽ chủ động đóng kết nối của tab thứ nhất trước khi đăng ký kết nối mới, tránh gửi trùng lặp nhưng đồng nghĩa tab đầu sẽ mất live-update (vẫn thấy đúng dữ liệu khi F5 vì đã lưu DB).
- **"Kiến trúc Map in-memory này có giới hạn gì khi scale hệ thống?"** → Trả lời: chỉ hoạt động đúng khi chạy 1 instance Node; nếu scale ngang nhiều instance sau load balancer, cần chuyển sang Redis Pub/Sub để broadcast giữa các instance — hiện tại kiến trúc triển khai trên 1 VPS Contabo duy nhất nên giả định này hợp lý cho phạm vi đồ án.

---

## Slide 24: Audit Log — Truy vết thao tác hệ thống
**Mức độ ưu tiên:** 🔸 Có thể lược bớt nếu thiếu thời gian
**Thời lượng ước tính:** 1-1.5 phút

### Nội dung slide (bullet trình chiếu)
- Ghi lại: tạo/xóa project, xóa ROV, đổi role user, bulk operations, generate AI summary
- Mỗi log gồm: `userId` (ai làm), `action` (làm gì), `entity`/`entityId` (đối tượng), `details` (Mixed — chi tiết tự do), `createdAt`
- Thiết kế **fire-and-forget**: `AuditLog.create()` không `await`, không block luồng nghiệp vụ chính
- Chỉ `admin` xem được (`GET /audit`, `authorize('admin')`)
- Index tối ưu: `{createdAt:-1}`, `{entity:1, createdAt:-1}`, `{userId:1, createdAt:-1}`

### Kịch bản thuyết trình (lời nói)
> Cuối cùng, để phục vụ tính minh bạch và truy vết trách nhiệm trong vận hành thực tế — một yêu cầu quan trọng với hệ thống nhiều operator cùng thao tác — em xây dựng module Audit Log. Mỗi khi có một hành động quan trọng xảy ra, ví dụ tạo hoặc xóa một project, xóa một ROV khỏi hệ thống, admin đổi vai trò của một người dùng, thực hiện thao tác hàng loạt, hay thậm chí là bấm sinh tóm tắt AI, hệ thống sẽ ghi lại một bản ghi gồm ai đã thực hiện, hành động gì, tác động lên đối tượng nào, và các chi tiết liên quan như email người dùng bị đổi role hay giá trị cũ/mới.

> Một quyết định thiết kế đáng chú ý là em áp dụng mô hình "fire-and-forget" cho việc ghi log — nghĩa là lệnh ghi vào cơ sở dữ liệu không được chờ đợi (`await`) trong luồng xử lý chính, chỉ bắt lỗi ngầm nếu có sự cố. Lý do là em không muốn việc ghi audit log — vốn chỉ mang tính chất theo dõi phụ trợ — có thể làm chậm hoặc làm thất bại một thao tác nghiệp vụ chính, ví dụ xóa ROV vẫn phải thành công dù việc ghi log gặp trục trặc tạm thời. Đây là một sự đánh đổi có chủ đích giữa độ tin cậy tuyệt đối của nhật ký kiểm toán và hiệu năng, trải nghiệm người dùng của thao tác chính.

> Trang xem audit log chỉ dành riêng cho vai trò admin, hiển thị dạng dòng thời gian với avatar, tên người dùng, hành động, và thời gian tương đối, có thể lọc theo loại đối tượng.

### Ghi chú (nếu có)
Demo nhanh: vào trang `/audit` với tài khoản admin, chỉ ra vài dòng log gần nhất (ví dụ log tạo project vừa demo ở các slide trước) để chứng minh tính liên kết xuyên suốt toàn bộ hệ thống.

### Câu hỏi phản biện dự kiến
- **"Fire-and-forget có nguy cơ mất log không? Tại sao chấp nhận đánh đổi này?"** → Trả lời: có nguy cơ mất log nếu đúng lúc đó MongoDB gặp sự cố, nhưng xác suất thấp và hậu quả chỉ là thiếu 1 bản ghi lịch sử, không ảnh hưởng tính đúng đắn của dữ liệu nghiệp vụ chính; đổi lại, thao tác chính (ví dụ xóa ROV) không bao giờ bị chặn hay chậm lại vì logic ghi log — đây là lựa chọn phù hợp với quy mô và mục tiêu của đồ án, có thể nâng cấp lên transaction hoặc queue riêng nếu triển khai production nghiêm ngặt hơn.
- **"Vì sao operator không được xem audit log của chính mình?"** → Trả lời: theo thiết kế RBAC, audit log là công cụ giám sát cấp quản trị nhằm kiểm soát toàn hệ thống nhiều người dùng, nên giới hạn ở admin để tránh operator có thể suy luận ngược thao tác của người khác hoặc xóa dấu vết; đây là quyết định về mô hình phân quyền chứ không phải giới hạn kỹ thuật.
