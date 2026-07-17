const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const DVLData = require('../dvl/dvl.model');
const SonarFile = require('../sonar/sonar.model');
const SensorData = require('../sensor/sensor.model');
const Trip = require('./trip.model');
const s3 = require('../../config/s3');
const { success, error } = require('../../utils/response.util');
const { parseDvlBuffer } = require('../dvl/dvl.controller');
const { parseSonarMeta, recordedAtFromFilename } = require('../sonar/sonar.controller');

const BUCKET = process.env.S3_BUCKET;

// ─── Flexible CSV Parser ──────────────────────────────────────────────────────

const COLUMN_MAP = {
  // timestamp
  'time': 'timestamp', 'timestamp': 'timestamp', 'datetime': 'timestamp',
  // depth
  'depth': 'depth', 'depth_m': 'depth', 'profondeur': 'depth',
  // water temperature (WaterTemperature wins → temp; Temperature → temperature)
  'watertemperature': 'temp', 'water_temp': 'temp', 'water_temperature': 'temp',
  'temperature': 'temperature', 'temp': 'temp', 'temp_c': 'temp',
  // ambient/electronics temperature
  'tempambient': 'temperature', 'ambient_temp': 'temperature',
  // pressure
  'pressure': 'pressure', 'pressure_bar': 'pressure', 'pression': 'pressure',
  // orientation
  'roll': 'roll', 'roll_deg': 'roll',
  'pitch': 'pitch', 'pitch_deg': 'pitch',
  'yaw': 'yaw', 'yaw_deg': 'yaw', 'heading': 'yaw',
  // power
  'voltage': 'voltage', 'volt': 'voltage',
  'battery_percent': 'battery_percent', 'battery': 'battery_percent', 'batt': 'battery_percent',
  // environment
  'humidity': 'humidity', 'hum': 'humidity',
  // GPS
  'lat': 'lat', 'latitude': 'lat',
  'lng': 'lng', 'lon': 'lng', 'longitude': 'lng',
  // GCS control/discrete fields
  'holddepth': 'holdDepth', 'hold_depth': 'holdDepth',
  'holdheading': 'holdHeading', 'hold_heading': 'holdHeading',
  'manual': 'manual',
  'cameratilt': 'cameraTilt', 'camera_tilt': 'cameraTilt',
  'lightlevel': 'lightLevel', 'light_level': 'lightLevel',
  'powerlevel': 'powerLevel', 'power_level': 'powerLevel',
};

// Fields where WaterTemperature should win over Temperature (already handled in map above
// since 'watertemperature' maps first when iterating sorted headers)

function detectDelimiter(header) {
  const candidates = [';', ',', '\t'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    const count = (header.split(d).length - 1);
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

function detectDecimalSep(rows, colCount) {
  // Sample first 5 data rows, check if any numeric-looking value has a comma
  for (const row of rows.slice(0, 5)) {
    for (const cell of row.slice(0, colCount)) {
      if (/^-?\d+,\d+$/.test(cell.trim())) return ',';
    }
  }
  return '.';
}

function mapHeaders(headers, delimiter) {
  // Sort headers: put WaterTemperature before Temperature so it wins
  const sorted = [...headers].sort((a, b) => {
    const ka = a.toLowerCase().replace(/[^a-z]/g, '');
    const kb = b.toLowerCase().replace(/[^a-z]/g, '');
    if (ka === 'watertemperature') return -1;
    if (kb === 'watertemperature') return 1;
    return 0;
  });

  const mapping = {}; // originalIndex → fieldName
  const usedFields = new Set();
  for (const h of sorted) {
    const origIdx = headers.indexOf(h);
    const key = h.toLowerCase().replace(/[^a-z_]/g, '');
    const field = COLUMN_MAP[key];
    if (field && !usedFields.has(field)) {
      mapping[origIdx] = field;
      usedFields.add(field);
    }
  }
  return mapping;
}

// Parse date from filename: log_20260604_162515.csv → 2026-06-04
function baseDateFromFilename(filename) {
  const m = filename.match(/(\d{8})_(\d{6})/);
  if (!m) return null;
  const [, date] = m;
  return `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
}

// Format a precise Date (e.g. from trip.json manifest) as its UTC+7 wall-clock date —
// same "YYYY-MM-DD" shape as baseDateFromFilename, so the two sources are interchangeable.
function baseDateFromManifestTs(manifestTs) {
  const vn = new Date(manifestTs.getTime() + 7 * 3600 * 1000);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const d = String(vn.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseTimeToDate(timeStr, baseDate) {
  // timeStr: "HH:MM:SS", baseDate: "YYYY-MM-DD"
  // Filenames/readings are recorded in UTC+7 (Vietnam local time), not UTC
  if (!baseDate) return new Date(timeStr); // fallback — may fail
  return new Date(`${baseDate}T${timeStr}+07:00`);
}

// manifestTs (optional): precise Date for this file's session start, from trip.json.
// Preferred over the filename-embedded date whenever available (manifest is ms-accurate,
// filename is second-accurate at best and depends on naming convention holding up).
function parseCsvBuffer(buffer, filename = '', manifestTs = null) {
  const text = buffer.toString('utf8');
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.filter(l => l.trim());
  if (lines.length < 2) return { readings: [], columnMapping: {}, warnings: ['File has no data rows'] };

  const delimiter = detectDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map(h => h.trim());
  const dataLines = lines.slice(1);
  const dataRows = dataLines.map(l => l.split(delimiter));
  const decimalSep = detectDecimalSep(dataRows, headers.length);

  const colMapping = mapHeaders(headers, delimiter); // idx → field
  const baseDate = manifestTs ? baseDateFromManifestTs(manifestTs) : baseDateFromFilename(filename);
  const warnings = [];

  if (decimalSep === ',') {
    warnings.push('Decimal separator detected as comma (European format)');
  }

  const readings = [];
  let skipped = 0;

  for (const row of dataRows) {
    const obj = {};
    for (const [idxStr, field] of Object.entries(colMapping)) {
      let val = (row[parseInt(idxStr)] || '').trim();
      if (!val) continue;
      if (decimalSep === ',') val = val.replace(',', '.');
      obj[field] = val;
    }

    // Build timestamp
    let ts;
    if (obj.timestamp) {
      if (/^\d{2}:\d{2}:\d{2}$/.test(obj.timestamp)) {
        ts = parseTimeToDate(obj.timestamp, baseDate);
      } else {
        ts = new Date(obj.timestamp);
      }
    }
    if (!ts || isNaN(ts.getTime())) { skipped++; continue; }
    if (obj.depth == null) { skipped++; continue; }

    // Convert manual mode string → number: "Manual"→1, "Auto"→0
    if (obj.manual !== undefined) {
      const mv = String(obj.manual).toLowerCase().trim();
      if (mv === 'manual') obj.manual = '1';
      else if (mv === 'auto' || mv === '0') obj.manual = '0';
    }

    const optNum = v => (v != null && v !== '') ? Number(v) : null;
    readings.push({
      timestamp:       ts,
      depth:           Number(obj.depth),
      temp:            optNum(obj.temp),
      temperature:     optNum(obj.temperature),
      pressure:        optNum(obj.pressure),
      yaw:             optNum(obj.yaw),
      pitch:           optNum(obj.pitch),
      roll:            optNum(obj.roll),
      voltage:         optNum(obj.voltage),
      battery_percent: optNum(obj.battery_percent),
      humidity:        optNum(obj.humidity),
      holdDepth:       optNum(obj.holdDepth),
      holdHeading:     optNum(obj.holdHeading),
      manual:          optNum(obj.manual),
      cameraTilt:      optNum(obj.cameraTilt),
      lightLevel:      optNum(obj.lightLevel),
      powerLevel:      optNum(obj.powerLevel),
      lat:             optNum(obj.lat),
      lng:             optNum(obj.lng),
    });
  }

  if (skipped > 0) warnings.push(`${skipped} rows skipped (missing timestamp or depth)`);

  // Build human-readable column mapping for preview
  const mappingPreview = {};
  for (const [idx, field] of Object.entries(colMapping)) {
    mappingPreview[headers[parseInt(idx)]] = field;
  }

  return { readings, columnMapping: mappingPreview, warnings };
}

const { reverseGeocode } = require('../../utils/geocode.util');

// Parse session_YYYYMMDD_HHMMSS → UTC Date (session IDs use UTC+7 Vietnam local time)
function parseSessionId(sessionId) {
  const m = sessionId.match(/session_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+07:00`);
}

// ─── File classifier ──────────────────────────────────────────────────────────

function classifyFile(filename) {
  const lower = filename.toLowerCase();
  const base = filename.split('/').pop().toLowerCase(); // strip directory prefix
  if (base === 'trip.json') return 'manifest';
  if (base.match(/^dvl_.*\.json$/)) return 'dvl';
  if (lower.endsWith('.sonar')) return 'sonar';
  if (base.match(/^log_.*\.csv$/) || base.match(/^.*\.csv$/)) return 'sensor';
  if (lower.match(/\.(mp4|webm|mov|avi|mkv)$/)) return 'video';
  if (lower.match(/\.(jpg|jpeg|png|webp)$/)) return 'image';
  return 'unknown';
}

// ─── Per-type processors ──────────────────────────────────────────────────────

async function processSensor(tripId, buffer, filename, manifestTs = null) {
  const { readings, columnMapping, warnings } = parseCsvBuffer(buffer, filename, manifestTs);
  if (readings.length === 0) return { ok: false, error: 'No valid readings found', warnings };

  // eslint-disable-next-line no-unused-vars
  const docs = readings.map(({ lat, lng, ...r }) => ({ trip: tripId, sourceFile: filename, ...r }));

  // Parallel: check if this filename is already stored + get current GPS
  const [existingCount, tripDoc] = await Promise.all([
    SensorData.countDocuments({ trip: tripId, sourceFile: filename }),
    Trip.findById(tripId).select('gpsLocation').lean(),
  ]);

  let insertDocs = docs;

  if (existingCount > 0) {
    // Same filename uploaded again → replace that file's data only
    await SensorData.deleteMany({ trip: tripId, sourceFile: filename });
  } else {
    // New file → trim readings that overlap with already-stored data
    const latest = await SensorData.findOne({ trip: tripId })
      .sort({ timestamp: -1 }).select('timestamp').lean();
    const maxTs = latest?.timestamp ?? null;
    if (maxTs) {
      insertDocs = docs.filter(d => d.timestamp > maxTs);
      const dropped = docs.length - insertDocs.length;
      if (dropped > 0) warnings.push(`${dropped} overlapping rows trimmed`);
      if (insertDocs.length === 0) {
        const newCount = await SensorData.countDocuments({ trip: tripId });
        await Trip.findByIdAndUpdate(tripId, { sensorCount: newCount });
        return { ok: true, count: 0, warning: 'file_skipped', columnMapping, warnings };
      }
    }
  }

  await SensorData.insertMany(insertDocs, { ordered: false });

  const first = readings[0];
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lng);
  const hasGps = !isNaN(lat) && !isNaN(lng);

  const newCount = await SensorData.countDocuments({ trip: tripId });
  const update = { sensorCount: newCount };
  // First GPS wins — don't overwrite if trip already has coords (unless replacing same file)
  if (hasGps && (existingCount > 0 || !tripDoc?.gpsLocation?.lat)) {
    update.gpsLocation = { lat, lng };
    update.locationName = await reverseGeocode(lat, lng);
  }
  await Trip.findByIdAndUpdate(tripId, update);

  return { ok: true, count: insertDocs.length, columnMapping, warnings };
}

async function processDvl(tripId, buffer, filename) {
  const all = parseDvlBuffer(buffer);
  const valid = all.filter(r => r.status === 0);
  if (valid.length === 0) return { ok: false, error: 'No valid DVL points (status=0)' };

  const docs = valid.map(r => ({ trip: tripId, sourceFile: filename, ...r }));

  // Same filename → replace that file's data; new filename → append
  const existingCount = await DVLData.countDocuments({ trip: tripId, sourceFile: filename });
  if (existingCount > 0) {
    await DVLData.deleteMany({ trip: tripId, sourceFile: filename });
  }
  await DVLData.insertMany(docs, { ordered: false });

  const newCount = await DVLData.countDocuments({ trip: tripId });
  await Trip.findByIdAndUpdate(tripId, { dvlCount: newCount });

  return { ok: true, count: docs.length };
}

async function processSonar(tripId, buffer, filename, manifestTs = null) {
  let meta;
  try { meta = parseSonarMeta(buffer); }
  catch (e) { return { ok: false, error: e.message }; }

  // Same filename → replace (delete old S3 + DB); new filename → append
  const existing = await SonarFile.findOne({ trip: tripId, filename }).lean();
  if (existing) {
    try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: existing.s3Key })); } catch {}
    await SonarFile.deleteOne({ _id: existing._id });
  }

  const s3Key = `sonar/${tripId}/${uuidv4()}-${filename}`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Body: buffer,
    ContentType: 'application/octet-stream',
    ContentDisposition: `attachment; filename="${filename}"`,
  }));

  await SonarFile.create({
    trip: tripId, filename, s3Key,
    frameCount:    meta.frameCount,
    durationMs:    meta.durationMs,
    fileSizeBytes: buffer.length,
    recordedAt:    manifestTs || recordedAtFromFilename(filename),
  });

  const newCount = await SonarFile.countDocuments({ trip: tripId });
  await Trip.findByIdAndUpdate(tripId, { sonarCount: newCount });

  return { ok: true, filename, frameCount: meta.frameCount, durationMs: meta.durationMs };
}

// ─── Batch controller ─────────────────────────────────────────────────────────

const uploadBatch = async (req, res, next) => {
  try {
    const tripId = req.params.id;
    const trip = await Trip.findById(tripId);
    if (!trip) return error(res, 'Trip not found', 404);
    if (!req.files || req.files.length === 0) return error(res, 'No files provided', 400);

    // Flatten: if single ZIP, extract it; otherwise use files as-is
    let files = []; // { filename, buffer }

    if (req.files.length === 1 && req.files[0].originalname.toLowerCase().endsWith('.zip')) {
      const zip = new AdmZip(req.files[0].buffer);
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        files.push({ filename: entry.entryName.split('/').pop(), buffer: entry.getData() });
      }
    } else {
      files = req.files.map(f => ({ filename: f.originalname, buffer: f.buffer }));
    }

    const results = {
      sensor: null, dvl: null,
      sonar: null, video: [], image: [],
      manifest: null, unknown: [], errors: [],
    };

    // Parse trip.json if present — builds videoSuggestions for frontend display, and
    // assetTimestamps (filename → precise Date) applied below to sensor/dvl/sonar too,
    // so the manifest is the primary timestamp source for ALL asset types, not just video/photo.
    const manifestEntry = files.find(f => f.filename === 'trip.json');
    let assetTimestamps = null; // Map<filename, Date> | null
    if (manifestEntry) {
      try {
        const manifest = JSON.parse(manifestEntry.buffer.toString('utf8'));
        const videoSuggestions = [];
        assetTimestamps = new Map();
        for (const session of manifest.sessions || []) {
          const sessionStart = parseSessionId(session.session_id);
          if (!sessionStart) continue;
          for (const asset of session.assets || []) {
            const baseName = asset.file.split('/').pop();
            const ts = new Date(sessionStart.getTime() + (asset.start_ms || 0));
            assetTimestamps.set(baseName, ts);
            if (asset.type === 'video' || asset.type === 'photo') {
              videoSuggestions.push({
                filename: baseName,
                recordedAt: ts.toISOString(),
                type: asset.type,
                status: asset.status,
              });
            }
          }
        }
        results.manifest = { detected: true, videoSuggestions };

        // Persist so later reads (DVL trajectory merge) can use precise manifest timing
        // instead of re-guessing from filename every time.
        if (assetTimestamps.size > 0) {
          const merged = { ...(trip.manifestTimestamps || {}) };
          for (const [k, v] of assetTimestamps) merged[k] = v;
          trip.manifestTimestamps = merged;
          trip.markModified('manifestTimestamps');
          await trip.save();
        }
      } catch {
        results.manifest = { detected: false, error: 'Failed to parse trip.json' };
      }
    }

    // Process each file sequentially so append/overlap logic is race-condition-free
    for (const { filename, buffer } of files) {
      const type = classifyFile(filename);
      const manifestTs = assetTimestamps?.get(filename) || null;
      try {
        if (type === 'sensor') {
          const r = await processSensor(tripId, buffer, filename, manifestTs);
          // Accumulate multiple sensor files — keep results.sensor shape compatible with frontend
          if (!results.sensor) results.sensor = { ok: true, count: 0, files: [] };
          if (r.ok) {
            results.sensor.count += (r.count || 0);
            results.sensor.files.push({ filename, count: r.count, warning: r.warning || null });
          } else {
            results.sensor.ok = false;
            results.sensor.files.push({ filename, ok: false, error: r.error });
          }
        } else if (type === 'dvl') {
          const r = await processDvl(tripId, buffer, filename);
          if (!results.dvl) results.dvl = { ok: true, count: 0, files: [] };
          if (r.ok) {
            results.dvl.count += (r.count || 0);
            results.dvl.files.push({ filename, count: r.count });
          } else {
            results.dvl.ok = false;
            results.dvl.files.push({ filename, ok: false, error: r.error });
          }
        } else if (type === 'sonar') {
          const r = await processSonar(tripId, buffer, filename, manifestTs);
          if (!results.sonar) results.sonar = { ok: true, files: [] };
          if (r.ok) {
            results.sonar.files.push({ filename: r.filename, frameCount: r.frameCount, durationMs: r.durationMs });
          } else {
            results.sonar.ok = false;
            results.sonar.files.push({ filename, ok: false, error: r.error });
          }
        } else if (type === 'video' || type === 'image') {
          results[type].push({ filename, note: 'Use media upload for video/image files' });
        } else if (type === 'manifest') {
          // Already parsed above — skip processing
        } else {
          results.unknown.push(filename);
        }
      } catch (e) {
        results.errors.push({ filename, error: e.message });
      }
    }

    success(res, results, 'Batch upload complete');
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadBatch, parseCsvBuffer };
