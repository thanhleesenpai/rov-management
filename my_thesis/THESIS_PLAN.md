# KẾ HOẠCH VIẾT LẠI ĐỒ ÁN TỐT NGHIỆP
## Hệ thống quản lý vận hành ROV tích hợp trí tuệ nhân tạo

**Tài liệu tham chiếu:**
- Ví dụ mẫu: `DoAn_20225277_v3.pdf` (đồ án đặt vé sự kiện)
- Template: `SOICT_DATN_Application_VIE_Template/`
- Code thực tế: `d:\Code\rov-management\`

---

## TRẠNG THÁI HIỆN TẠI

| File | Dòng | Trạng thái | Vấn đề còn lại |
|------|------|-----------|---------|
| `DoAn.tex` | — | ✅ OK | `\AUTHOR{LÊ MINH THÀNH}` đã điền |
| `0_2_Loi_cam_on.tex` | 25 | ✅ Xong | Có tên GVHD: TS. Ngô Lam Trung |
| `0_3_Tom_tat_noi_dung.tex` | 26 | ✅ Xong | 3 lỗi đã sửa: 37/37, chưa deploy VPS, load-test.js 20 user |
| `0_4_Tom_tat_noi_dung_English.tex` | 17 | ✅ Xong | Cùng 3 lỗi đã sửa như bản tiếng Việt |
| `1_Gioi_thieu.tex` | 40 | ✅ OK | 4 section đầy đủ, thuật ngữ đúng |
| `2_Khao_sat.tex` | 346 | ✅ Xong | Bảng UC longtable, state diagrams, UC phân rã 2 phân hệ |
| `3_Cong_nghe.tex` | ~220 | ✅ Xong | Bảng 3.1 + 4 section, citations đầy đủ |
| `4_Ket_qua_thuc_nghiem.tex` | ~420 | ✅ Xong | Đầy đủ: arch, DB, 7 subsection UI, seq diagrams, kiểm thử, deploy |
| `5_Giai_phap_dong_gop.tex` | ~250 | ✅ Xong | 5 section đầy đủ: 5.1 Cockpit, 5.2 Sync, 5.3 Evidence, 5.4 Z-Score, 5.5 LLM |
| `6_Ket_luan.tex` | 23 | ✅ OK | Nội dung đúng, không cần sửa |
| `Phu_luc_B.tex` | ~220 | ✅ Xong | 8 UC, longtable format, thuật ngữ đúng Project/Trip |
| `Hinhve/` | — | ✅ Đủ hình | Có: arch, er_diagram, seq, state, uc, act, ui screenshots |
| `.bib` | 246 | ✅ Xong | 23+ entries, đủ citations cho cả 3 chapter |
| `Tu_viet_tat.tex` | 170 | ✅ Xong | 30+ entries đầy đủ |

---

## QUY TẮC PHONG CÁCH (rút ra từ ví dụ mẫu)

### Cách viết văn xuôi
- Đoạn văn thụt đầu dòng 15pt (đã cấu hình trong template)
- Viết **văn xuôi liên tục**, KHÔNG dùng bullet list trong thân chương (chỉ dùng bảng/hình)
- Mỗi công nghệ/phần: 2 đoạn — đoạn 1 trình bày bài toán + cơ chế, đoạn 2 so sánh với thay thế + lý do chọn
- Tham chiếu tài liệu dạng `\cite{key}` ngay sau tên công nghệ lần đầu xuất hiện

### Hình vẽ (Figures)
- Luôn đề cập trong văn bản TRƯỚC khi đặt figure: *"Hình X.Y mô tả..."*
- Caption ở **dưới** hình: `\caption{Mô tả ngắn gọn}`
- Label đặt sau caption để cross-reference: `\label{fig:ten_hinh}`
- Kích thước: `\includegraphics[width=0.8\linewidth]{...}` (hình lớn) hoặc `[width=0.5\linewidth]` (hình nhỏ)

### Bảng biểu (Tables)
- Caption ở **dưới** bảng (khác với nhiều quy chuẩn khác)
- Số thứ tự: Bảng X.Y (X = chương, Y = thứ tự trong chương)
- Cột header dùng `\textbf{}`
- Bảng đặc tả Use Case: dùng `longtable` để tránh tràn trang

### Đặc tả Use Case (quan trọng — ví dụ dùng bảng, không phải bullet)
```latex
\begin{longtable}{|p{3.5cm}|p{10.0cm}|}
\caption{Đặc tả Use Case UC-0X: Tên UC}\label{tab:uc0x}\\
\hline
\textbf{Mã Use Case} & UC-0X \\
\hline
\textbf{Tên} & ... \\
\hline
\textbf{Tác nhân} & Admin, Operator \\
\hline
\textbf{Tiền điều kiện} & ... \\
\hline
\textbf{Luồng chính} & 1. ...\newline 2. ... \\
\hline
\textbf{Luồng phát sinh} & ... \\
\hline
\textbf{Hậu điều kiện} & ... \\
\hline
\end{longtable}
```

### Thuật ngữ đúng (đã đổi tên — QUAN TRỌNG)
| Code | Đồ án gọi là | Ý nghĩa |
|------|-------------|---------|
| Project | Chuyến khảo sát / Project | Container lớn, nhiều lượt lặn |
| Trip | Lượt lặn / Trip | Một lần lặn cụ thể |
| Snapshot | Bằng chứng / Evidence | Ảnh frame hoặc đoạn clip trích xuất |
| ROV | ROV / Phương tiện không người lái | Robot lặn |

---

## SỐ LIỆU THỰC TẾ (đọc từ code + test, dùng nhất quán trong toàn bộ luận văn)

### Kiểm thử chức năng
- **Tổng số test case: 37/37** (không phải 35)
- Nhóm: Authentication(7) + RBAC(6) + Validation(5) + CRUD(11) + Pagination(6) + Hồi quy(2) = 37

### Kiểm thử tải (load-test.js, 20 concurrent × 3 rounds = 60 requests/endpoint)
| Endpoint | avg | p95 | Errors |
|----------|-----|-----|--------|
| POST /auth/login | 1312ms | 4101ms | 41/60 (rate limiter ✓) |
| GET /auth/me | 132ms | 492ms | 0/60 |
| GET /projects | 474ms | 934ms | 0/60 |
| GET /trips | 458ms | 988ms | 0/60 |
| GET /rovs | 205ms | 540ms | 0/60 |
| GET /stats/overview | 825ms | 1830ms | 0/60 |
| GET /trips/:id/sensor-data | 327ms | 523ms | 0/60 |
| GET /trips/:id/dvl | 737ms | 885ms | 0/60 |
| GET /media/trip/:id | 377ms | 759ms | 0/60 |
| GET /notifications | 525ms | 855ms | 0/60 |

- Tool: `load-test.js` (Node.js tự viết), **không phải Artillery**
- Tải: **20 concurrent** (không phải 30)

### Lighthouse (Desktop, production build `vite preview`)
| Trang | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT |
|-------|------------|---------------|----------------|-----|-----|-----|-----|
| Dashboard | 98 | 94 | 96 | 100 | 0,8s | 0,9s | 90ms |
| ProjectsPage | 95 | 81 | 100 | 100 | 0,7s | 1,4s | 100ms |
| TripDetailPage | 88 | 89 | 100 | 100 | 0,7s | 1,9s | 100ms |

### Triển khai
- **CHƯA triển khai lên VPS** — Chapter 4.5 viết là "mô hình triển khai đề xuất"
- Mô hình đề xuất: VPS Contabo 4GB + Docker Compose (nginx/backend/yolo/redis) + Vercel (frontend) + MongoDB Atlas + AWS S3

### Enum đúng (đọc từ model files)
- `project.status`: `planned | ongoing | completed | cancelled`
- `trip.status`: `pending | running | done | failed`
- `media.status` (upload): `pending | ready | failed`
- `media.analysisStatus` (YOLO): `idle | pending | done | failed` ← **field riêng**
- `snapshot.analysisStatus`: `idle | pending | done | failed`

### Bull Queue (từ config/queue.js)
| Hàng đợi | Timeout | Attempts | Mục đích |
|----------|---------|----------|---------|
| `ai-summary` | 60s | 3 | Gemini API summary |
| `media-analysis` | 25 phút | 1 | YOLO phân tích media |
| `snapshot-analysis` | 5 phút | 1 | YOLO phân tích evidence |
| `email` | 60s | 3 | Email notification |

### YOLOv8 sampling (từ main.py)
- Video < 30s → lấy mẫu mỗi 0,2s
- Video 30s–3 phút → lấy mẫu mỗi 0,5s
- Video > 3 phút → lấy mẫu mỗi 1,0s

### Tailwind breakpoints (mặc định)
| Tên | Chiều rộng tối thiểu |
|-----|---------------------|
| sm | 640px |
| md | 768px |
| lg | 1024px |
| xl | 1280px |
| 2xl | **1536px** (không phải 1400px) |

---

## NHỮNG GÌ ĐÃ HOÀN THÀNH ✅

### Phase 0 (Tiền xử lý)
- [x] Metadata DoAn.tex — tên SV, GVHD đã điền
- [x] Populate .bib — 23+ entries đủ citations
- [x] Tu_viet_tat.tex — 30+ từ viết tắt
- [x] Screenshots — 14 file UI trong Hinhve/
- [x] Sơ đồ: arch_tong_quan, arch_module_dep, arch_deploy, er_diagram (enum đã fix), seq_sensor_upload, seq_ai_analysis, state_project, state_trip, act_data_workflow, uc_tongquat, uc_phanra_data, uc_phanra_ai

### Phase 1 (Trang đầu)
- [x] Lời cảm ơn — đã viết
- [x] Tóm tắt tiếng Việt — đã viết (còn 3 lỗi số liệu)
- [x] Abstract tiếng Anh — đã viết (còn 3 lỗi số liệu)

### Phase 2 (Chương 1)
- [x] Đầy đủ 4 section, thuật ngữ đúng

### Phase 3 (Chương 2)
- [x] Bảng so sánh phần mềm (Bảng 2.1)
- [x] RBAC table (Bảng 2.2)
- [x] UC tổng quát (Hình 2.1)
- [x] UC phân rã Phân hệ Dữ liệu (Hình 2.2)
- [x] UC phân rã Phân hệ AI (Hình 2.3)
- [x] Activity diagram swimlane (Hình 2.4)
- [x] 4 UC specs longtable (UC-01 đến UC-04)
- [x] Yêu cầu phi chức năng
- [x] State diagram Project (enum đúng: planned/ongoing/completed/cancelled)
- [x] State diagram Trip (enum đúng: pending/running/done/failed)
- [x] Media analysisStatus bảng (2 field riêng biệt)

### Phase 4 (Chương 3)
- [x] Bảng 3.1 tổng quan công nghệ
- [x] 4 section đầy đủ (Frontend, Backend, Queue+SSE, AI+Anomaly)
- [x] Citations cho tất cả công nghệ

### Phase 5 (Chương 4)
- [x] 4.1 Kiến trúc (tổng quan + module + deploy)
- [x] 4.2 Thiết kế CSDL (bảng 10 collection)
- [x] 4.3 Hiện thực chức năng (13 screenshots)
- [x] 4.4 Kiểm thử (functional 37/37 + load test + Lighthouse)
- [x] 4.5 Mô hình triển khai đề xuất

### Phase 6 (Chương 5) — CHỈ 3/5 SECTION
- [x] 5.1 Đồng bộ video–cảm biến
- [x] 5.2 Nhận diện vật thể YOLO
- [x] 5.3 (hiện là) Tóm tắt bằng LLM

### Phase 7 (Chương 6)
- [x] Nội dung đúng, đủ cấu trúc

---

## CÔNG VIỆC CÒN LẠI (ƯU TIÊN THEO THỨ TỰ)

### TODO 1 — Sửa số liệu sai trong Tóm tắt (KHẨN, 2 file)

**`0_3_Tom_tat_noi_dung.tex`** và **`0_4_Tom_tat_noi_dung_English.tex`** — sửa 3 chỗ:
1. `35/35` → `37/37`
2. `đã được triển khai hoàn chỉnh trên VPS` → `mô hình triển khai đề xuất sử dụng Docker Compose`
3. `Kiểm thử tải với Artillery ở mức 30 người dùng` → `kiểm thử tải bằng script Node.js ở mức 20 người dùng đồng thời`

### TODO 2 — Thêm 2 section còn thiếu vào Chương 5 (QUAN TRỌNG)

Chương 5 theo plan có 5 section, hiện chỉ có 3. Cần thêm:

**Section 5.3 — Hệ thống trích xuất bằng chứng (Evidence System):**
```
Bài toán: Không có cơ chế đánh dấu và lưu trữ phát hiện quan trọng trong khi xem video.
Giải pháp:
  - Photo: Canvas API trích xuất khung hình → PNG → S3 (imageS3Key); nếu bbox đang hiện, ghi burn-in
  - Clip: chỉ ghi (startTime, endTime) không cắt file vật lý → không tốn băng thông S3
  - Snapshot model (collection riêng): type/trip/parentMediaId/imageS3Key/thumbnailS3Key/aiLabels
  - Re-analyze riêng: POST /snapshots/:id/analyze → Bull job snapshot-analysis (timeout 5 phút)
  - YOLO service nhận startTime/endTime → chỉ process frames trong range
Kết quả: Evidence Panel single-column, click → EvidenceViewer overlay (video + bbox)
  Hình 5.3: ui_evidence_panel.png
```

**Section 5.4 — Phát hiện bất thường cảm biến tự động (Z-Score):**
```
Bài toán: Hàng nghìn dòng CSV, phải tìm bất thường bằng mắt thủ công.
Giải pháp:
  - Z-Score: z = (x - μ) / σ, ngưỡng |z| > 2,5 là outlier
  - 7 metric: depth, temp, temperature, pressure, voltage, battery_percent, humidity
  - Tính trực tiếp tại backend sau khi upload (không cần training data)
  - Trả về: { data, stats{min/max/avg}, anomalies[{index, metric, value, zScore, timestamp}] }
  - Frontend: custom dot đỏ trên AreaChart (Recharts), panel "Anomalies Detected"
So sánh: IQR method (kém nhạy với spike nhọn), Isolation Forest (cần training data)
Kết quả: Tự động phát hiện spike áp suất/nhiệt độ bất thường, highlight đỏ trên chart
  Hình 5.4: ui_trip_chart_anomaly.png (đã có)
```

Sau khi thêm 2 section này, đánh số lại: section hiện tại "5.3 LLM Summary" → **5.5**.

### TODO 3 — Rewrite Phụ lục B (format + thuật ngữ)

**`Phu_luc_B.tex`** còn dùng bullet list và thuật ngữ cũ. Cần:
1. Đổi "Trips/Dives Management" → "Quản lý Chuyến khảo sát và Lượt lặn"
2. Chuyển tất cả UC specs sang longtable format
3. Thêm UC còn thiếu: UC Quản lý ROV, UC Upload Media, UC Đăng nhập email/password, UC Xem Dashboard

UC cần có trong Phụ lục B:
- UC: Đăng nhập bằng email/password (đã có phần Google OAuth2)
- UC: Quản lý ROV (CRUD)
- UC: Tạo Chuyến khảo sát (Project)
- UC: Tạo Lượt lặn trong Project
- UC: Upload Media (presigned S3)
- UC: Quản lý Người dùng (Admin) — đã có nhưng cần đổi sang longtable
- UC: Xem Dashboard

### TODO 4 — Bổ sung Sequence Diagrams vào Chương 4 (tùy chọn)

Hình `seq_sensor_upload.png` và `seq_ai_analysis.png` đã có trong `Hinhve/` nhưng chưa được đặt vào Chapter 4. Có thể thêm section 4.3 mới:

```latex
\subsection{Sơ đồ tuần tự}
Hình 4.X: seq_sensor_upload.png — luồng tải lên CSV
Hình 4.X+1: seq_ai_analysis.png — luồng YOLO bất đồng bộ
```

---

## CHECKLIST CUỐI (Trước khi nộp)

### Nội dung
- [ ] Tóm tắt VN + Abstract EN: số liệu đúng (37/37, không "đã deploy VPS", 20 concurrent)
- [x] Tất cả UC specs dùng longtable (Ch2 đã đúng; Phụ lục B cần sửa)
- [x] Bảng 3.1 tổng quan công nghệ (4 cột)
- [x] Bảng collections MongoDB (Ch4 có 1 bảng tổng hợp)
- [x] Có 2 sequence diagrams (file đã có, chưa đặt vào Ch4)
- [x] Có 1 activity diagram swimlane (Hình 2.4)
- [x] Có 2 state diagrams (Project + Trip)
- [x] Có 13+ UI screenshots thực tế trong Ch4
- [x] Kết quả kiểm thử chức năng 37/37 (table trong Ch4)
- [x] Kết quả kiểm thử tải (table trong Ch4)
- [x] Kết quả Lighthouse (table trong Ch4)
- [x] Tóm tắt + Abstract đã viết (cần sửa số liệu)
- [x] Lời cảm ơn đã viết
- [x] Tài liệu tham khảo 23+ entries
- [ ] Ch5: thêm 2 section còn thiếu (Evidence + Z-Score)
- [ ] Phụ lục B: chuyển sang longtable + sửa thuật ngữ

### Kỹ thuật LaTeX
- [x] `\AUTHOR{}` đã điền tên thật
- [x] `Tu_viet_tat.tex` đầy đủ
- [x] Tất cả hình vẽ tồn tại trong `Hinhve/`
- [x] Tất cả `\cite{}` có entry trong `.bib`
- [ ] Compile không có lỗi/warning missing reference (cần chạy kiểm tra)
- [ ] Danh mục hình vẽ tự động chính xác
- [ ] Danh mục bảng biểu tự động chính xác

### Format
- [x] Thuật ngữ nhất quán: Project/Trip (không còn Trip/Dive trong Ch2, 3, 4, 5, 6)
- [ ] Thuật ngữ trong Phụ lục B cần sửa ("Trips/Dives" → Project/Trip)
- [x] Caption hình đặt dưới hình
- [x] Caption bảng đặt dưới bảng
- [ ] Số trang đúng sau compile

---

## GHI CHÚ KỸ THUẬT QUAN TRỌNG

### Media lifecycle — 2 field RIÊNG BIỆT
```
media.status         : pending | ready | failed         ← trạng thái upload S3
media.analysisStatus : idle | pending | done | failed   ← trạng thái YOLO
```
**KHÔNG** có trạng thái `analyzing` trong code — chỉ `pending` → `done`/`failed`.

### State diagrams enum đúng
```
Project: planned → ongoing → completed | cancelled
Trip:    pending → running → done | failed
```

### Presigned URL flow (4 bước)
1. Client → Backend: `POST /media/upload-url {filename, type}`
2. Backend → Client: `{ presignedUrl, mediaId }`
3. Client → S3: `PUT presignedUrl (file binary)`
4. Client → Backend: `POST /media/:id/confirm`

### SSE mechanism
- Server: `Map<userId, res>`, `Content-Type: text/event-stream`
- Format: `data: JSON.stringify(payload)\n\n`
- Client: `new EventSource('/api/v1/notifications/stream')` — auto-reconnect

### Z-Score formula
$$z = \frac{x - \mu}{\sigma}, \quad |z| > 2{,}5 \text{ là outlier}$$
Áp dụng cho 7 metric: depth, temp, temperature, pressure, voltage, battery_percent, humidity

---

*Cập nhật lần cuối: 2026-06-25*
