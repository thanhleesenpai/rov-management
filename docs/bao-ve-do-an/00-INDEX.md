# Mục lục — Kịch bản bảo vệ đồ án (ROV Management System)

Bộ tài liệu này là **kịch bản bảo vệ đầy đủ**: mỗi slide gồm (1) nội dung bullet để chiếu, (2) lời thuyết trình viết sẵn, (3) mức độ ưu tiên (để cắt gọn sau), (4) ghi chú demo, và ở phần nổi bật còn có sẵn câu hỏi phản biện dự kiến. Toàn bộ số liệu/kỹ thuật được đối chiếu với code thật và `docs/code-explained/`, không bịa đặt.

> ⚡ **Đã có bản RÚT GỌN đúng 10 phút** tại [05-kich-ban-rut-gon-10-phut.md](05-kich-ban-rut-gon-10-phut.md) — dùng bản này cho buổi bảo vệ chính thức (thời gian trình bày cố định 10 phút). Bản 01-04 bên dưới là "ngân hàng nội dung" đầy đủ để tra cứu sâu khi ôn tập hoặc bị hỏi thêm.
>
> 🎬 **Kịch bản demo chi tiết riêng** tại [06-kich-ban-demo-chi-tiet.md](06-kich-ban-demo-chi-tiet.md) — dùng để tập dượt / đi phản biện sơ bộ trước khi bảo vệ chính thức, đi qua gần như toàn bộ tính năng với thao tác cụ thể (không giới hạn 10 phút).
>
> 🗣️ **Câu mở đầu dễ hiểu + câu hỏi nghiệp vụ hay bị hỏi trước** tại [07-mo-ta-nhanh-va-cau-hoi-nghiep-vu.md](07-mo-ta-nhanh-va-cau-hoi-nghiep-vu.md) — dùng để giới thiệu web bằng lời thường trước khi vào slide, và 15 câu hỏi định hướng/nghiệp vụ (kể cả kiểu "vì sao chọn YOLOv8 mà không bản mới hơn") hay bị hỏi ngay đầu buổi.

---

## Danh sách file

| Phần | File | Slide | Nội dung | Thời lượng |
|---|---|---|---|---|
| A | [01-mo-dau-kien-truc.md](01-mo-dau-kien-truc.md) | 1–8 | Trang bìa, đặt vấn đề, mục tiêu, phạm vi, luồng nghiệp vụ, kiến trúc, tech stack, ERD+RBAC | ~10 phút |
| B | [02-chuc-nang-co-ban.md](02-chuc-nang-co-ban.md) | 9–16 | Auth, ROV, Project/Trip, Upload Folder, Sensor+Anomaly, DVL/Sonar, Media S3, Dashboard | ~16 phút |
| C | [03-chuc-nang-noi-bat.md](03-chuc-nang-noi-bat.md) | 17–24 | Cockpit Layout, Video-Sensor Sync, YOLOv8 detection, Model switching/tracking, Evidence System, AI Summary Gemini, Notification SSE, Audit Log | ~17-18 phút |
| D | [04-ket-qua-ket-luan-qa.md](04-ket-qua-ket-luan-qa.md) | 25–30 | Functional test, Load test/Lighthouse, **Kịch bản demo trực tiếp** (bản ngắn), Kết quả đạt được, Hạn chế/Hướng phát triển, Cảm ơn + **Phụ lục 20 câu Q&A** | ~6-12 phút (+ demo) |
| **E** | **[05-kich-ban-rut-gon-10-phut.md](05-kich-ban-rut-gon-10-phut.md)** | 8 slide gộp | **BẢN DÙNG THẬT** — rút gọn còn đúng 10 phút, khuyến nghị chèn video quay sẵn thay vì demo live trong lúc thuyết trình | **10 phút chẵn** |
| **F** | **[06-kich-ban-demo-chi-tiet.md](06-kich-ban-demo-chi-tiet.md)** | 13 bước (A→O) | Kịch bản demo trực tiếp đầy đủ nhất — chuẩn bị, tài khoản, từng thao tác click, bảng ưu tiên cắt gọn, checklist tập dượt | ~25-30 phút (linh hoạt cắt còn 12-14 phút) |

**Tổng thời lượng thuyết trình (30 slide, đọc hết, chưa demo): ~50 phút**
**Tổng nếu tính cả demo trực tiếp (slide 27, ~5-7 phút): ~55-57 phút**

> ⚠️ Buổi bảo vệ thật thường chỉ cho **15-20 phút trình bày**. Bản này là bản ĐẦY ĐỦ theo đúng yêu cầu ban đầu của bạn — dùng để luyện tập, hiểu sâu toàn bộ hệ thống, và làm "ngân hàng nội dung" để rút gọn. Khi cần bản 15-20 phút, báo tôi và tôi sẽ cắt theo bảng ưu tiên bên dưới.

---

## Bảng slide đầy đủ + mức ưu tiên (dùng để cắt gọn)

| # | Slide | Ưu tiên | Thời lượng |
|---|-------|---------|------------|
| 1 | Trang bìa | ⭐ Bắt buộc | 45s |
| 2 | Đặt vấn đề / Lý do chọn đề tài | ⭐ Bắt buộc | 70s |
| 3 | Mục tiêu đề tài | ⭐ Bắt buộc | 60s |
| 4 | Phạm vi & Đối tượng nghiệp vụ | ⭐ Bắt buộc | 65s |
| 5 | Luồng nghiệp vụ tổng quan | ⭐ Bắt buộc | 75s |
| 6 | Kiến trúc tổng thể hệ thống | ⭐ Bắt buộc | 90s |
| 7 | Tech stack & lý do lựa chọn | ⭐ Bắt buộc | 100s |
| 8 | Mô hình dữ liệu (ERD) & RBAC | ⭐ Bắt buộc | 95s |
| 9 | Authentication & Authorization | ⭐ Bắt buộc | 2 phút |
| 10 | Quản lý ROV | ⭐ Bắt buộc | 1.5 phút |
| 11 | Quản lý Project & Trip | ⭐ Bắt buộc | 2 phút |
| 12 | Upload Folder | ⭐ Bắt buộc | 2.5 phút |
| 13 | Sensor Data & Anomaly Detection | ⭐ Bắt buộc | 2.5 phút |
| 14 | DVL Trajectory & Sonar Data | 🔸 Có thể lược | 1.5 phút |
| 15 | Media Management (S3) | ⭐ Bắt buộc | 2 phút |
| 16 | Dashboard tổng quan & Thống kê | ⭐ Bắt buộc | 2 phút |
| 17 | TripDetailPage — Cockpit Layout | ⭐ Bắt buộc | 2 phút |
| 18 | Video-Sensor Sync | ⭐ Bắt buộc | 2-2.5 phút |
| 19 | YOLOv8 — Kiến trúc AI Microservice | ⭐ Bắt buộc | 2.5 phút |
| 20 | YOLOv8 — Model switching/Tracking | ⭐ Bắt buộc | 2.5 phút |
| 21 | Evidence System (Photo/Clip) | ⭐ Bắt buộc | 2.5 phút |
| 22 | AI Project Summary (Gemini) | ⭐ Bắt buộc | 2 phút |
| 23 | Notification Realtime (SSE) | ⭐ Bắt buộc | 2 phút |
| 24 | Audit Log | 🔸 Có thể lược | 1-1.5 phút |
| 25 | Kết quả kiểm thử chức năng | ⭐ Bắt buộc | 75s |
| 26 | Kiểm thử hiệu năng (Load/Lighthouse) | 🔸 Có thể lược/gộp vào 25 | 70s |
| 27 | **Demo trực tiếp** (kịch bản 7 bước) | ⭐ Bắt buộc | 5-7 phút |
| 28 | Kết quả đạt được | ⭐ Bắt buộc | 90s |
| 29 | Hạn chế & Hướng phát triển | ⭐ Bắt buộc | 80s |
| 30 | Lời cảm ơn | ⭐ Bắt buộc | 30s |

**Gợi ý rút gọn nhanh về ~20 phút khi cần:** giữ slide 1,2,3,6,7 (mở đầu súc tích ~4 phút) → gộp 9-16 thành demo trực tiếp thay vì thuyết trình từng slide → tập trung nói kỹ slide 17-22 (phần nổi bật nhất, ~8-9 phút) → slide 25,28,29,30 (kết quả/kết luận ~4 phút). Phần demo trực tiếp (27) nên luôn giữ vì thể hiện sản phẩm chạy thật tốt hơn nói suông.

---

## Việc bạn cần tự làm trước ngày bảo vệ (đã ghi chú rõ trong slide 26)

Kịch bản **không bịa số liệu** cho phần load-test/Lighthouse vì chưa xác nhận bạn đã chạy thật. Trước ngày bảo vệ, hãy:
1. Chạy `node backend/src/scripts/seed-full.js --reset` rồi `node backend/src/scripts/functional-test.js` → chụp ảnh kết quả (nên ra 37/37).
2. Chạy `node backend/src/scripts/load-test.js` → chụp ảnh bảng kết quả để điền vào slide 26.
3. Mở Chrome DevTools → Lighthouse cho Dashboard + TripDetailPage → chụp điểm số.
4. Chuẩn bị sẵn 1 Project + Trip có đủ dữ liệu (sensor + video + ảnh + GPS) để demo mượt, tránh demo upload trực tiếp (rủi ro mạng/thời gian).

## Phụ lục Q&A

20 câu hỏi dự kiến (kiến trúc/công nghệ, bảo mật, nghiệp vụ, điểm yếu tự phát hiện, mở rộng) nằm ở cuối file **04-ket-qua-ket-luan-qa.md**. Nên đọc kỹ phần "điểm yếu tự phát hiện" — lấy từ 8 phát hiện thực tế khi đối chiếu code (xem `docs/code-explained/00-INDEX.md`) — vì đây là câu hỏi hội đồng có xác suất hỏi trúng cao nhất và trả lời thành thật sẽ ghi điểm tốt hơn né tránh.
