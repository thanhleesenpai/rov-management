# ROV Data Upload & Visualization — Implementation Plan

> Ngày: 2026-06-05  
> Dựa trên phân tích: `ROV_DATA/`, `Viewer/` (C# WPF), backend sensor module, frontend components hiện có.

---

## Tổng quan các file trong ROV_DATA

```
ROV_DATA/
└── Trip_YYYYMMDD_HHMMSS/
    ├── log_YYYYMMDD_HHMMSS.csv     ← GCS sensor log (semicolon-sep, comma-decimal)
    ├── DVL_YYYYMMDD_HHMMSS.json    ← DVL position data (newline-delimited JSON objects)
    ├── record_*.mp4                ← Video recordings
    ├── capture_*.png               ← Screenshots
    └── Sonar/
        └── sonar_*.sonar           ← Binary sonar files (custom format)
```

### Format chi tiết từng loại file

| File | Format | Fields quan trọng |
|------|--------|-------------------|
| `log_*.csv` | Semicolon CSV, comma-decimal | Time(HH:MM:SS); Roll; Pitch; Yaw; Depth; Voltage; Humidity; Temperature; WaterTemperature; ... |
| `DVL_*.json` | Newline-delimited JSON | `ts`(unix s), `x/y/z`(m, local frame), `roll/pitch/yaw`(°), `status`(0=valid) |
| `*.sonar` | Binary custom | Header 32B + frames: timestamp(int64ms), angleGrads(uint16), samples(byte[N]) |
| `*.mp4` | Video | Đã có xử lý qua S3 + Media model |

---

## Quyết định thiết kế

### Upload: Folder upload (ưu tiên) + ZIP (thứ hai) + individual files (cho replace)

**Folder upload** (`<input webkitdirectory>`) là primary:
- Operator chọn thư mục `Trip_YYYYMMDD_*/` trực tiếp, không cần nén
- Files gửi trực tiếp lên server — quan trọng khi có video `.mp4` nặng vài GB
- Không cần thêm library, hoạt động trên tất cả modern browser
- Browser giữ nguyên cấu trúc thư mục con (Sonar/ subfolder)

**ZIP** là secondary — trường hợp dữ liệu đã được archive sẵn (cùng drop zone, detect theo extension).

**Individual file upload** vẫn có endpoint riêng cho từng loại — dùng khi cần replace 1 file lỗi mà không upload lại toàn bộ.

**Quy trình batch upload (folder hoặc ZIP):**
```
User chọn folder hoặc kéo ZIP → Client classify từng file theo tên/extension
  ├── log_*.csv      → parse preview + route SensorData pipeline
  ├── DVL_*.json     → parse preview + route DVL pipeline
  ├── *.sonar        → route Sonar pipeline (upload thẳng lên S3)
  ├── *.mp4          → route Media pipeline (presigned S3 upload)
  └── capture_*.png  → route Media pipeline
```

### CSV parsing: smart detection + confirm mapping (không strict 1 format)

Thay vì chỉ hỗ trợ đúng 1 cấu trúc cố định:
- **Auto-detect delimiter**: `;` vs `,` vs `\t` (thử từng cái, chọn cái cho nhiều cột nhất)
- **Auto-detect decimal separator**: nếu số như `"0,87"` → decimal là `,`
- **Fuzzy column name matching**: map tên cột bất kỳ → field đã biết:
  - `Temperature` / `WaterTemperature` / `temp_c` / `Temp` → `temp`
  - `Depth` / `Profondeur` / `depth_m` → `depth`
  - `Roll` / `roll_deg` → `roll`, v.v.
- **Hiện mapping cho user xác nhận** trước khi upload: bảng "CSV Column → Field"
- Cột không map được → skip + hiện warning (không block upload)
- Cột map được nhưng empty → null (không reject)

---

## TASK A — Upload ROV_DATA (Folder + ZIP + individual)

### A1 — Backend: Model mới

#### `DVLData` model (`backend/src/modules/dvl/dvl.model.js`)
```js
{
  dive:   ObjectId (ref: 'Dive', required),
  ts:     Number,    // Unix timestamp (seconds, float)
  x:      Number,    // meters, local frame East
  y:      Number,    // meters, local frame North
  z:      Number,    // meters, depth (positive = down)
  std:    Number,    // uncertainty (meters)
  roll:   Number,    // degrees
  pitch:  Number,    // degrees
  yaw:    Number,    // degrees (heading)
  status: Number     // 0 = valid
}
// Index: { dive: 1, ts: 1 }
```

#### `SonarFile` model (`backend/src/modules/sonar/sonar.model.js`)
```js
{
  dive:          ObjectId (ref: 'Dive', required),
  filename:      String,
  s3Key:         String,
  frameCount:    Number,
  durationMs:    Number,
  fileSizeBytes: Number,
  recordedAt:    Date    // parse từ filename timestamp
}
// Index: { dive: 1 }
```

### A2 — Backend: Upload endpoints

#### Individual endpoints (replace từng loại)
```
POST /dives/:id/dvl/upload
  Body: multipart file (.json) hoặc { readings: [...] }
  → parse DVL JSON, filter status===0, xóa cũ, insertMany
  → update dive.dvlCount
  → Response: { count }

POST /dives/:id/sonar/upload
  Body: multipart file (.sonar binary)
  → upload S3 (sonar/{diveId}/{filename})
  → parse header: validate magic "SONAR360", đọc frameCount, durationMs
  → lưu SonarFile document
  → Response: SonarFile doc

DELETE /dives/:id/dvl
  → xóa toàn bộ DVLData của dive, reset dive.dvlCount = 0

DELETE /dives/:id/sonar/:sonarFileId
  → xóa S3 key + SonarFile document
```

#### Batch endpoint (folder hoặc ZIP)
```
POST /dives/:id/data/upload-batch
  Body: multipart files[] (nhiều file từ folder) hoặc 1 file .zip
  → nếu zip: extract to temp dir
  → classify từng file theo tên/extension
  → gọi song song: sensor pipeline, dvl pipeline, sonar pipeline, media pipeline
  → cleanup temp
  → Response: { sensor: {count}, dvl: {count}, sonar: [{filename}], media: [{filename}], errors: [...] }
```

#### Parsing GCS CSV phía backend (hỗ trợ flexible format)
1. Detect delimiter (thử `;` trước vì GCS log dùng `;`)
2. Detect decimal separator từ header + dòng đầu
3. Map tên cột → field đã biết (case-insensitive, fuzzy)
4. `Time` field `HH:MM:SS` + timestamp từ filename → reconstruct full `Date`
5. Parse từng row, bỏ qua row lỗi (log warning), không reject toàn bộ

### A3 — Frontend: ROVDataUpload component

**Một component duy nhất** xử lý tất cả: sensor, DVL, sonar, video, ảnh — cho cả 2 context:

| Context | Trigger | Hành vi |
|---------|---------|---------|
| **TripDetailPage** | Nút "Import Folder" cạnh "+ Add Dive" | Auto-tạo dive → upload hết |
| **DiveDetailPage** | Nút HardDrive (đã có) | Upload thẳng vào dive hiện tại |

```
Props: { tripId?: string, dive?: Dive, onClose, onDiveCreated? }
  → dive = null + tripId:  auto-tạo dive → upload
  → dive = exist:          thẳng upload vào dive (bỏ qua tạo mới)
```

**Auto-tạo dive (TripDetailPage context):**
- Parse tên từ timestamp trong filename: `log_20260601_164637.csv` → `Dive 2026-06-01 16:46`
- Fallback nếu không có timestamp: `Dive YYYY-MM-DD HH:mm` theo giờ hiện tại
- Description: `"Auto-imported from folder"` — không cần input từ user
- Nếu batch/media upload fail sau khi tạo dive → `DELETE /dives/:id` (rollback)

**Luồng upload (sau khi có diveId):**
```
[nếu cần] Tạo dive (POST /trips/:tripId/dives)
    ↓
┌───────────────────────┬───────────────────────────┐
│ Batch endpoint (0→80%)│ S3 Presigned (80→100%)    │
│                       │ (tuần tự từng file)        │
│ sensor (CSV parse)    │ *.mp4, *.webm, *.mov       │
│ dvl (JSON parse)      │ *.png, *.jpg, *.webp       │
│ sonar (S3 binary)     │                            │
└───────────────────────┴───────────────────────────┘
  Fail sau tạo dive → DELETE dive (rollback)
```

**File classification + hiển thị:**
| Loại | Badge | Uploadable |
|------|-------|-----------|
| sensor (.csv) | blue | ✅ batch |
| dvl (DVL_*.json) | violet | ✅ batch |
| sonar (.sonar) | cyan | ✅ batch |
| video (.mp4/.mov/…) | amber | ✅ presigned |
| image (.jpg/.png/…) | pink | ✅ presigned |
| unknown | gray | ❌ skip |

**Warning:**
- > 1 sensor CSV → "only last will be used"
- > 1 sonar file → "only first will be used"

---

### Cơ chế phân loại file (File Classification)

Phân loại theo **2 tầng**:

**Tầng 1 — Filename pattern** (ưu tiên cao, chính xác nhất):

| Pattern | Loại | Lý do |
|---------|------|-------|
| `DVL_YYYYMMDD_HHMMSS.json` | **dvl** | Prefix `DVL_` là convention của phần mềm ROV |
| `log_YYYYMMDD_HHMMSS.csv` | **sensor** | Prefix `log_` là GCS log |
| `sonar_*.sonar` | **sonar** | Extension `.sonar` là custom format |
| `record_*.mp4` | **video** | Prefix `record_` là video recording |
| `capture_*.png` | **image** | Prefix `capture_` là screenshot |

**Tầng 2 — Extension fallback** (khi không khớp pattern):

| Extension | Loại | Ghi chú |
|-----------|------|---------|
| `.sonar` | sonar | Luôn là sonar binary |
| `.csv` | sensor | Parse thử, báo lỗi nếu sai format |
| `.json` | **cần sniff** | Đọc dòng đầu: có `"type":"position_local"` → DVL, không có → unknown |
| `.mp4 .webm .mov .avi` | video | |
| `.jpg .jpeg .png .webp` | image | |
| Khác | unknown | Skip, hiện warning |

**Content sniffing cho JSON** (quan trọng vì `.json` có thể là nhiều thứ):
```js
function sniffJson(text) {
  const firstLine = text.split('\n')[0].trim()
  try {
    const obj = JSON.parse(firstLine)
    if (obj.type === 'position_local') return 'dvl'
  } catch {}
  return 'unknown'
}
```

**Logic hoàn chỉnh:**
```
classify(filename, buffer):
  1. Thử match filename pattern → trả về loại nếu match
  2. Nếu không match, dùng extension:
     - .sonar → sonar
     - .csv   → sensor
     - .json  → sniff content → dvl hoặc unknown
     - .mp4 etc → video
     - .jpg etc → image
     - else → unknown
```

**Packages cần thêm:**
```bash
npm install jszip      # frontend — ZIP drop support
npm install adm-zip    # backend — ZIP extraction
# multer đã có
```

---

## TASK B — DVL Path Visualization

### Hai mode hiển thị

| Mode | Điều kiện | Render |
|------|-----------|--------|
| **Geo path** | Có `dive.gpsLocation` từ sensor data | Polyline trên Leaflet map hiện có |
| **Relative path** | Không có GPS | SVG Canvas tự scale, nền trống, đơn vị meters |

### B1 — Backend: DVL API

```
GET /dives/:id/dvl
→ trả về { data: [{ts, x, y, z, roll, pitch, yaw, status}], count, gpsAnchor: {lat,lng} | null }
→ downsample về max 2000 điểm nếu nhiều hơn (uniform sampling)
```

### B2 — Frontend: Trajectory component

#### Coordinate transform (geo mode)
```js
// gpsAnchor = dive.gpsLocation, DVL x=East(m), y=North(m)
const EARTH_R = 6371000;
const lat = anchor.lat + (pt.y / EARTH_R) * (180 / Math.PI);
const lng = anchor.lng + (pt.x / EARTH_R) * (180 / Math.PI) / Math.cos(anchor.lat * Math.PI / 180);
// → vẽ Leaflet Polyline, thay thế static marker hiện có
```

#### Relative path canvas (no-GPS mode)
- Canvas tự scale để fit toàn bộ path (auto min/max x/y)
- Axis: X = East, Y = North (flip Y vì canvas Y↓)
- Grid lines mỗi 5m (dashed, dùng border token)
- Path: gradient xanh (start) → đỏ (end) — vẽ từng segment với lerp màu
- Yaw arrows: mỗi ~20 điểm, vẽ triangle xoay theo góc yaw

#### UI trong LocationPanel (left column DiveDetailPage)
- **Có DVL + GPS**: Leaflet map với Polyline path + dot đánh dấu đầu/cuối + Marker GPS gốc
- **Có DVL, không GPS**: Canvas relative path thay Leaflet map
- **Không có DVL**: giữ nguyên như hiện tại (Leaflet marker đơn hoặc "No GPS")
- Layer toggle nhỏ: `[Map] [Path] [Both]` — chỉ hiện khi có cả GPS lẫn DVL

#### B3 — DVL Animation sync với video

**Zero-point normalization:** DVL `ts` là Unix timestamp tuyệt đối — normalize về 0:
```js
dvl_relative[i] = ts[i] - ts[0]   // seconds từ đầu DVL recording
```
Map 1:1 với `video.currentTime` (giả định DVL và video bắt đầu cùng lúc).

**TrajectoryViewer nhận thêm prop `currentTime` (seconds):**
- `currentTime == null` → hiện toàn bộ path (static mode, khi không có video)
- `currentTime >= 0` → filter `visibleData = data.filter(p => p.ts - data[0].ts <= currentTime)`
- Scale/grid tính từ **toàn bộ data** (không nhảy khi path ngắn)
- Cursor dot tại điểm visible cuối cùng (blink hoặc pulse)

**DiveDetailPage truyền `currentVideoTime`** (đã có từ chart sync) vào TrajectoryViewer.

#### Checklist TASK B
- [x] Upload DVL + có GPS → Polyline overlay trên Leaflet map
- [x] Upload DVL, không GPS → Canvas relative path, grid đúng tỉ lệ
- [x] Path gradient xanh→đỏ theo chiều thời gian
- [x] Yaw arrows ở điểm đều nhau
- [x] Downsample đúng khi >2000 điểm
- [x] Toggle layer Map/Path/Both hoạt động
- [x] Dive không có DVL → không crash, hiện UI cũ
- [x] DVL animation: path vẽ dần theo video currentTime
- [x] Seek video → DVL path tua lại đúng thời điểm tức thì
- [x] Cursor dot tại vị trí ROV hiện tại trên path

---

## TASK C — Sonar Web Viewer

### Phân tích code C# hiện có (Viewer/)

| Class C# | Chức năng | Port sang JS |
|----------|-----------|-------------|
| `SonarFileReader.cs` | Parse binary: header 32B + frames | `ArrayBuffer` + `DataView` |
| `SonarRenderer.cs` | 512×512 circular display, 400 spokes, 4 color modes | `Canvas 2D` + `ImageData` |
| `SonarPlayer.cs` | play/pause/seek/speed, timing theo frame delta | `requestAnimationFrame` + state |

**Binary format:**
```
Header (32 bytes):
  [0-7]   Magic: "SONAR360" (ASCII, validate khi load)
  [8-9]   Version: uint16
  [10-31] Reserved

Frame (repeating):
  [0-7]   TimestampMs: int64 (BigInt)
  [8-9]   AngleGrads: uint16 (0–399 = 0–360°)
  [10-11] NumSamples: uint16
  [12..]  SampleData: byte[NumSamples] (intensity 0–255)
```

### C1 — Backend: Sonar file serving

```
GET /dives/:id/sonar
→ list SonarFile docs { _id, filename, durationMs, frameCount, fileSizeBytes, recordedAt }

GET /dives/:id/sonar/:sonarFileId/url
→ generate presigned S3 URL (15 phút TTL)
→ client fetch binary trực tiếp qua presigned URL
```

### C2 — Frontend: Web Sonar Player

**Component structure:**
```
SonarViewer/
├── SonarViewer.jsx      ← layout + controls + file selector
├── SonarCanvas.jsx      ← Canvas 2D rendering
├── useSonarParser.js    ← ArrayBuffer → { frames, durationMs, frameCount }
└── useSonarPlayer.js    ← play/pause/seek/speed state machine
```

#### `useSonarParser.js`
```js
// Validate magic "SONAR360"
// Read frames: DataView Little Endian
// timestampMs: readBigInt64LE → convert to Number (safe cho 46s range)
// Output: { frames: [{timestampMs, angleGrads, data: Uint8Array}], durationMs, frameCount }
```

#### `SonarCanvas.jsx`
```js
// Canvas 400×400 (đủ đọc, không quá nặng)
// center = (200, 200), maxRadius = 195px
// Mỗi frame: vẽ 1 spoke tại angleGrads/400 * 2π
// Spoke: đường từ center ra ngoài, pixel theo intensity
// 4 color modes (Heatmap, GreenRadar, White, Yellow) — chọn qua props
// Heatmap: 0→[0,0,255], 85→[0,255,0], 170→[255,255,0], 255→[255,0,0]
// Không xóa canvas khi vẽ frame mới (persistence như radar thật) — xóa khi seek
```

#### `useSonarPlayer.js`
```js
// play(): rAF loop, so sánh frames[i].timestampMs delta với wall clock × speed
// pause/resume: cancel rAF
// seek(videoTimeS): binary search → frameIdx K
//   scan ngược từ K, thu thập frame cho đến khi đủ 400 góc unique (1 vòng quét)
//   → clear canvas → draw chỉ những frames đó — O(400), instant dù tua đến phút 120
// speed: 0.25x | 0.5x | 1x | 2x | 4x
```

#### UI Layout — Sonar mode: chart vào center dưới video, sonar ở right ✅ IMPLEMENTED

Toggle bằng nút `[📡 Sonar]` trong tab bar của Bottom Chart. **Bottom panel ẩn** — BottomChart chuyển vào center column (inline dưới video); Sonar player xuất hiện trong right column thay thế chỗ trống.

```
Normal mode:
  ┌──────────┬──────────────────────┬──────────┐  ← ~65% height
  │  Left    │   Center (video)     │  Right   │
  │  w-56    │   flex-1             │  w-56    │
  │  ──────  │                      │  Nav     │
  │  Loc/Map │                      │  ──────  │
  │  ──────  │                      │  ALERTS  │
  │  Status  │                      │  (full)  │
  └──────────┴──────────────────────┴──────────┘
  ┌──────────────────────────────────────────────┐  ← ~35% height
  │  Bottom charts [Env] [Nav] [System]   [Sonar]│  ← toggle button
  └──────────────────────────────────────────────┘

Sonar mode (bottom panel ẩn, columns fill 100% height):
  ┌──────────┬──────────────────────┬──────────┐  ← 100% height
  │  Left    │   Video (flex-1)     │  Right   │
  │  w-56    │                      │  w-56    │
  │  ──────  ├──────────────────────┤  ──────  │
  │  Loc/Map │  Chart [Env][Nav][Sys]│  Nav     │
  │  taller  │  (BottomChart inline) │  ──────  │
  │  ──────  │                      │  SONAR   │
  │  Status  │                      │  canvas  │
  │          │                      │  + ctrl  │
  │          │                      │  ──────  │
  │          │                      │  ALERTS  │
  │          │                      │  compact │
  └──────────┴──────────────────────┴──────────┘
```

**Current Status — Left column** (adaptive, never scrolls):
```
Collapsed (default):           Expanded (toggle ▲/▼ in header):
┌──────────┬──────────┐        ┌──────────────────────┐
│ DEPTH    │ W.TEMP   │        │  DEPTH               │
│ 10.50 m  │ 24.3 °C  │        │  10.50 m             │
├──────────┼──────────┤        ├──────────────────────┤
│ VOLTAGE  │ HUMIDITY │        │  WATER TEMP          │
│ 16.80 V  │ 28.1 %   │        │  24.3 °C             │
└──────────┴──────────┘        ├──────────────────────┤
(2×2 grid, text-sm,            │  VOLTAGE  ...        │
 Location panel still visible) ├──────────────────────┤
                                │  HUMIDITY ...        │
                                └──────────────────────┘
                               (flex-col justify-between,
                                text-2xl, Location hidden)
```

**Right column khi Sonar mode** (stacked dọc, full height):
```
┌──────────────────────────────────────┐
│  NAVIGATION (flex-none)              │
│  └─ Horizon gauge + Compass gauge    │
├──────────────────────────────────────┤
│  SONAR PLAYER (flex-1 min-h-0)       │
│  [sonar_001 ▼]  ·SYNC               │
│  ┌──────────────────────────────┐    │
│  │       Sonar Canvas           │    │
│  └──────────────────────────────┘    │
│  ── Seekbar ──────────────────────   │
│  [⏮][▶/⏸][⏭]  Speed Color Range    │
├──────────────────────────────────────┤
│  ALERTS (compact, max-h-36)          │
└──────────────────────────────────────┘
```

**Sonar sync**: video `currentVideoTime` (seconds) → `SonarViewer syncTime` prop → `useSonarPlayer.syncToTime(ms)`. Forward ≤20 frames = incremental draw (no React re-render). Large jump or seek = full `rebuildView`. SonarViewer còn có transport controls riêng để xem sonar độc lập khi video paused.

#### Checklist TASK C
- [ ] Upload .sonar → metadata lưu DB, binary lưu S3
- [ ] Toggle [Sonar] → center column chuyển sang Sonar Player
- [ ] Parse đúng binary: validate magic, đọc đúng frame count
- [ ] Canvas vẽ đúng 400 spokes, polar coordinates
- [ ] Heatmap palette đúng (blue→green→yellow→red)
- [ ] Play/Pause với timing chính xác theo frame delta
- [ ] Seek → SeekRebuild replay từ đầu (canvas fill đúng)
- [ ] Speed 0.25x→4x
- [ ] Color mode toggle (4 mode)
- [ ] Range slider (1m–24m)
- [ ] Dropdown chọn sonar file khi có nhiều file
- [ ] Light/dark mode (controls, frame không đổi vì canvas instrument style)
- [ ] File > 1MB → fetch với progress bar, không block UI

---

## UI Layout tổng thể sau 3 tasks

**Normal mode** (giữ nguyên như hiện tại):
```
Left w-56                 │ Center flex-1              │ Right w-56
  LOCATION / TRAJECTORY   │  Video player              │  NAVIGATION
  └─ Leaflet map + DVL    │  ├─ Top overlay bar         │  └─ Horizon gauge
     polyline (geo)       │  └─ Playlist overlay        │  └─ Compass gauge
     hoặc Canvas path     │                             │
     (relative mode)      │                             │  ALERTS
  CURRENT STATUS          │                             │  └─ Anomaly cards
  └─ Depth / WaterTemp    │                             │
  └─ Voltage / Humidity   │                             │
─────────────────────────────────────────────────────────────────────────
Bottom: [Environment] [Navigation] [System]
```

**Sonar mode** (toggle `[📡 Sonar]` — bottom panel ẩn, columns fill 100%):
```
Left w-56 (taller)        │ Center flex-1 (taller)     │ Right w-56 (taller)
  LOCATION / TRAJECTORY   │  Video (flex~1)            │  NAVIGATION
  └─ Map/path fill height │  ────────────────────      │  └─ Horizon + Compass
                          │  Chart [Env][Nav][System]  │
  CURRENT STATUS          │  (flex~1, inline)          │  SONAR PLAYER   ← mới
  └─ Depth / WaterTemp    │                             │  └─ Canvas fill
  └─ Voltage / Humidity   │                             │  └─ Seekbar + ctrl
                          │                             │
                          │                             │  ALERTS
─────────────────────────────────────────────────────────────────────────
(bottom panel ẩn — chart chuyển vào center dưới video)
```

**Điều chỉnh so với sketch ban đầu:**
- Chart [Env/Nav/System] chuyển vào center column dưới video (không bị ẩn hoàn toàn)
- Sonar Player xuất hiện ở right column nhờ height tăng thêm
- Column width không thay đổi → không gây giật layout
- Transition: `transition-all duration-300` trên height của bottom panel
- Bottom tab "Sonar" không cần thiết

---

## Thứ tự thực hiện

```
Sprint 1 (backend):
  A1   → DVLData + SonarFile models
  A2   → Individual upload endpoints (dvl, sonar) + delete endpoints
  A2b  → Batch upload endpoint (folder/zip) + flexible CSV parser

Sprint 2 (frontend upload + DVL):
  A3   → ROVDataUpload modal (folder input + ZIP + column mapping preview)
  B1   → GET /dives/:id/dvl endpoint
  B2   → Trajectory overlay (geo Polyline + relative Canvas)

Sprint 3 (sonar):
  C1   → Sonar serving + presigned URL endpoint
  C2   → Web Sonar Player (parser + renderer + player) + center column toggle
```

---

## Dependencies

**Frontend:**
```json
"jszip": "^3.10.1"    // chỉ dùng cho ZIP drop, optional
```

**Backend:**
```json
"adm-zip": "^0.5.10"  // ZIP extraction server-side
// multer đã có
```

**Sonar Player**: thuần Web API — `ArrayBuffer`, `DataView`, `Canvas 2D`, `requestAnimationFrame`. Không cần library.

---

## Files sẽ thay đổi/tạo mới

### Backend (mới)
- `backend/src/modules/dvl/dvl.model.js`
- `backend/src/modules/dvl/dvl.controller.js`
- `backend/src/modules/dvl/dvl.routes.js`
- `backend/src/modules/sonar/sonar.model.js`
- `backend/src/modules/sonar/sonar.controller.js`
- `backend/src/modules/sonar/sonar.routes.js`

### Backend (sửa)
- `backend/src/modules/dives/dive.model.js` — thêm `dvlCount`, `sonarCount`
- `backend/src/modules/sensor/sensor.controller.js` — flexible CSV parser
- `backend/src/app.js` — đăng ký routes mới

### Frontend (mới)
- `frontend/src/features/dives/components/ROVDataUpload.jsx`
- `frontend/src/features/dives/components/TrajectoryViewer.jsx`  ← DVL path (geo + relative)
- `frontend/src/features/dives/components/SonarViewer/SonarViewer.jsx`
- `frontend/src/features/dives/components/SonarViewer/SonarCanvas.jsx`
- `frontend/src/features/dives/components/SonarViewer/useSonarParser.js`
- `frontend/src/features/dives/components/SonarViewer/useSonarPlayer.js`

### Frontend (sửa)
- `frontend/src/features/dives/components/layout/LocationPanel.jsx` — dùng TrajectoryViewer
- `frontend/src/features/dives/components/DiveMap.jsx` — thêm DVL Polyline layer
- `frontend/src/features/dives/DiveDetailPage.jsx` — Video/Sonar toggle + Upload button mới
