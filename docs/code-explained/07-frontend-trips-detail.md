# TripDetailPage — Trang "Cockpit" chi tiết một lần lặn (Trip)

> Tài liệu này giải thích chi tiết toàn bộ mã nguồn frontend liên quan tới `TripDetailPage` — trang phức tạp và quan trọng nhất của đồ án. Đây là nơi hội tụ 6 tính năng lớn: layout cockpit 3 cột, sensor chart + anomaly detection, video-sensor sync, YOLOv8 object detection (bbox overlay + per-frame tracking), evidence system (photo/clip), sonar viewer (parse binary), và auto-frame brush theo video.
>
> Tất cả các file bên dưới nằm trong `frontend/src/features/trips/`.

---

## Tổng quan Layout Cockpit 3 cột của TripDetailPage

`TripDetailPage.jsx` (1884 dòng) là component gốc, dựng layout kiểu buồng lái ("cockpit") không cuộn trang trên desktop (`lg:h-[calc(100vh-4rem)] lg:overflow-hidden`), nhưng cho phép cuộn dọc trên mobile (`overflow-y-auto`, layout full-stack).

Cấu trúc DOM tổng thể:

```
<div class="-m-4 md:-m-6 ... flex flex-col ...">
  <TripHeader/>                                    ← header h-11, sticky, status + actions
  <div class="flex-1 flex flex-col lg:flex-row">    ← MIDDLE ROW — 3 cột
    ├── LEFT   (w-[18%], 180-280px)
    │     ├── Location (TrajectoryViewer, map/path)      — ẩn khi statusExpanded=true
    │     └── CurrentStatus (KPI cards, auto-size)
    ├── CENTER (flex-1, video player, luôn ở giữa)
    │     ├── MainMedia (video/ảnh + DetectionSVG bbox overlay)
    │     ├── EvidenceViewer (overlay khi xem lại evidence)
    │     ├── Top gradient toolbar (filename, Detect, Analyze, Photo, Clip, Evidence, Playlist, More)
    │     ├── LIVE SYNC badge, YOLO class badges
    │     ├── EvidencePanel / Playlist (overlay phải hoặc thanh ngang dưới, tùy không gian)
    │     ├── CustomVideoControls (progress bar, play/pause, mute, fullscreen)
    │     └── (chỉ khi isSonarMode) BottomChart inline bên dưới video
    └── RIGHT  (w-[18%], 180-280px)
          ├── Navigation gauges (ArtificialHorizon + CompassRose, SVG)
          ├── SonarViewer (chỉ khi isSonarMode hoặc mobile)
          └── AlertsPanel (danh sách anomaly / all-clear)
  </div>
  <BottomChart/>   ← luôn full-width dưới cùng (trừ khi isSonarMode trên desktop, khi đó chart chuyển vào giữa)
  <portals: MoreMenu, RecordedAtEditor, FileInfo>
  <modals: DataFilesModal, TripForm, ROVDataUpload, ConfirmDialog>
</div>
```

**Điểm đặc biệt về responsive/layout mode:**
- **`isSonarMode`** (state, chỉ desktop): khi bật, cột phải hiện `SonarViewer` thay vì ẩn, và `BottomChart` "nhảy" từ vị trí full-width phía dưới vào bên trong cột giữa (dùng chung component `BottomChart` với `variant='inline'`). Đây là cách UI "mượn" không gian màn hình để hiện sonar mà không cần thêm hàng dọc.
- **`isMobile`** (`window.innerWidth < 1024`): trên mobile luôn hiện đầy đủ layout (không cần toggle sonar) vì màn hình đã xếp chồng dọc.
- **`statusExpanded`**: khi user bấm nút mở rộng trong `CurrentStatus`, panel Location (bản đồ) bị ẩn để `CurrentStatus` chiếm toàn bộ chiều cao cột trái, hiện đủ 8 KPI card thay vì 4.
- **`canShowHorizontalPlaylist`**: dùng `ResizeObserver` đo chiều cao container video so với chiều cao video thực tế (theo aspect ratio) — nếu có đủ ≥110px "thanh đen" phía dưới video (letterboxing), Playlist/Evidence panel chuyển từ overlay dọc bên phải (`w-44`, trượt vào từ phải) sang thanh ngang cố định bên dưới video (`h-[110px]`, cuộn ngang). Đây là tối ưu UX: tận dụng không gian đen thừa thay vì che video.

---

## Tổng quan cơ chế Video-Sensor Sync (2 mode: có metadata / video thường)

Đây là tính năng lõi của TASK 6c, được cài trong `TripDetailPage.jsx` + `BottomChart.jsx` + `TrajectoryViewer.jsx` + `SonarViewer.jsx`.

**Nguyên lý chung:** mọi nguồn dữ liệu thời gian thực (sensor chart, GPS/DVL trajectory, sonar) đều được đồng bộ qua một "trục thời gian tuyệt đối" duy nhất: **UTC milliseconds**, tính từ `media.recordedAt` (thời điểm bắt đầu quay, lưu trong DB, có thể do người dùng nhập tay hoặc tự động parse từ tên file/manifest — xem TASK 6d, TASK 9).

**Mode A — Video có metadata (`media.recordedAt` khác null):**
1. `<video>` phát → sự kiện `timeupdate` → `handleTimeUpdate()`:
   ```js
   if (media?.recordedAt) setSyncTs(new Date(media.recordedAt).getTime() + video.currentTime * 1000)
   setCurrentVideoTime(video.currentTime)
   ```
   → `syncTs` = mốc UTC ms hiện tại của khung hình đang phát.
2. `syncTs` được truyền xuống 3 nơi:
   - `TrajectoryViewer` qua prop `currentUTC` → tính lại `visibleData` (subset DVL point có `absoluteMs <= currentUTC`) → animate marker + polyline trên bản đồ/relative path.
   - `SonarViewer` qua prop `currentUTC` → tự chọn file sonar có `recordedAt <= currentUTC <= recordedAt+durationMs`, tính `offsetMs = currentUTC - fileStart` rồi gọi `syncToTime(offsetMs)` để vẽ đúng frame quạt sonar.
   - `BottomChart` — không nhận `syncTs` trực tiếp mà nhận `syncIdx` (index đã tính sẵn trong `TripDetailPage`):
     ```js
     const syncIdx = useMemo(() => {
       // tìm reading (không phải null sentinel) gần syncTs nhất trong chartData
     }, [syncTs, chartData])
     ```
     `BottomChart` vẽ `<ReferenceLine x={chartData[syncIdx].timestamp}>` — đường thẳng đứng màu đỏ nét đứt di chuyển theo video, có label mũi tên `▶`.
3. Badge **LIVE SYNC** (chấm đỏ nhấp nháy) hiện góc trên-trái video khi `syncTs != null`.

**Mode B — Video thường (không có `recordedAt`):**
- `syncTs` luôn `null` → không có ReferenceLine, không animate map/sonar — chart hiển thị độc lập (toàn bộ dữ liệu, không có "con trỏ" chạy theo).
- Playlist tự động chuyển bài: `handleVideoEnded()` tìm video kế tiếp **có `recordedAt` lớn hơn hiện tại** để nối tiếp theo thời gian; nếu không video nào thoả, không tự chuyển (người dùng chọn tay từ playlist).

**Vai trò của `TrajectoryViewer`:** ngay cả khi không sync (`currentUTC = null`), nó vẫn hiển thị toàn bộ trajectory tĩnh (không animate) — cơ chế "graceful degrade" giữa 2 mode nằm ở việc dùng cùng 1 component nhưng khác giá trị `isAnimating = currentUTC != null && hasAbsoluteTime && withinSyncRange`.

---

## Tổng quan cơ chế YOLO Bbox Overlay + Per-frame tracking

Cài trong `TripDetailPage.jsx` (state + `useMemo`) và render qua `DetectionSVG` (trong `MediaShared.jsx`).

**Dữ liệu vào:** `media.labels: [{ name, confidence, frameTime, bbox, trackId }]` — với video, có thể có **nhiều entry cho cùng 1 class** ở các `frameTime` khác nhau (per-frame tracking, TASK 6b-2), khác với ảnh tĩnh (chỉ 1 entry/class, không có `frameTime`).

**Chuỗi tính toán (trong `TripDetailPage.jsx`):**
1. `hasPerFrame` = `true` nếu **bất kỳ** label nào có `frameTime != null`. Đây là cách đơn giản và chính xác để phân biệt video có tracking per-frame với ảnh/video kiểu cũ (1 label/class, không frameTime).
2. `withFrameLabs` = tất cả labels có `frameTime` (chỉ tính khi là video).
3. `activeLabs` — labels thực sự vẽ lên overlay tại thời điểm hiện tại:
   ```js
   const nearestTime = withFrameLabs.reduce((best, l) =>
     Math.abs(l.frameTime - currentVideoTime) < Math.abs(best - currentVideoTime) ? l.frameTime : best,
     withFrameLabs[0].frameTime)
   if (Math.abs(nearestTime - currentVideoTime) > 0.7) return []   // quá xa → ẩn hết
   return withFrameLabs.filter(l => l.frameTime === nearestTime)   // lấy đúng frame gần nhất
   ```
   Tức là: tìm `frameTime` gần với `currentVideoTime` (cập nhật theo `timeupdate`) nhất, rồi lấy **tất cả** label có đúng `frameTime` đó (một khung hình có thể có nhiều object). Nếu khoảng cách > 0.7s (frame sampling interval của YOLO service thường 0.2-1.0s tùy độ dài video), coi như không có detection ở thời điểm này → ẩn overlay (tránh "đứng hình" bbox cũ).
   Nếu ảnh tĩnh hoặc dữ liệu kiểu cũ (không per-frame) → trả về toàn bộ `labs` luôn (không cần lọc theo thời gian).
4. `classGroups` — gom theo `name`, tính `count` và `maxConf`, dùng để hiện các **badge lớp** (pill màu xanh/vàng tuỳ `maxConf > 0.8`) phía dưới video, click để filter (`selectedClass`).
5. `visibleLabs` = `activeLabs` lọc theo `selectedClass` nếu có chọn — đây là mảng cuối cùng truyền vào `<MainMedia activeLabs={visibleLabs}>` → `DetectionSVG`.

**`DetectionSVG` (trong `MediaShared.jsx`)** — vẽ overlay:
- Dùng `<svg viewBox="0 0 {dims.w} {dims.h}">` với `dims` = kích thước gốc video/ảnh (`videoWidth/videoHeight` hoặc `naturalWidth/naturalHeight`) để bbox (toạ độ chuẩn hoá 0-1 từ YOLO) luôn khớp bất kể video hiển thị theo `object-fit: contain`.
- Mỗi label: `<rect>` viền màu (`#60a5fa` xanh nếu `confidence>0.8`, `#fbbf24` vàng nếu thấp hơn) + `<rect>` nền nhãn + `<text>` tên & % confidence. Kích thước chữ/viền scale theo `dims.h`/`dims.w` để luôn đọc được dù video to/nhỏ.

**Đồng bộ `currentVideoTime`:** cập nhật trong `handleTimeUpdate` (mỗi sự kiện `timeupdate` của thẻ `<video>`, ~4 lần/giây theo chuẩn HTML5). Khi đổi media, `useEffect` reset `currentVideoTime = 0`.

**AI Settings Popover (`AIAnalyzePopover` trong `MediaShared.jsx`, TASK 6b-4):**
- Fetch `GET /media/models` để lấy danh sách model khả dụng (`{ name, label, speed, warning }`).
- State cục bộ: `selModel`, `conf` (0.1–0.9), `open`, `running`.
- Nút "Run Analysis" gọi `POST /media/:id/analyze { model, confidence }` → set `analysisStatus='pending'`. Nếu đang pending, nút đổi thành "Cancel Analysis" gọi `POST /media/:id/analyze/cancel`.
- Định vị popover bằng `getBoundingClientRect()` + `createPortal` để thoát khỏi `overflow-hidden` của container video — tính `pos.top/left` tương đối theo `portalTarget` (dùng `containerRef.current` khi fullscreen, `document.body` khi bình thường).
- `closeSignal` (prop, tăng dần) dùng để đóng popover này khi 1 popover/menu khác được mở (cơ chế "mutually exclusive popups" giữa Analyze, More menu, Sync editor, File info, Playlist, Evidence panel).

---

## Tổng quan Evidence System (Photo/Clip) ở phía Frontend

Cài chủ yếu trong `TripDetailPage.jsx` (capture logic) và `components/evidence/EvidenceShared.jsx` (panel + viewer UI).

**Capture Photo (`capturePhoto`, trong `TripDetailPage.jsx`):**
1. Set `flash=true` 50ms (hiệu ứng nháy trắng toàn màn hình, class `bg-white ... opacity-80`).
2. Nếu video đã kết thúc (`video.ended`), tua lại `video.duration - 0.5` để có thể chụp khung cuối.
3. Tạo `<canvas>` cùng kích thước `videoWidth/videoHeight`, `ctx.drawImage(video, 0, 0, w, h)`.
4. **Burn-in bbox**: nếu `showDetections && visibleLabs.length > 0`, vẽ trực tiếp lên canvas từng bbox (đường viền + nhãn nền màu + text) bằng Canvas 2D API — cùng công thức tỷ lệ với `DetectionSVG` nhưng vẽ pixel thật thay vì SVG. Kết quả: ảnh PNG/JPEG xuất ra có bbox "nướng" cố định vào ảnh (khác với overlay SVG chỉ tồn tại lúc xem).
5. `canvas.toDataURL('image/jpeg', 0.85)` → `dataUrl`. Nếu canvas bị "tainted" do CORS (video load từ S3 khác origin), bắt lỗi và để `dataUrl = null` — báo cho backend biết cần tự trích frame từ file gốc bằng FFmpeg (`GET /snapshots/:id/frame-at`).
6. Gọi `POST /snapshots { type: 'photo', tripId, parentMediaId, imageTime, dataUrl }` — không `await`, fire-and-forget, invalidate `['snapshots', id]` khi xong.

**Record Clip (`toggleClipRecording`):**
- Lần bấm đầu: lưu `clipStart = video.currentTime` (state), nút chuyển đỏ + `animate-pulse` + hiện thời lượng đang đếm `fmtVideoTime(currentVideoTime - clipStart)`.
- Lần bấm thứ hai (Stop): tính `startTime = clipStart`, `endTime = video.currentTime`, reset `clipStart = null`. Nếu `endTime <= startTime` thì bỏ qua (tránh clip rỗng/âm).
- Tạo thumbnail bằng canvas (frame hiện tại, không burn bbox cho clip — chỉ để preview).
- `POST /snapshots { type: 'clip', tripId, parentMediaId, startTime, endTime, dataUrl }`.

**`EvidencePanel` (trong `EvidenceShared.jsx`)** — 2 chế độ hiển thị:
- **Dọc** (`isHorizontal=false`, mặc định): overlay `absolute top-0 right-0 bottom-0 w-44`, trượt vào bằng `translate-x-full → translate-x-0`. Style giống Playlist (`ThumbVertical`): mỗi card là `EvidenceCard` — thumbnail `aspect-video`, badge góc trên-trái `PHOTO`/`CLIP` (chữ, không icon), badge góc trên-phải số lượng AI labels (xanh lá khi `done`, xanh dương pulse khi `pending`, đỏ `err` khi `failed`), nhãn thời gian dưới cùng.
- **Ngang** (`isHorizontal=true`): dùng khi `canShowHorizontalPlaylist=true` — thanh `h-[110px]` cuộn ngang, mỗi card `w-32`.
- Hỗ trợ **Select mode**: chọn nhiều evidence → bulk delete (`DELETE /snapshots/bulk`).
- `currentMediaSnapshots = snapshots.filter(s => s.parentMediaId === currentMediaId)` — chỉ hiện evidence của video đang xem, tách biệt hoàn toàn khỏi Media Playlist.

**`EvidenceViewer` (trong `EvidenceShared.jsx`)** — overlay toàn màn hình video (`absolute inset-0 z-40`) khi click 1 evidence:
- **Photo**: hiện `<img>` (từ `imageUrl`/`thumbnailUrl`) + `DetectionSVG` nếu bật Detect.
- **Clip**: hiện `<video>` dùng **cùng URL presigned với media gốc** (`useMediaUrl(media._id)`), nhưng bị "kẹp" trong khoảng `[startTime, endTime]`:
  - `onLoadedMetadata`: set `e.target.currentTime = startTime`.
  - `handleEvidenceTimeUpdate`: tính `elapsed = clamp(v.currentTime - startTime, 0, clipDuration)`, nếu `v.currentTime >= endTime - 0.05` thì `v.pause()` (dừng đúng tại điểm kết thúc clip, không phát tràn qua đoạn tiếp theo của video gốc).
  - Khi bấm Play lại sau khi hết clip, code kiểm tra `currentTime >= endTime - 0.1` và tua về `startTime` trước khi play — cơ chế "restart clip".
- **Bbox per-frame cho clip**: nếu `aiLabels` có `frameTime`, cần xác định `frameTime` là **tuyệt đối** (thời gian trong video gốc) hay **tương đối** (0-based từ đầu clip) — code check `isAbsolute = withFrame.some(l => l.frameTime >= startTime - 0.5)`, từ đó tính `compareTime` phù hợp rồi áp dụng cùng công thức "nearest frame, ẩn nếu lệch >0.7s" như MainMedia.
- Có `AIAnalyzePopover`-tương-tự cục bộ (model selector + confidence slider) gọi `POST /snapshots/:id/analyze`.
- Download: PNG (burn bbox vào canvas nếu đang bật Detect) hoặc MP4 (clip) — MP4 gọi endpoint backend trích xuất bằng FFmpeg (`GET /snapshots/:id/download-clip`).

**Edge case xử lý:** nút Photo/Clip chỉ render khi `media && resolveType(media) === 'video'` (không hiện khi đang xem ảnh); khi `activeEvidence` đang mở, `MainMedia` gốc bị tạm dừng (`useEffect` pause video) và các control chính (`CustomVideoControls`) bị ẩn để tránh 2 layer điều khiển video chồng nhau.

---

## Tổng quan Sonar Viewer (parse binary + player)

3 file: `useSonarParser.js` (đọc & giải mã file `.sonar`), `useSonarPlayer.js` (điều khiển phát/tua), `SonarCanvas.jsx` (vẽ canvas), `SonarViewer.jsx` (kết nối UI + data + player).

**Định dạng file `.sonar` (custom binary, magic `"SONAR360"`):**
```
Header (32 bytes): 8 byte magic "SONAR360" + phần còn lại (không dùng ở frontend)
Sau đó là chuỗi Frame liên tiếp, mỗi Frame:
  - timestampMs : int64 LE (8 byte) — chia thành 2 uint32 (lo, hi) vì JS không có int64 native:
        const timestampMs = hi * 0x100000000 + lo
  - angleGrads  : uint16 LE (2 byte) — góc quét, đơn vị "grad" trên thang 0–399 (400 = 1 vòng tròn)
  - numSamples  : uint16 LE (2 byte) — số mẫu cường độ phản hồi trong tia quét này
  - data[numSamples] : mảng byte cường độ (0-255), 1 byte/mẫu
```
`parseSonarBuffer()` (trong `useSonarParser.js`) lặp qua buffer, dừng khi frame tiếp theo vượt quá kích thước file (chống file bị cắt cụt). Giữ `data` là **view zero-copy** (`new Uint8Array(buffer, offset, numSamples)`) — không copy dữ liệu, tiết kiệm bộ nhớ với file sonar dài.

`useSonarParser(url)` — hook tải file qua `XMLHttpRequest` (không dùng `fetch` vì cần `onprogress` để hiện % tải), `responseType='arraybuffer'`, trả về `{ frames, loading, error, progress }`.

**Vẽ 1 tia quét (`SonarCanvas.jsx` — `drawSpokeOnCtx`):**
- Canvas 400×400, tâm `(200,200)`, bán kính tối đa `maxR = 198`.
- `angle = (angleGrads / 400) * 2π - π/2` — quy đổi grad → radian, trừ `π/2` để 0 grad = hướng lên (Bắc) thay vì hướng phải (chuẩn toán học).
- Với mỗi mẫu `i` trong `data` (giới hạn bởi `maxRange` — tỉ lệ % bán kính hiển thị, VD 50%/75%/100%): bỏ qua nếu cường độ `< 6` (nhiễu nền), tính toạ độ `(x,y) = center + r·(cosA, sinA)` với `r = (i/data.length)·maxR`, map cường độ sang màu qua `COLOR_FNS` (4 chế độ: `heatmap` xanh dương→xanh lá→đỏ, `green`, `white`, `yellow`), vẽ 1 pixel (`fillRect(x,y,1,1)`).
- Component export ra `ref` với API mệnh lệnh (`useImperativeHandle`): `clear()` và `drawSpoke(frame, colorMode, maxRange)` — cho phép `useSonarPlayer` vẽ trực tiếp lên canvas mà không qua re-render React (hiệu năng cao, cần thiết vì có thể có hàng trăm tia/giây).

**`useSonarPlayer.js`** — quản lý phát lại kiểu "radar sweep" (giống màn hình sonar thật, các tia cũ mờ dần theo thời gian là hiệu ứng bồi tích chứ không xóa):
- `play()`: dùng vòng lặp `requestAnimationFrame`, tính `dtMs` (thời gian thực trôi qua × `speed`), tìm tất cả frame có `timestamp - t0 ≤ tEnd` kể từ frame hiện tại rồi vẽ tuần tự (không skip, giữ đúng thứ tự quét).
- `rebuildView(toIdx)`: khi tua (seek) hoặc đổi `colorMode`/`maxRange`, cần vẽ lại toàn bộ "ảnh quét tích luỹ" — thuật toán quét ngược từ `toIdx`, giữ **frame gần nhất cho mỗi góc** (`byAngle` Map, tối đa 400 góc = 1 vòng đủ), rồi vẽ theo thứ tự góc tăng dần. Đây là mô phỏng đúng cách màn hình sonar thật hiển thị (mỗi góc chỉ giữ lại lần quét gần nhất, không chồng chất tia cũ).
- `syncToTime(ms)` — hàm dùng cho **sync với video** (khác `seekToTime` dùng cho user tua tay): binary search tìm `targetIdx`, nếu là bước tiến nhỏ (≤20 frame) thì **chỉ vẽ thêm** các frame mới (không `setFrameIdx` → không re-render React, tối ưu vì `timeupdate` video bắn ra rất thường xuyên); nếu bước lớn hoặc lùi thì `rebuildView` đầy đủ.

**`SonarViewer.jsx`** — kết dính data + player + UI:
- Query danh sách file `GET /trips/:id/sonar` (nhiều file/trip — TASK 6d).
- 2 chế độ chọn file: **manual** (dropdown, khi không sync) và **auto-switch** (khi có `currentUTC` từ video — tìm file có `recordedAt ≤ currentUTC ≤ recordedAt+durationMs`).
- Khi đồng bộ: tính `offsetMs = currentUTC - fileStartMs` rồi gọi `syncToTime(offsetMs)`. Nếu không file nào bao phủ `currentUTC` (nhưng có ít nhất 1 file có `recordedAt`), hiện overlay mờ "No sonar at this time" thay vì ẩn hẳn component.
- Cho phép chỉnh `colorMode` (4 lựa chọn) và `maxRange` (25/50/75/100%) qua 2 `<select>` nhỏ ở dưới canvas.

---

## Tổng quan Auto-frame Brush theo video

Cài trong `TripDetailPage.jsx` (logic tính toán) + `BottomChart.jsx` (render `<Brush>` controlled).

**Mục tiêu:** khi chọn 1 video trong playlist, thanh Brush (range selector dưới chart Recharts) tự "zoom" vào đúng khoảng thời gian video đó phủ, thay vì luôn hiện toàn bộ chart.

**State:** `brushRange` (`{ startIndex, endIndex } | null`, `null` = full range) và `brushUserOverride` (boolean — user đã tự kéo brush tay hay chưa).

**2 `useEffect` phối hợp:**
1. Reset override khi đổi video: `useEffect(() => setBrushUserOverride(false), [media?._id])`.
2. Tính brush tự động (bỏ qua nếu `brushUserOverride === true`):
   ```js
   if (!media?.recordedAt || rawChartData.length === 0) { setBrushRange(null); return }
   const videoStart = new Date(media.recordedAt).getTime()
   const durSec = videoDuration > 0 ? videoDuration : (media?.meta?.duration ?? 120)
   const videoEnd = videoStart + durSec * 1000
   // quét tuyến tính rawChartData tìm startIdx (ts đầu tiên ≥ videoStart) và endIdx (ts cuối cùng ≤ videoEnd)
   if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) { setBrushRange(null); return }  // video ngoài phạm vi sensor
   // map index của rawChartData (không có gap sentinel) sang index của chartData (có gap sentinel) bằng identity so sánh object
   const buf = Math.max(Math.floor((ei - si) * 0.1), 3)   // buffer 10%, tối thiểu 3 điểm
   setBrushRange({ startIndex: max(0, si-buf), endIndex: min(len-1, ei+buf) })
   ```
   Điểm tinh tế: `useMemo` tính `chartData` (có chèn "gap sentinel" — điểm `null` giữa ranh giới đổi `sourceFile`, xem TASK 6d-5) tách biệt khỏi `rawChartData` gốc; effect này dùng `rawChartData` để tránh bị trigger lại mỗi khi `chartData` được tính lại do thay đổi tham chiếu, sau đó **ánh xạ ngược** sang index của `chartData` bằng so sánh **object identity** (`chartData.findIndex(d => d === rawStart)`) — vì các phần tử reading gốc được giữ nguyên tham chiếu khi chèn sentinel xen giữa.
3. `onBrushChange` (khi user tự kéo brush): set `brushUserOverride = true` rồi cập nhật `brushRange` theo giá trị Recharts trả về — từ đó tắt auto-frame cho đến khi đổi video khác.

**`BottomChart.jsx`** nhận props `brushRange`/`onBrushChange`, spread vào mọi `<Brush startIndex={brushRange?.startIndex} endIndex={brushRange?.endIndex} onChange={onBrushChange}>` ở cả 3 tab (Environment, Navigation khi có `hasNavData`, System). Khi `brushRange = null`, `startIndex/endIndex = undefined` → Recharts tự hiểu là full range.

---

## Chi tiết từng file

### `frontend/src/features/trips/TripDetailPage.jsx`

- **Chức năng chính:** Component trang `/trips/:id`. Dựng toàn bộ layout cockpit 3 cột, quản lý toàn bộ state tương tác (video playback, playlist, evidence, popup, brush, sonar mode...), gọi API và điều phối dữ liệu xuống các sub-component.
- **Props/API chính:** Không nhận props (route component). Đọc `id` từ `useParams()`. Gọi các API: `GET /trips/:id`, `GET /media/trip/:id`, `GET /snapshots/trip/:id`, `GET /trips/:id/sensor-data`, `POST /snapshots`, `DELETE /media/:id`, `DELETE /snapshots/:id`, `PATCH /media/reorder`, v.v. (gián tiếp qua sub-component).
- **Logic chi tiết:**
  - **State declarations (dòng ~183-263):** hơn 40 state — chia nhóm: form/modal toggles (`showForm`, `showROVUpload`, `showDataFiles`...), playback (`selIdx`, `isVideoPlaying`, `currentVideoTime`, `videoDuration`, `videoMetadataVersion`), overlay UI (`showToolbar`, `showCenterPauseBtn`, `showDetections`, `selectedClass`), popup nhất quán (`showMoreMenu`, `showSyncEditor`, `showFileInfo`, `analyzePopoverOpen` — dùng chung biến `popupOpen` để tính hiển thị toolbar), evidence (`clipStart`, `isCapturingPhoto`, `activeEvidence`, `isEvidencePanelOpen`), brush (`brushRange`, `brushUserOverride`), layout mode (`isSonarMode`, `statusExpanded`, `isMobile`, `canShowHorizontalPlaylist`).
  - **`selIdx` (chỉ số media đang chọn) được lưu vào `sessionStorage`** theo key `trip:${id}:mediaIdx` để reload trang (F5) vẫn giữ đúng video đang xem; có clamp khi `mediaList` co lại (xoá media) tránh out-of-bounds.
  - **`DataFilesLeftPanel`** (component nội bộ, đầu file, dòng 51-171): panel gọn hiển thị danh sách file sensor/DVL/sonar trong cột trái — nhưng thực tế đã bị comment "removed as requested (now in 3-dot menu)" ở JSX render (dòng 998), tức là hàm này hiện **không được dùng trong render chính**, chỉ còn tồn tại dưới dạng dead code hoặc dự phòng (định nghĩa vẫn còn nhưng route hiển thị dữ liệu file qua `DataFilesModal` mở từ menu 3 chấm thay vì panel này).
  - **`useEffect` ResizeObserver (dòng 279-311):** tính `canShowHorizontalPlaylist` dựa trên chiều cao "thanh đen" dư ra quanh video (video có thể không lấp đầy toàn bộ khung nếu tỉ lệ khung hình khác 16:9).
  - **`chartData` (dòng 406-422):** chèn "gap sentinel" (điểm toàn `null`) tại ranh giới đổi `sourceFile` để Recharts vẽ đường đứt đoạn giữa các lần upload CSV khác nhau (TASK 6d-5) — điểm sentinel có timestamp là trung điểm giữa 2 điểm liền kề.
  - **Brush auto-frame (dòng 429-474):** xem mục tổng quan phía trên.
  - **Per-frame bbox (dòng 528-569):** xem mục tổng quan YOLO Bbox Overlay.
  - **`handleVideoEnded` (dòng 583-594):** logic auto-advance playlist — chỉ chuyển bài khi có video khác có `recordedAt` lớn hơn video hiện tại (chuyển đúng thứ tự thời gian thực, không phải thứ tự trong mảng).
  - **`capturePhoto` / `toggleClipRecording`:** xem mục tổng quan Evidence System.
  - **`syncIdx` (dòng 745-754):** tìm điểm chart gần `syncTs` nhất, bỏ qua các gap sentinel (`d.depth == null`).
  - **Export CSV/PNG (`exportCsv`, `exportChartPng`):** CSV xuất trực tiếp từ `rawChartData` (không qua gap sentinel); PNG lấy `<svg>` con trong `chartContainerRef`, serialize XML, vẽ vào `<canvas>` ở độ phân giải gấp đôi (`w*2, h*2` + `ctx.scale(2,2)`) để ảnh nét hơn, nền theo dark/light mode.
  - **Bug tiềm ẩn phát hiện:** dòng 1164, prop `onTimeUpdate={handleEvidenceTimeUpdate}` được truyền vào JSX nhưng **`handleEvidenceTimeUpdate` không được định nghĩa trong file này** — nó chỉ tồn tại như hàm nội bộ của `EvidenceViewer` (component riêng trong `EvidenceShared.jsx`). Đoạn JSX chứa dòng này (924-1257) là **legacy code đã bị "khoá" bằng `{false && ...}`** (dòng 1032) — tức là toàn bộ khối cũ (đã được thay bằng component `EvidenceViewer` mới ở dòng 1022-1025) không bao giờ render, nên tham chiếu treo tới hàm không tồn tại không gây lỗi runtime nhưng là code chết cần dọn dẹp.
  - **Portal-based popups:** menu 3 chấm (`showMoreMenu`), `RecordedAtEditor` (sync time), File info — đều dùng `createPortal(..., document.body)` với vị trí tính bằng `getBoundingClientRect()`, để thoát khỏi `overflow-hidden`/`isolation:isolate` của container video.
- **Kết nối với file khác:** import gần như toàn bộ các file được liệt kê bên dưới (`TripForm`, `ArtificialHorizon`, `CompassRose`, `ROVDataUpload`, `SectionLabel`, `TripHeader`, `LocationPanel`, `AlertsPanel`, `CurrentStatus`, `TrajectoryViewer`, `BottomChart`, `DataFilesModal`, `SonarViewer`, các hàm/component từ `MediaShared` và `EvidenceShared`).
- **Điểm đáng chú ý:**
  - **Performance:** rất nhiều `useMemo`/`useCallback` để tránh tính lại `chartData`, `activeLabs`, `classGroups`... mỗi lần render; tuy nhiên với hơn 40 state trong 1 component, re-render cha xảy ra thường xuyên — các sub-component nặng (chart, map, sonar) được tách ra file riêng để React có thể memo hoá độc lập nếu cần (dù hiện tại không thấy dùng `React.memo` tường minh).
  - **Edge case không có GPS:** `hasGps = trip.gpsLocation?.lat != null && ...` — `TrajectoryViewer` tự xử lý phía trong.
  - **Edge case không có video (chỉ ảnh hoặc trip trống):** `MainMedia` trả về empty state riêng; `syncTs`/brush đều `null`.
  - **Edge case video không có `recordedAt`:** brush trả `null` (full range), không có ReferenceLine, không auto-advance theo thời gian.

---

### `frontend/src/features/trips/TripsPage.jsx`

- **Chức năng chính:** Trang danh sách tất cả Trip (`/trips`), độc lập với 1 Project cụ thể — dùng để tìm kiếm/lọc trip trên toàn hệ thống.
- **Props/API chính:** `GET /trips` (phân trang, filter theo `search`, `projectId`, `status`, `fromDate`, `toDate`), `GET /projects` (lấy danh sách để filter theo project), `DELETE /trips/:id`.
- **Logic chi tiết:** Dùng `useDebounce` cho ô tìm kiếm; `keepPreviousData: true` + `refetchInterval: 30000` để danh sách luôn cập nhật nhưng không giật khi chuyển trang. Có 2 layout: bảng desktop (`MarineTable`, ẩn dưới `xl`) và card mobile (`xl:hidden`). Export CSV/PDF gọi lại API với `limit: 1000` để lấy toàn bộ kết quả đã filter (không giới hạn theo trang).
- **Kết nối với file khác:** dùng `TripForm` (sửa trip), các component `Marine*` (input/select/table dùng chung toàn app), `ExportMenu`, `export.js`.
- **Điểm đáng chú ý:** Không có logic đặc thù cockpit — đây là trang danh sách chuẩn (CRUD table), không liên quan trực tiếp tới video/sensor sync.

---

### `frontend/src/features/trips/TripList.jsx`

- **Chức năng chính:** Danh sách Trip **bên trong 1 Project** (nhúng trong `ProjectDetailPage`), hiển thị dạng card có thể expand, hỗ trợ kéo-thả (drag & drop) media giữa các trip.
- **Props/API chính:** `projectId`, `projectGpsLocation`. Query `GET /projects/:projectId/trips`; mutation `DELETE /trips/:id`.
- **Logic chi tiết:**
  - **`TripCard`** — card có thể `expanded`; khi expand hiện `DataFilesBar` (pills tổng hợp Sensor/DVL/Sonar + nút "Manage Files" mở `DataFilesModal`) và `<MediaGallery tripId={trip._id}>` (component riêng ở `features/media/`, không nằm trong phạm vi tài liệu này).
  - **Drag & drop media giữa các Trip** dùng `@dnd-kit/core`: mỗi `TripCard` là 1 `useDroppable` zone (`id: trip-card-${trip._id}`). Kéo file từ trip A thả vào trip B → gọi `PATCH /media/:id/move { tripId }`. Kéo-thả trong cùng 1 trip (đổi thứ tự) → cập nhật `queryClient.setQueryData` lạc quan (optimistic) trước, rồi gọi `PATCH /media/reorder`, rollback bằng `invalidateQueries` nếu lỗi.
  - **Auto-expand khi kéo file lơ lửng trên card** (dòng 137-144): nếu đang kéo từ trip khác và hover ≥400ms trên 1 card đang collapse, tự động expand để user thả vào đúng vị trí trong gallery.
  - **`MediaThumb`** (nội bộ): thumbnail nhỏ 8×8 cho preview media trước khi expand — dùng `<video>` với `onLoadedMetadata` set `currentTime=1` để lấy khung hình giây thứ 1 làm poster (không dùng canvas, để trình duyệt tự cache).
  - **Import Folder** (`ROVDataUpload` với `projectId` thay vì `trip`) — cho phép tạo trip mới tự động từ tên file khi kéo cả thư mục vào.
- **Kết nối với file khác:** `TripForm`, `ROVDataUpload`, `MediaGallery` (module `media`), `DataFilesModal`.
- **Điểm đáng chú ý:** Đây là nơi duy nhất (ngoài `TripDetailPage`) cũng hiển thị dữ liệu sensor/DVL/sonar summary (qua `DataFilesBar`) nhưng ở mức tổng quan (pill đếm số file), chi tiết đầy đủ để trong `DataFilesModal` dùng chung.

---

### `frontend/src/features/trips/components/TripForm.jsx`

- **Chức năng chính:** Modal tạo/sửa Trip (title, status, objectives, description).
- **Props/API chính:** `projectId`, `tripData` (nếu có = edit mode), `onClose`. Gọi `POST /projects/:projectId/trips` hoặc `PATCH /trips/:id`.
- **Logic chi tiết:** Form đơn giản, không validate phức tạp ngoài `required` trên input title. Lưu ý: state `form` không có field `objectives` trong `useState` khởi tạo (chỉ có `title`, `description`, `status`) nhưng JSX vẫn render 1 `<MarineTextarea value={form.objectives}>` — đây là input "mồ côi" (uncontrolled giá trị `undefined`, React sẽ cảnh báo) do thiếu khởi tạo field `objectives` trong state ban đầu.
- **Kết nối với file khác:** dùng bởi `TripDetailPage`, `TripsPage`, `TripList`.
- **Điểm đáng chú ý:** Modal thuần, không có logic đặc thù cockpit.

---

### `frontend/src/features/trips/components/ArtificialHorizon.jsx`

- **Chức năng chính:** Vẽ đồng hồ "chân trời nhân tạo" (artificial horizon / attitude indicator) kiểu máy bay, hiển thị **pitch** (ngóc/cúi) và **roll** (nghiêng) bằng SVG thuần.
- **Props/API chính:** `pitch` (độ, mặc định 0), `roll` (độ, mặc định 0), `active` (bool — mờ đi `opacity-35` khi không có dữ liệu).
- **Logic chi tiết:**
  - Toạ độ tâm `(50,50)`, bán kính `r=45` trên `viewBox 0 0 100 100`.
  - `p = clamp(pitch, -40, 40)`, `horizonY = cy + p*scale` (với `scale=2.2`) — pitch dương (ngóc lên) đẩy đường chân trời **xuống dưới** tâm (giống thực tế: khi mũi ROV ngóc lên, "mặt đất" trong khung nhìn tụt xuống).
  - Vẽ 2 hình chữ nhật full-width: `Sky` (xanh, phía trên `horizonY`) và `Ground` (nâu, phía dưới) — mô phỏng bầu trời/mặt đất, được `clipPath` giới hạn trong hình tròn bezel.
  - Cả nhóm Sky+Ground+pitch-ladder được bọc trong `<g transform="rotate(-roll, cx, cy)">` — roll dương (nghiêng phải) xoay toàn bộ "chân trời" ngược chiều kim đồng hồ tương đối với khung nhìn cố định (đúng nguyên lý: khi phương tiện nghiêng phải, đường chân trời trong khung nhìn phi công nghiêng trái).
  - Pitch ladder: các vạch ngang tại `±10°, ±20°` với nhãn số độ; vạch `0°` (dài hơn, chia đôi bởi biểu tượng máy bay ở giữa).
  - Biểu tượng máy bay cố định (không xoay) ở giữa: 2 đoạn thẳng ngang màu cam + hình vuông nhỏ dọc + chấm tròn tâm — luôn cố định để biểu diễn "mũi ROV" trong khi nền xoay quanh nó.
  - Con trỏ bank angle (tam giác cam) xoay theo `-roll`, chạy trên vòng cung có các vạch chia tại `-60°,-30°,0°,30°,60°`.
- **Kết nối với file khác:** dùng trong `TripDetailPage` (cột phải, panel "Navigation"), nhận `pitch/roll` từ `currentReading` (điểm sensor gần `syncTs` nhất, hoặc `0` nếu chưa có sync).
- **Điểm đáng chú ý:** Component thuần trình bày (presentational), không có state/effect — re-render mỗi lần `pitch`/`roll` đổi (theo `timeupdate` video, tối đa vài lần/giây) nhưng chi phí thấp vì chỉ là SVG tĩnh không animation CSS phức tạp.

---

### `frontend/src/features/trips/components/CompassRose.jsx`

- **Chức năng chính:** Vẽ la bàn (compass rose) hiển thị **yaw** (hướng) bằng SVG.
- **Props/API chính:** `yaw` (độ, 0-360, mặc định 0), `active` (bool).
- **Logic chi tiết:**
  - `heading = ((round(yaw) % 360) + 360) % 360` — chuẩn hoá về khoảng `[0,360)` kể cả khi `yaw` âm.
  - Toàn bộ vòng chia độ + nhãn N/NE/E/SE/S/SW/W/NW được bọc trong `<g transform="rotate(-yaw, cx, cy)">` — khi ROV quay phải (yaw tăng), la bàn xoay ngược chiều kim đồng hồ trong khung nhìn, giữ **kim chỉ hướng cố định ở trên** (giống la bàn thật: mặt số xoay, kim/tam giác đỏ chỉ hướng luôn cố định hướng lên).
  - 36 vạch chia độ (mỗi 10°), vạch chính (mỗi 30°, `i%3===0`) dài hơn và đậm màu hơn.
  - Ô hiển thị số `heading` (dạng `"083°"`, pad 3 chữ số) cố định trên đỉnh, không xoay theo la bàn.
  - Tam giác đỏ cố định phía dưới ô số — chỉ hướng hiện tại của ROV.
- **Kết nối với file khác:** dùng trong `TripDetailPage` cạnh `ArtificialHorizon`, nhận `yaw` từ `currentReading`.
- **Điểm đáng chú ý:** Cùng triết lý với `ArtificialHorizon` — phần tử động xoay quanh phần tử tĩnh, không dùng animation transition (xoay tức thời theo giá trị mới) vì dữ liệu cập nhật theo sensor timestamp rời rạc chứ không cần mượt như game.

---

### `frontend/src/features/trips/components/DataFilesModal.jsx`

- **Chức năng chính:** Modal đầy đủ liệt kê tất cả file dữ liệu ROV (Sensor CSV, DVL JSON, Sonar) gắn với 1 trip, cho phép xoá từng file hoặc xoá hàng loạt.
- **Props/API chính:** `tripId`, `tripTitle`, `canEdit`, `onClose`. Query `GET /trips/:id/data-files` (trả `{ sensor: [], dvl: [], sonar: [] }`). Xoá: `DELETE /trips/:id/sensor-data?file=`, `DELETE /trips/:id/dvl?file=`, `DELETE /trips/:id/sonar/:sonarId`.
- **Logic chi tiết:**
  - **Phát hiện overlap giữa các file sensor** (`overlapping` — `useMemo`): so từng cặp `(a,b)` trong mảng `sensor`, nếu khoảng thời gian `[a.minTs, a.maxTs]` giao với `[b.minTs, b.maxTs]` thì đánh dấu cả 2 file "overlap" (viền vàng cảnh báo `⚠ Overlap` trong UI) — đây là hiển thị trực quan cho tình huống upload 2 file CSV có timestamp chồng lấn nhau (liên quan tới logic "first-in-first-keep" của backend, TASK 6d-1).
  - **Select mode + Bulk delete:** dùng `Set` để track các key đã chọn (dạng `"sensor::filename"`, `"dvl::filename"`, `"sonar::_id"`), `Promise.allSettled` để xoá song song rồi tổng hợp loại nào cần invalidate query nào.
  - Mỗi loại file có icon + màu badge riêng: Sensor (xanh dương, `Activity`), DVL (tím, `Navigation2`), Sonar (cyan, `Waves`) — nhất quán với `TYPE` trong `ROVDataUpload.jsx`.
- **Kết nối với file khác:** dùng bởi `TripDetailPage` (mở từ menu 3 chấm) và `TripList.jsx` (`DataFilesBar` → nút "Manage Files").
- **Điểm đáng chú ý:** Modal có thể mở từ 2 ngữ cảnh khác nhau (trang chi tiết trip và trang danh sách trip trong project) nhưng dùng chung 1 component — tránh trùng lặp logic xoá/hiển thị.

---

### `frontend/src/features/trips/components/ROVDataUpload.jsx`

- **Chức năng chính:** Modal upload dữ liệu ROV — hỗ trợ kéo-thả cả thư mục hoặc từng file (Sensor CSV, DVL JSON, Sonar binary, ZIP, video, ảnh, `trip_master.json` manifest), phân tích trước khi upload (preview), rồi gửi lên backend theo 2 luồng: batch upload (`upload-batch`) cho dữ liệu ROV thô, và presigned-URL upload cho media (video/ảnh).
- **Props/API chính:** `projectId` (chế độ tự tạo trip mới — "Import Folder"), `trip` (chế độ upload vào trip có sẵn), `onClose`, `onTripCreated`. Gọi: `POST /projects/:id/trips` (tạo trip), `POST /trips/:id/data/upload-batch` (multipart, nhiều file cùng lúc), `POST /media/presigned-url` + `PUT` S3 + `PATCH /media/:id/confirm` (media).
- **Logic chi tiết:**
  - **`classify(filepath)`:** phân loại file theo tên — `trip.json` → manifest (lưu ý: **khác với** TASK 9 spec ghi `trip_master.json`; code thực tế check `base === 'trip.json'`, có thể là điểm lệch giữa spec và implementation cần xác minh lại khi test thực tế), `dvl_*.json` → dvl, `.sonar` → sonar, `.zip` → zip, `.csv` → sensor, video/ảnh theo phần mở rộng.
  - **`parseSessionId(sessionId)`:** parse `session_YYYYMMDD_HHMMSS` (từ trong `trip_master.json`) thành `Date`, cộng thêm `+07:00` (giờ Việt Nam) vì hệ thống ghi log theo giờ địa phương chứ không phải UTC.
  - **`parseCsvPreview(text, filename)`:** tự động phát hiện delimiter (thử `;`, `,`, `\t`, chọn ký tự tách được nhiều cột nhất ở dòng header), map tên cột về field chuẩn qua `COL_MAP` (ví dụ `WaterTemperature`→`temp`, `Temperature`→`temperature`, xử lý ưu tiên để tránh 2 cột nhiệt độ giẫm lên nhau — dùng `sort` đẩy `watertemperature` lên trước khi build mapping). Trích `firstTimestamp` từ dòng dữ liệu đầu tiên — nếu cột timestamp chỉ có `HH:MM:SS` (không có ngày), tự ghép ngày lấy từ pattern trong tên file (`_YYYYMMDD_`) với giả định giờ Việt Nam (`+07:00`).
  - **`parseSonarPreview(file)`:** đọc **ngay trong trình duyệt** bằng `FileReader.readAsArrayBuffer`, decode header `SONAR360`, lặp qua từng frame (cùng thuật toán với `useSonarParser.js` phía backend player) chỉ để đếm `frames` và tính `durationMs` — mục đích thuần là hiện preview trước khi upload, không giữ lại toàn bộ data.
  - **`applyAutoSync(items)` — logic tự động gán `recordedAt` cho video (3 mức ưu tiên):**
    1. **Manifest** (`trip_master.json`, nếu có): map `asset.file` (basename) → `sessionStart + asset.start_ms`, chính xác đến mili-giây (TASK 9).
    2. **Tên file** (pattern `_YYYYMMDD_HHMMSS`): dùng `parseTimestampFromFilename` (bản sao ở frontend của hàm backend `parseTimestamp.util.js`), chính xác đến giây.
    3. **Sensor first timestamp** (fallback cuối, khi video không có timestamp trong tên): gán `recordedAtAutoSync: true` với timestamp dòng đầu tiên của file sensor CSV cùng batch — đây là suy đoán (video và sensor bắt đầu cùng lúc), kém chính xác nhất trong 3 mức.
  - **`uploadAll()` — luồng upload 3 bước:**
    1. Nếu `isCreateMode` (import folder → tạo trip mới): `POST /projects/:id/trips`, đặt tên tự động từ `parseTripName` (tìm pattern `\d{8}_\d{6}` trong tên file đầu tiên khớp, nếu không có dùng thời gian hiện tại).
    2. Batch upload (`sensor`, `dvl`, `sonar`, `zip`, `manifest`) — gộp tất cả vào 1 `FormData`, gửi 1 request `POST /trips/:id/data/upload-batch`. **Nếu bước này lỗi và trip vừa mới tự tạo, rollback bằng `DELETE /trips/:id`** (tránh để lại trip rỗng không có dữ liệu do lỗi upload).
    3. Media upload (video/ảnh) — upload **tuần tự từng file** qua `uploadMediaFile()` (presigned URL + XHR PUT theo dõi `onprogress` + `PATCH .../confirm`). Lỗi từng file được gom vào `mediaErrors` nhưng **không rollback trip** — vì đây là lỗi "một phần" chấp nhận được (trip vẫn có giá trị nếu ít nhất phần batch đã thành công).
  - **Thanh tiến trình `uploadProgress`:** chia theo tỉ lệ `batchEnd` (70% nếu có cả batch+media, 100% nếu chỉ có 1 loại) để phản ánh đúng % tổng thể qua nhiều bước khác nhau.
- **Kết nối với file khác:** dùng bởi `TripDetailPage` (nút Upload trong header/menu), `TripList.jsx` (nút Upload trong TripCard + "Import Folder").
- **Điểm đáng chú ý:**
  - **Edge case rollback:** chỉ rollback khi lỗi ở bước batch và trip vừa mới tạo — nếu upload vào trip đã có sẵn (`trip` prop truyền vào, không phải `projectId`), không bao giờ xoá trip dù lỗi.
  - **Edge case unknown files:** liệt kê số lượng, không chặn upload (chỉ cảnh báo "will be skipped").
  - **`webkitdirectory`** được set bằng `useEffect` + `setAttribute` thay vì JSX trực tiếp — vì React không hỗ trợ chuẩn hoá thuộc tính non-standard này qua props.

---

### `frontend/src/features/trips/components/SensorChart.jsx`

- **Chức năng chính:** Biểu đồ sensor **độc lập, gọn nhẹ** (LineChart 3 metric: depth/temp/pressure) — phiên bản "cũ hơn/đơn giản hơn" so với `BottomChart.jsx`, dùng trong ngữ cảnh không cần cockpit đầy đủ (có thể là trang khác ngoài TripDetailPage, hoặc để lại từ giai đoạn phát triển TASK 6 trước khi có TASK 6a cockpit).
- **Props/API chính:** `trip` (object đầy đủ, không phải chỉ `tripId`). Query `GET /trips/:id/sensor-data`.
- **Logic chi tiết:**
  - Không có gap sentinel, không có brush, không sync với video — chỉ là chart tĩnh hiển thị toàn bộ dữ liệu.
  - `AnomalyDot`: custom `dot` render prop của Recharts `<Line>` — kiểm tra `anomalySet.has("${dataKey}:${payload.timestamp}")`, nếu có thì vẽ `<circle r=5 fill="red">`, nếu không trả `null` (Recharts yêu cầu luôn trả về 1 SVG element hoặc null, không được trả `undefined`/`false`).
  - Legend toggle (`toggleMetric`) ẩn/hiện từng `<Line>` bằng cách set `opacity` trên nút và điều kiện `!hidden[key]` để không render `<Line>` đó.
  - Panel Anomalies liệt kê tối đa hiển thị scroll (`max-h-28 overflow-y-auto`), mỗi dòng hiện metric, giá trị, z-score, giờ.
  - GPS badge hiện `trip.locationName` + toạ độ nếu có.
- **Kết nối với file khác:** Không được import bởi `TripDetailPage.jsx` (đã chuyển hẳn sang `BottomChart.jsx`) — có thể vẫn được dùng ở nơi khác trong app (ví dụ tab preview nhanh) hoặc là component còn sót lại chưa dọn dẹp.
- **Điểm đáng chú ý:** Đơn giản hơn nhiều so với `BottomChart` — không có tab Navigation/System, không brush, không ReferenceLine sync. Đây gần như là phiên bản "MVP" trước khi cockpit layout (TASK 6a) ra đời.

---

### `frontend/src/features/trips/components/TrajectoryViewer.jsx`

- **Chức năng chính:** Hiển thị vị trí/quỹ đạo ROV — kết hợp dữ liệu GPS (1 điểm neo, từ Trip) và DVL (Doppler Velocity Log — chuỗi toạ độ tương đối theo thời gian). Có 3 chế độ: `map` (bản đồ Leaflet + marker GPS), `path` (SVG quỹ đạo tương đối, không cần bản đồ nền), `both` (bản đồ + polyline DVL vẽ chồng lên).
- **Props/API chính:** `tripId`, `hasGps`, `gpsLocation`, `currentUTC` (mốc đồng bộ video), `mode`/`onModeChange` (controlled từ parent), `onDvlStatus` (callback báo cho parent biết có đủ GPS+DVL để hiện toggle mode hay không). Query `GET /trips/:id/dvl` (trả `{ data: [{x,y,yaw,absoluteMs}], gpsAnchor: {lat,lng} }`).
- **Logic chi tiết:**
  - **Chuyển đổi toạ độ cục bộ DVL → WGS-84 (`dvlToLatLng`):** DVL trả toạ độ tương đối `(x,y)` mét tính từ điểm neo. Công thức xấp xỉ mặt phẳng cục bộ (flat-Earth, đủ chính xác cho quãng đường vài km):
    ```js
    lat = anchor.lat + (y / EARTH_R) * (180/π)
    lng = anchor.lng + (x / EARTH_R) * (180/π) / cos(anchor.lat * π/180)
    ```
    Số hạng `cos(lat)` bù trừ việc kinh tuyến "co lại" khi càng xa xích đạo (1° kinh độ ở vĩ độ cao tương ứng khoảng cách ngắn hơn ở xích đạo).
  - **`isAnimating`** = `currentUTC != null && hasAbsoluteTime && withinSyncRange`. `withinSyncRange` kiểm tra `currentUTC` không được lệch quá `SYNC_LOOKAHEAD_MS` (10 phút) so với điểm DVL đầu tiên — tránh trường hợp video và phiên ghi DVL cách nhau quá xa (ví dụ video của lần lặn khác) vẫn cố animate sai.
  - **`dvlFirstMs`** dùng `min` (không phải điểm đầu mảng) trên toàn bộ `absoluteMs` — phòng trường hợp có nhiều file DVL upload chồng, đảm bảo luôn neo theo mốc sớm nhất.
  - **`visibleData`** = subset các điểm có `absoluteMs <= currentUTC` khi đang animate, ngược lại là toàn bộ `dvlData` (tĩnh).
  - **`RelativePath`** (SVG con, khi không có GPS anchor hoặc chọn mode `path`):
    - Tự tính scale để toàn bộ trajectory vừa khung `280×280` (trừ padding), giữ tỉ lệ khung hình thật (không méo) bằng `scale = min(plotW/rangeX, plotH/rangeY)`.
    - **Follow mode**: khi đang animate, tự động set viewBox zoom quanh điểm cuối cùng (`ZOOM_W = W*0.6`, zoom ~1.7×) — giống chế độ "theo dõi" trên Google Maps khi định vị. Người dùng có thể kéo/zoom bằng chuột (`onMouseDown/Move/Up`) hoặc chạm (touch), việc này tự tắt `followMode`; có nút riêng để bật lại follow.
    - **Ghost path**: khi đang chờ tín hiệu đồng bộ đầu tiên (`isWaiting = isAnimating && visibleData.length === 0`), vẽ toàn bộ trajectory ở opacity thấp làm nền tham chiếu, để người dùng biết ROV "sẽ" đi đâu dù animation chưa bắt đầu.
    - Mũi tên con trỏ ROV xoay theo `yaw` của điểm cuối cùng (`transform="rotate(yaw)"`), có vòng pulse animate bằng SVG `<animate>` (không cần JS interval).
  - **Chế độ `map`/`both`:** render `<TripMap>` (Leaflet thật), truyền `dvlPath` (subset animate) và `dvlFullPath` (toàn bộ, chỉ dùng để `fitBounds` ban đầu).
  - **Không có DVL:** fallback về `<TripMap>` chỉ hiện marker GPS tĩnh, hoặc empty state "No GPS data" nếu không có gì cả.
- **Kết nối với file khác:** dùng bởi `TripDetailPage` (cột trái, panel Location — truyền `currentUTC=syncTs`) và `LocationPanel.jsx` (không truyền `currentUTC`, luôn tĩnh — dùng ở ngữ cảnh khác không cần sync).
- **Điểm đáng chú ý:**
  - Notify `onDvlStatus(bothGpsAndDvl)` mỗi khi thay đổi để `TripDetailPage` biết có nên hiện nút toggle `map/path/both` hay không (`showDvlToggle`).
  - Toàn bộ tính toán geo path dùng `useMemo` phụ thuộc đúng dependency để tránh tính lại mỗi frame animation (chỉ `visibleGeoPath` — phần thay đổi theo animation — mới tính lại thường xuyên).

---

### `frontend/src/features/trips/components/TripMap.jsx`

- **Chức năng chính:** Wrapper Leaflet.js thuần (không dùng `react-leaflet` — ghi chú trong CLAUDE.md là do incompatible với React 18.3), vẽ bản đồ OpenStreetMap với marker ROV có thể animate theo polyline DVL.
- **Props/API chính:** `lat`, `lng` (GPS anchor), `dvlPath` (mảng `[lat,lng]` animate), `dvlFullPath` (toàn bộ, cho fitBounds), `dvlYaw`, `isAnimating`, `showMarker`.
- **Logic chi tiết:**
  - Khởi tạo map 1 lần duy nhất (`useEffect` với dependency rỗng `[]`) — import động `leaflet` (code-splitting, giảm bundle size trang khác không cần map). Kiểm tra `inst.current || mapRef.current._leaflet_id` để tránh khởi tạo trùng khi React StrictMode gọi effect 2 lần.
  - **`makeROVIcon(L, yaw)`:** icon SVG tuỳ chỉnh (mũi tên trong vòng tròn mờ) xoay theo `yaw` — dùng `L.divIcon` (render HTML/SVG string trực tiếp thay vì ảnh PNG) để có thể xoay bằng CSS transform.
  - **`followRov`** (state): tự động pan theo marker khi `isAnimating`; nếu user kéo bản đồ (`map.on('dragstart', ...)`) thì tự tắt follow — trừ khi đang trong lúc code tự pan (`isMovingRef.current`, cờ chặn false-positive khi `panTo` tự kích hoạt sự kiện `dragstart`).
  - **Cập nhật realtime (useEffect phụ thuộc `dvlPath`):** gọi `polylineRef.current.setLatLngs(dvlPath)` (không tạo lại toàn bộ polyline — hiệu năng cao hơn nhiều so với remove+add), di chuyển marker bằng `setLatLng`, xoay icon bằng cách query trực tiếp DOM (`.rov-arrow` element) và set `transform` attribute — tránh phải tạo lại icon (`setIcon`) mỗi lần chỉ đổi góc.
  - Nút "Follow" (góc dưới-phải bản đồ) hiển thị khi `isAnimating`, màu xanh khi đang follow, xám khi user đã pan ra — bấm để `panTo` ngay lập tức về vị trí ROV và bật lại follow.
- **Kết nối với file khác:** dùng bởi `TrajectoryViewer.jsx` (cả 2 nhánh: có GPS đơn thuần, và `mode=map/both`).
- **Điểm đáng chú ý:** Toàn bộ thao tác Leaflet là **imperative** (gọi trực tiếp API Leaflet qua ref), không dùng state React để re-render bản đồ — đúng kiến trúc khuyến nghị khi tích hợp thư viện DOM-manipulation bên ngoài (tránh xung đột với Virtual DOM của React).

---

### `frontend/src/features/trips/components/SonarViewer/SonarCanvas.jsx`

- **Chức năng chính:** Component canvas thuần vẽ 1 tia quét sonar (spoke) lên `<canvas>` 400×400, expose API mệnh lệnh qua `ref`.
- **Props/API chính:** Không nhận props thường — chỉ nhận `ref` với 2 hàm: `clear()`, `drawSpoke(frame, colorMode, maxRange)`.
- **Logic chi tiết:** Xem mục tổng quan "Sonar Viewer" — `drawSpokeOnCtx` chuyển đổi từng mẫu cường độ (byte 0-255) thành 1 pixel màu tại toạ độ cực (r,θ) tính từ `angleGrads` và chỉ số mẫu.
- **Kết nối với file khác:** dùng bởi `useSonarPlayer.js` (qua ref) và render trong `SonarViewer.jsx`.
- **Điểm đáng chú ý:** Dùng `useImperativeHandle` để bypass hoàn toàn chu trình render React khi vẽ — cần thiết vì tốc độ vẽ có thể lên tới hàng trăm tia/giây khi phát nhanh, dùng state React sẽ gây giật lag nghiêm trọng.

---

### `frontend/src/features/trips/components/SonarViewer/SonarViewer.jsx`

- **Chức năng chính:** Component UI hoàn chỉnh cho sonar — chọn file, hiện canvas, điều khiển màu/tầm nhìn, tự động đồng bộ theo video.
- **Props/API chính:** `tripId`, `currentUTC`. Query `GET /trips/:id/sonar` (danh sách file), `GET /trips/:id/sonar/:id/url` (presigned URL từng file).
- **Logic chi tiết:** Xem mục tổng quan "Sonar Viewer".
- **Kết nối với file khác:** dùng `SonarCanvas`, `useSonarParser`, `useSonarPlayer`; được dùng bởi `TripDetailPage` (cột phải, chỉ hiện khi `isSonarMode` hoặc mobile).
- **Điểm đáng chú ý:** Phân biệt rõ 2 khái niệm thời gian: `timestampMs` bên trong file `.sonar` (đồng hồ phần cứng, không liên quan gì tới UTC thật) và `recordedAt` (mốc UTC thật lưu trong DB, set khi upload/parse tên file) — việc sync với video chỉ dùng **offset tương đối** (`currentUTC - fileStartMs`) để tra vào timeline nội bộ của file, không so sánh trực tiếp `timestampMs` với UTC.

---

### `frontend/src/features/trips/components/SonarViewer/useSonarParser.js`

- **Chức năng chính:** Hook tải + giải mã file binary `.sonar` từ URL.
- **Props/API chính:** `useSonarParser(url)` → `{ frames, frameCount, durationMs, loading, error, progress }`. Hàm thuần `parseSonarBuffer(buffer)` cũng được export riêng (dùng lại ở `ROVDataUpload.jsx`? — thực tế `ROVDataUpload` viết lại logic tương tự cục bộ thay vì import, có thể là trùng lặp code có thể refactor).
- **Logic chi tiết:** Xem mục tổng quan "Sonar Viewer" phần định dạng binary. Điểm kỹ thuật quan trọng: xử lý `int64` timestamp bằng cách đọc 2 `uint32`/`int32` riêng rồi ghép `hi * 0x100000000 + lo` — vì JavaScript `DataView` không có `getInt64` (trước khi `BigInt64` phổ biến), và giá trị mili-giây timestamp thực tế vẫn nằm trong khoảng an toàn của `Number` (< 2^53).
- **Kết nối với file khác:** dùng bởi `SonarViewer.jsx`.
- **Điểm đáng chú ý:** Dùng `XMLHttpRequest` thay vì `fetch` chỉ vì cần sự kiện `onprogress` — `fetch` cũng có thể làm được qua `ReadableStream` nhưng phức tạp hơn nhiều, XHR đơn giản hơn cho use-case này.

---

### `frontend/src/features/trips/components/SonarViewer/useSonarPlayer.js`

- **Chức năng chính:** Hook điều khiển phát/tua/đồng bộ dữ liệu sonar đã parse — quản lý vòng lặp animation và vẽ canvas.
- **Props/API chính:** `useSonarPlayer({ frames, canvasRef, colorMode, maxRange })` → `{ playing, frameIdx, speed, durationMs, currentMs, play, pause, seekTo, seekToTime, syncToTime, setSpeed }`.
- **Logic chi tiết:** Xem mục tổng quan "Sonar Viewer". Điểm kỹ thuật quan trọng nhất là phân biệt `seekToTime` (dùng khi user tua tay, luôn `rebuildView` đầy đủ + `setFrameIdx` để re-render UI) và `syncToTime` (dùng khi sync video, tối ưu để **không** gây re-render nếu bước tiến nhỏ — chỉ vẽ thêm incremental).
- **Kết nối với file khác:** dùng bởi `SonarViewer.jsx`.
- **Điểm đáng chú ý:** Dùng `useRef` (`sr.current`) làm "state ngoài React" để vòng lặp `requestAnimationFrame` luôn đọc được giá trị mới nhất (`frameIdx`, `speed`, `lastWallMs`) mà không bị stale closure — pattern kinh điển khi kết hợp animation loop với React hooks.

---

### `frontend/src/features/trips/components/charts/BottomChart.jsx`

- **Chức năng chính:** Component chart chính của cockpit — 3 tab (Environment, Navigation, System), mỗi tab là 1 Recharts chart riêng, có Brush (auto-frame + user-drag), ReferenceLine đồng bộ video, anomaly dot, legend toggle.
- **Props/API chính:** `chartTab`/`setChartTab`, `hidden`/`setHidden` (metric ẩn/hiện), `hasNavData`, `hasPowerData`, `chartData` (đã chèn gap sentinel), `syncIdx`, `anomalySet`, `isDark`, `hasSensor`, `extraRight` (node tuỳ chỉnh, dùng để chèn nút "Sonar" chuyển `isSonarMode`), `variant` (`'bottom' | 'inline'`), `brushRange`/`onBrushChange`, `chartExpanded` (mở rộng chiều cao, dù thực tế trong `TripDetailPage` không truyền — luôn dùng chiều cao mặc định `h-44`).
- **Logic chi tiết:**
  - **3 bộ metric:** `ENV_METRICS` (depth trục trái, water temp trục phải — `AreaChart` với gradient fill), `NAV_METRICS` (yaw/pitch/roll, không trục phụ — `LineChart`), `SYS_METRICS` (humidity/powerLevel trục trái %, voltage/board-temp trục phải — `LineChart`).
  - **`MOCK_YPR`:** dữ liệu giả lập hình sin/cos cho tab Navigation khi trip không có dữ liệu `yaw/pitch/roll` thật (`hasNavData=false`) — để UI không bao giờ trống trơn, luôn có demo chart kèm nhãn "demo data" góc dưới phải và trong legend.
  - **`AnomalyDot`:** giống `SensorChart.jsx`, custom dot dùng `anomalySet` để tô đỏ điểm bất thường trên `Area`/`Line`.
  - **`refLine(yAxisId)`** — helper tạo `<ReferenceLine>` dùng chung cho tab System; tab Environment và Navigation code trực tiếp `<ReferenceLine>` riêng (không dùng lại helper này) — có 1 phần trùng lặp code nhỏ giữa 3 tab (mỗi tab tự viết điều kiện `syncIdx != null && chartData[syncIdx]`).
  - **`brushProps`:** cấu hình chung cho `<Brush>` ở cả 3 tab — bỏ `tickFormatter` (trả chuỗi rỗng) để tránh label bị cắt ở 2 đầu thanh brush (trục X phía trên chart đã hiển thị timestamp rồi, brush không cần lặp lại).
  - **`variant='inline'`** (dùng khi `isSonarMode`): style khác biệt — có `rounded-xl border` riêng biệt như 1 card độc lập trong cột giữa, có `transition-[height]` khi `chartExpanded` đổi (dù hiện tại prop này luôn `undefined` từ `TripDetailPage`, nghĩa là tính năng "expand chart" trong code nhưng chưa được kích hoạt từ UI — có thể spec cũ TASK 6a có "Expand/Collapse toggle" nhưng đã bị bỏ hoặc chuyển hướng cài đặt khác).
- **Kết nối với file khác:** dùng bởi `TripDetailPage.jsx` — 2 lần (1 lần `variant='inline'` trong center column khi `isSonarMode`, 1 lần `variant='bottom'` full-width phía dưới khi không sonar mode).
- **Điểm đáng chú ý:**
  - **Đồng bộ nhiều trục Y:** tab Environment và System dùng 2 `<YAxis>` (`yAxisId="left"`/`"right"`) — Recharts yêu cầu mọi `<Area>`/`<Line>`/`<ReferenceLine>` phải khai báo đúng `yAxisId` tương ứng, nếu không sẽ vẽ sai trục.
  - **Performance:** `isAnimationActive={false}` trên mọi `Area`/`Line` — tắt animation transition mặc định của Recharts để chart phản hồi tức thời theo `timeupdate` (nếu bật animation, mỗi lần ReferenceLine di chuyển sẽ có độ trễ/giật do animation cố gắng "đuổi theo" giá trị mới liên tục).

---

### `frontend/src/features/trips/components/evidence/EvidenceShared.jsx`

- **Chức năng chính:** Toàn bộ UI cho Evidence System — thanh điều khiển video riêng cho evidence (`EvidenceVideoControls`), overlay xem lại evidence (`EvidenceViewer`), panel danh sách evidence (`EvidencePanel`, `EvidenceCard`).
- **Props/API chính:**
  - `EvidenceViewer({ evidence, media, tripId, onClose, queryClient, evidenceShowCenterPauseBtn, showEvidenceCenterPauseBriefly })`
  - `EvidencePanel({ snapshots, isOpen, tripId, canEdit, videoRef, queryClient, currentMediaId, onSelectEvidence, confirmDelete, setConfirmDelete, isHorizontal })`
  - API: `POST /snapshots/:id/analyze`, `POST /snapshots/:id/analyze/cancel`, `GET /snapshots/:id/download-url`, `GET /snapshots/:id/frame-at?time=`, `GET /snapshots/:id/download-clip`, `DELETE /snapshots/bulk`, `GET /media/models`.
- **Logic chi tiết:** Xem mục tổng quan "Evidence System" — trọng tâm là `evidenceActiveLabs` (`useMemo`, dòng 178-199): xử lý cả 2 trường hợp `frameTime` tuyệt đối (thời gian video gốc) và tương đối (0-based từ đầu clip) bằng heuristic `isAbsolute = withFrame.some(l => l.frameTime >= startTime - 0.5)`.
  - **`downloadCanvasWithBbox`:** hàm dùng chung để tải ảnh (evidence photo hoặc frame trích từ clip) kèm bbox "nướng" — vẽ lại lên `<canvas>` mới từ 1 `<img>` đã load, cùng công thức vẽ với `capturePhoto` trong `TripDetailPage.jsx` (trùng lặp logic vẽ bbox giữa 2 nơi — có thể refactor thành 1 hàm dùng chung, hiện tại code duplicate).
  - **`handleEvidenceDownload('png')` cho clip:** phải gọi API backend `GET /snapshots/:id/frame-at?time=` (dùng FFmpeg phía server để trích đúng khung hình tại thời điểm hiện tại của video, vì browser không thể "seek + capture" chính xác khung hình từ video nén khi cần độ chính xác cao, đặc biệt với clip ngắn).
  - **Analyze popover cục bộ:** gần như sao chép y hệt `AIAnalyzePopover` trong `MediaShared.jsx` nhưng viết lại riêng trong `EvidenceViewer` (không import dùng chung) — code trùng lặp đáng kể (model selector, confidence slider, style) giữa 2 nơi.
- **Kết nối với file khác:** import `useMediaUrl`, `resolveType`, `DetectionSVG` từ `MediaShared.jsx`; dùng bởi `TripDetailPage.jsx`.
- **Điểm đáng chú ý:**
  - **Edge case xoay vòng phát lại:** clip tự dừng đúng tại `endTime` (không phát tràn sang phần video tiếp theo) nhờ theo dõi trong `onTimeUpdate`/`handleEvidenceTimeUpdate` liên tục so sánh `v.currentTime >= endTime - 0.05`.
  - **Trùng lặp code có thể tối ưu:** `EvidenceVideoControls` gần như là bản sao của `CustomVideoControls` (`MediaShared.jsx`) chỉ khác ở việc tính % theo `(currentTime)/(duration)` với `duration = endTime - startTime` (khoảng clip) thay vì toàn bộ video.

---

### `frontend/src/features/trips/components/layout/AlertsPanel.jsx`

- **Chức năng chính:** Panel liệt kê các điểm bất thường (anomaly) phát hiện được từ Z-Score, hoặc trạng thái "All Clear"/"chưa có sensor data".
- **Props/API chính:** `anomalies` (mảng `{ metric, value, timestamp }`), `hasSensor` (bool), `compact` (bool — chế độ gọn, `max-h-36` thay vì chiếm hết chiều cao còn lại).
- **Logic chi tiết:** 3 trạng thái hiển thị:
  1. `anomalies.length > 0` → danh sách card màu hổ phách (amber), mỗi card hiện metric + giá trị + đơn vị tương ứng (`m`/`°C`/`bar` theo `metric`).
  2. `anomalies.length === 0 && hasSensor` → card xanh lá "All Clear".
  3. `!hasSensor` → card viền nét đứt "Upload sensor data to detect anomalies" (chưa có dữ liệu để phân tích).
- **Kết nối với file khác:** dùng bởi `TripDetailPage` (cột phải, dưới cùng).
- **Điểm đáng chú ý:** Component thuần trình bày, không tự fetch data — nhận `anomalies` đã tính sẵn từ response `GET /trips/:id/sensor-data` (field `anomalies`, do backend tính Z-Score).

---

### `frontend/src/features/trips/components/layout/CurrentStatus.jsx`

- **Chức năng chính:** Panel KPI card hiển thị các chỉ số hiện tại (live nếu đang sync video, hoặc trung bình cả trip nếu không) — tự động chọn số lượng card (4 hoặc 8) và kích cỡ chữ dựa trên chiều cao khả dụng.
- **Props/API chính:** `stats` (object trung bình/min/max từ backend), `currentReading` (điểm dữ liệu tại `syncIdx`, hoặc `null`), `expanded` (bool, điều khiển từ parent), `onToggle`.
- **Logic chi tiết:**
  - **`buildCards(defs, stats, reading)`:** với mỗi metric, ưu tiên giá trị `live` (từ `currentReading`) nếu có, nếu không dùng `avg` từ `stats` — nghĩa là khi đang phát video có sync, card hiện giá trị **tức thời tại đúng khung hình**; khi không sync, hiện giá trị **trung bình cả trip**.
  - **`PRIMARY`** (4 metric mặc định: Depth, Water Temp, Voltage, Humidity) và **`SECONDARY`** (4 metric mở rộng: Board Temp, Power Level, Light Level, Cam Tilt) — chỉ hiện 8 khi `showAll = expanded || autoAll`.
  - **Auto-sizing thuật toán (`pickSize`, `AUTO_8_MIN=250`, `COMPACT_MIN=120`):**
    - Dùng `ResizeObserver` theo dõi `contentRef` (chiều cao khả dụng thực tế `contentH`).
    - `autoAll = contentH >= 250` — đủ chỗ thì tự động hiện 8 card kể cả không bấm "expand" (không chờ user tương tác).
    - `rowH1col = (contentH - (N-1)*6) / N` — tính chiều cao mỗi hàng nếu xếp 1 cột N hàng (trừ khoảng cách `gap-1.5` giữa các hàng).
    - `size = pickSize(rowH1col)` → 1 trong 6 tier: `2xl/xl/lg/md/sm/2x2` (định nghĩa ngưỡng trong `KpiCard.jsx`).
    - `compact = contentH < 120 || size === '2x2'` → chuyển sang lưới **2 cột** thay vì 1 cột dọc, để không bị vỡ layout khi chiều cao quá hẹp (ví dụ màn hình thấp hoặc đã mở nhiều panel khác chiếm chỗ).
  - **Nút mở rộng:** chỉ hiện khi `!autoAll` (tức khi không gian tự nhiên chưa đủ để hiện 8 card) — bấm sẽ set `expanded=true` ở `TripDetailPage`, đồng thời ẩn hẳn panel Location để nhường không gian.
- **Kết nối với file khác:** dùng `KpiCard`; dùng bởi `TripDetailPage` (cột trái).
- **Điểm đáng chú ý:** Đây là ví dụ điển hình về "container query" thực hiện bằng tay (ResizeObserver + tính toán thủ công) vì CSS Container Queries chưa được dùng trong project — logic khá tinh vi, phải cân bằng giữa 3 biến: số card (4/8), số cột (1/2), và tier kích thước chữ (6 mức).

---

### `frontend/src/features/trips/components/layout/LocationPanel.jsx`

- **Chức năng chính:** Wrapper đơn giản bọc `TrajectoryViewer` — phiên bản **tĩnh** (không truyền `currentUTC`, không có toggle mode) dùng ở ngữ cảnh không cần cockpit đầy đủ.
- **Props/API chính:** `trip`, `hasGps`.
- **Logic chi tiết:** Chỉ render `<TrajectoryViewer tripId gpsLocation hasGps>` (không truyền `currentUTC`/`mode`/`onModeChange`/`onDvlStatus`) — luôn ở chế độ tĩnh, mode mặc định nội bộ (`path`). Hiện `trip.locationName` ở footer nếu có.
- **Kết nối với file khác:** Theo kết quả tìm kiếm, **không thấy được import bởi `TripDetailPage.jsx`** — `TripDetailPage` tự viết lại phần Location panel trực tiếp trong JSX (dòng 954-985) thay vì dùng component này. `LocationPanel.jsx` có thể được dùng ở nơi khác trong app (ví dụ preview card) hoặc là phiên bản cũ chưa dọn dẹp sau khi `TripDetailPage` tự inline lại logic để thêm tính năng DVL mode toggle.
- **Điểm đáng chú ý:** Cùng nhận định "component song song, không dùng chung" như `SensorChart.jsx` — dấu hiệu cho thấy `TripDetailPage.jsx` đã phát triển thêm nhiều tính năng (DVL toggle, sync) vượt quá khả năng của các component "layout" ban đầu, nên phải inline lại logic thay vì mở rộng props của component cũ.

---

### `frontend/src/features/trips/components/layout/TripHeader.jsx`

- **Chức năng chính:** Thanh header cố định (`h-11`) của TripDetailPage — hiện trạng thái, tên trip, chip project, badge GPS/SYNCED, các nút hành động (Upload, Edit, Export) — có phiên bản desktop đầy đủ và phiên bản mobile rút gọn (dropdown menu).
- **Props/API chính:** nhận rất nhiều props từ `TripDetailPage` (không tự fetch data): `trip`, `sText`/`sCls` (nhãn+class status), `backTo`, `navigate`, `hasSensor`, `canUpload`, `canEdit`, các setter modal, `showExport`/`setShowExport`, `exportRef`, `exportCsv`, `exportChartPng`, `chartData`.
- **Logic chi tiết:**
  - **`StatusDot`:** chấm tròn nhỏ, riêng biệt cho mobile (chỉ hiện dot màu, không hiện chữ) — trạng thái `running` có hiệu ứng `animate-ping` (sóng lan toả) để nhấn mạnh "đang diễn ra", các trạng thái khác chỉ có `box-shadow` phát sáng nhẹ (glow), không animate.
  - **Responsive 2 tầng:** `md:hidden`/`hidden md:flex` — trên mobile ẩn hoàn toàn các nút hành động riêng lẻ, gộp hết vào 1 dropdown menu (`showMobileMenu`) mở từ nút `⋮`, bên trong dropdown mới hiện project chip + Upload + Edit + Export CSV + Export PNG dạng list dọc.
  - **Dropdown export** (`showExport`) và **mobile menu** (`showMobileMenu`) đều tự đóng khi click ra ngoài, dùng `useEffect` + `mousedown` listener + kiểm tra `ref.contains(e.target)`.
- **Kết nối với file khác:** dùng `MarineTableStatus` (component dùng chung style status badge toàn app); dùng bởi `TripDetailPage.jsx`.
- **Điểm đáng chú ý:** Tách hẳn thành component riêng (khác với Location panel/SensorChart) — có lẽ vì phần header ít thay đổi logic nghiệp vụ theo thời gian so với phần trung tâm (video/chart), nên việc tách file ở đây thành công và vẫn được dùng thực tế (không phải dead code).

---

### `frontend/src/features/trips/components/media/MediaShared.jsx`

- **Chức năng chính:** Tập hợp các thành phần dùng chung cho hiển thị/điều khiển media (video/ảnh) trong TripDetailPage: helper nhận diện loại file, hook lấy presigned URL, thumbnail playlist, editor `recordedAt`, nút retry phân tích lỗi, popover cài đặt AI, custom video controls, SVG overlay bbox, và component render media chính (`MainMedia`).
- **Props/API chính:**
  - `resolveType(m)` — trả `'video' | 'image' | 'other'` dựa trên `m.type` hoặc phần mở rộng file.
  - `useMediaUrl(id)` — React Query hook lấy presigned URL (`GET /media/:id/url`), `staleTime: 50 phút` (khớp với thời hạn presigned URL thường dùng, tránh gọi lại API quá thường xuyên).
  - `ThumbVertical`, `RecordedAtEditor`, `RetryAnalysisButton`, `AIAnalyzePopover`, `CustomVideoControls`, `DetectionSVG`, `MainMedia`, `fmtVideoTime`.
- **Logic chi tiết:**
  - **`DetectionSVG`** — xem mục tổng quan YOLO Bbox Overlay. Trả `null` nếu không có `dims` hoặc không có label nào có `bbox` (tránh render `<svg>` rỗng không cần thiết).
  - **`MainMedia`** — component "dispatcher" theo loại file: video (thẻ `<video>` + click để play/pause + double-click fullscreen + `DetectionSVG` overlay), image (thẻ `<img>` + `DetectionSVG`), other (icon file + link tải trực tiếp). Quan trọng: `key={url}` trên thẻ `<video>` — buộc React **remount hoàn toàn** video element khi đổi `url` (thay vì chỉ đổi `src`), tránh tình trạng trình duyệt giữ trạng thái phát cũ (currentTime, buffer) khi chuyển sang file khác.
  - **`RecordedAtEditor`** — input `datetime-local` cho phép sửa `recordedAt` của media ngay trong playlist. Chuyển đổi `Date` ↔ chuỗi local time thủ công (`toLocal`) thay vì dùng `toISOString().slice(0,16)` — vì `toISOString()` trả UTC, sẽ hiện sai giờ nếu người dùng ở múi giờ khác UTC; cách làm thủ công lấy `getHours()/getMinutes()` (theo múi giờ trình duyệt) đảm bảo hiển thị đúng giờ địa phương. `style={{ colorScheme: 'dark' }}` ép icon lịch của input hiện đúng theo nền tối (input luôn đặt trên nền `bg-slate-950` bất kể theme sáng/tối của app).
  - **`AIAnalyzePopover`** — xem mục tổng quan YOLO Bbox Overlay, phần "AI Settings Popover".
  - **`CustomVideoControls`** — thanh điều khiển tự viết thay thế `<video controls>` mặc định (để có toolbar tuỳ biến, đồng bộ style dark toàn cockpit): progress bar kéo được (`onMouseDown` + `document.addEventListener('mousemove'/'mouseup')` toàn cục để kéo mượt kể cả khi chuột ra khỏi thanh progress), nút play/pause, hiện thời gian, mute, fullscreen. Nhận `currentTime`/`duration` từ **props** (do parent `TripDetailPage` quản lý qua `timeupdate`/`loadedmetadata`) thay vì tự lắng nghe — tránh 2 nơi cùng lắng nghe sự kiện video gây trùng lặp state.
- **Kết nối với file khác:** import bởi `TripDetailPage.jsx` (hầu hết mọi thứ) và `EvidenceShared.jsx` (`useMediaUrl`, `resolveType`, `DetectionSVG`).
- **Điểm đáng chú ý:**
  - **Trùng lặp code:** `CustomVideoControls` và `EvidenceVideoControls` (trong `EvidenceShared.jsx`) gần như giống hệt nhau, chỉ khác cách tính % tiến trình (toàn video vs. trong khoảng clip) — ứng viên tốt để refactor thành 1 component dùng chung với prop `getDuration()`/`getProgress()`.
  - **`RetryAnalysisButton`:** khi `media.analysisStatus === 'failed'`, hiện nút riêng biệt (không dùng chung `AIAnalyzePopover`) để retry nhanh với model/confidence mặc định (`yolov8n`, `0.3`) — không cho chỉnh lại settings, chỉ để thử lại nhanh.

---

### `frontend/src/features/trips/components/ui/KpiCard.jsx`

- **Chức năng chính:** Card KPI đơn (label + giá trị + đơn vị), có 6 tier kích thước (`2xl/xl/lg/md/sm/2x2`) để `CurrentStatus` chọn động theo không gian khả dụng.
- **Props/API chính:** `label`, `value`, `unit`, `color`, `size` (mặc định `'lg'`). Cũng export `pickKpiSize(availableH)` (dù thực tế `CurrentStatus.jsx` tự định nghĩa `pickSize` riêng thay vì import hàm này — 2 hàm cùng mục đích tồn tại song song, khả năng trùng lặp/lệch pha khi 1 trong 2 được sửa mà quên sửa cái kia).
- **Logic chi tiết:** `styles` object map mỗi `size` sang class Tailwind cho padding/font-size của label & value. `isCompact = size === '2x2'` thêm `truncate` để không vỡ layout khi card quá nhỏ.
- **Kết nối với file khác:** dùng bởi `CurrentStatus.jsx`.
- **Điểm đáng chú ý:** `h-full` + `overflow-hidden` đảm bảo card luôn lấp đầy đúng ô grid được `CurrentStatus` cấp phát, không phụ thuộc nội dung.

---

### `frontend/src/features/trips/components/ui/SectionLabel.jsx`

- **Chức năng chính:** Nhãn tiêu đề nhỏ dùng chung cho mọi panel trong cockpit (VD "Location", "Current Status", "Navigation", "Alerts") — đảm bảo style nhất quán (font mono, uppercase, tracking rộng, màu `text-muted-foreground`).
- **Props/API chính:** `children`.
- **Logic chi tiết:** Component 1 dòng, không có logic.
- **Kết nối với file khác:** dùng bởi `AlertsPanel`, `CurrentStatus` (gián tiếp qua header riêng, không dùng `SectionLabel` trực tiếp — `CurrentStatus` tự viết header riêng), `LocationPanel`, và trực tiếp trong `TripDetailPage.jsx` (panel Location, Navigation).
- **Điểm đáng chú ý:** Ví dụ điển hình về "design token component" nhỏ — tách ra để đảm bảo mọi tiêu đề panel trong cockpit đồng nhất tuyệt đối về typography.

---

## Ghi chú tổng hợp cho hội đồng phản biện

1. **Vì sao không dùng WebSocket cho video-sensor sync?** Vì đồng bộ diễn ra hoàn toàn phía client — video đã tải sẵn (blob từ presigned URL) và sensor data cũng đã tải sẵn (`GET /trips/:id/sensor-data`, cache React Query); việc "sync" chỉ là tính toán index/tham chiếu thời gian trong dữ liệu đã có, không cần server đẩy dữ liệu mới theo thời gian thực — nên toàn bộ được xử lý bằng sự kiện `timeupdate` của HTML5 `<video>` (client-side, tần suất trình duyệt tự quyết định, thường ~4Hz).
2. **Vì sao YOLO bbox không dùng WebSocket mà dùng SSE + polling?** Vì phân tích YOLO là tác vụ **một chiều** (server → client khi xong), không cần client gửi dữ liệu liên tục — SSE đủ dùng và đơn giản hơn WebSocket (đã quyết định từ TASK 2). Trong `TripDetailPage`, cơ chế cập nhật cụ thể là `refetchInterval` có điều kiện (`query.state.data?.some(m => m.analysisStatus === 'pending') ? 4000 : false`) — tức là **polling 4 giây** khi có media đang chờ phân tích, không phải SSE thuần tại điểm này (SSE có thể trigger `invalidateQueries` ở nơi khác trong app theo CLAUDE.md, nhưng polling là cơ chế dự phòng đảm bảo UI luôn đồng bộ).
3. **Vì sao có nhiều đoạn code trùng lặp (dead code, component song song)?** Đây là dấu hiệu tự nhiên của một dự án đồ án phát triển qua nhiều "TASK" tuần tự (6 → 6a → 6b → 6b-2 → 6b-3 → 6b-4 → 6c → 6d → 6e) — mỗi TASK mở rộng tính năng nhưng không phải lúc nào cũng refactor lại code cũ. Cụ thể: `SensorChart.jsx` và `LocationPanel.jsx` là các component "thế hệ đầu" (TASK 6) đã bị "vượt mặt" bởi logic inline trực tiếp trong `TripDetailPage.jsx` (TASK 6a trở đi) nhưng chưa bị xoá; khối JSX cũ trong `TripDetailPage.jsx` (dòng 1032-1257, evidence viewer cũ) bị khoá bằng `{false && ...}` thay vì xoá hẳn — an toàn hơn khi cần rollback nhưng để lại code chết.

