const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const DVLData = require('../dvl/dvl.model');
const SonarFile = require('../sonar/sonar.model');
const SensorData = require('../sensor/sensor.model');
const Dive = require('./dive.model');
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

function parseTimeToDate(timeStr, baseDate) {
  // timeStr: "HH:MM:SS", baseDate: "YYYY-MM-DD"
  if (!baseDate) return new Date(timeStr); // fallback — may fail
  return new Date(`${baseDate}T${timeStr}Z`);
}

function parseCsvBuffer(buffer, filename = '') {
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
  const baseDate = baseDateFromFilename(filename);
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

// ─── Nominatim reverse geocoding (same as sensor controller) ─────────────────

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse?format=json';
const USER_AGENT = 'ROV-Management/1.0 (thanhle20072004@gmail.com)';

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`${NOMINATIM_URL}&lat=${lat}&lon=${lng}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return '';
    const geo = await res.json();
    return geo.display_name || '';
  } catch { return ''; }
}

// ─── File classifier ──────────────────────────────────────────────────────────

function classifyFile(filename) {
  const lower = filename.toLowerCase();
  const base = filename.split('/').pop().toLowerCase(); // strip directory prefix
  if (base.match(/^dvl_.*\.json$/)) return 'dvl';
  if (lower.endsWith('.sonar')) return 'sonar';
  if (base.match(/^log_.*\.csv$/) || base.match(/^.*\.csv$/)) return 'sensor';
  if (lower.match(/\.(mp4|webm|mov|avi|mkv)$/)) return 'video';
  if (lower.match(/\.(jpg|jpeg|png|webp)$/)) return 'image';
  return 'unknown';
}

// ─── Per-type processors ──────────────────────────────────────────────────────

async function processSensor(diveId, buffer, filename) {
  const { readings, columnMapping, warnings } = parseCsvBuffer(buffer, filename);
  if (readings.length === 0) return { ok: false, error: 'No valid readings found', warnings };

  const docs = readings.map(({ lat, lng, ...r }) => ({ dive: diveId, ...r })); // eslint-disable-line no-unused-vars
  await SensorData.deleteMany({ dive: diveId });
  await SensorData.insertMany(docs, { ordered: false });

  const first = readings[0];
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lng);
  const hasGps = !isNaN(lat) && !isNaN(lng);

  const update = { sensorCount: docs.length };
  if (hasGps) {
    update.gpsLocation = { lat, lng };
    update.locationName = await reverseGeocode(lat, lng);
  }
  await Dive.findByIdAndUpdate(diveId, update);

  return { ok: true, count: docs.length, columnMapping, warnings };
}

async function processDvl(diveId, buffer) {
  const all = parseDvlBuffer(buffer);
  const valid = all.filter(r => r.status === 0);
  if (valid.length === 0) return { ok: false, error: 'No valid DVL points (status=0)' };

  const docs = valid.map(r => ({ dive: diveId, ...r }));
  await DVLData.deleteMany({ dive: diveId });
  await DVLData.insertMany(docs, { ordered: false });
  await Dive.findByIdAndUpdate(diveId, { dvlCount: docs.length });

  return { ok: true, count: docs.length };
}

async function processSonar(diveId, buffer, filename) {
  let meta;
  try { meta = parseSonarMeta(buffer); }
  catch (e) { return { ok: false, error: e.message }; }

  // Replace existing sonar file (same behaviour as sensor/dvl — overwrite, not accumulate)
  const existing = await SonarFile.find({ dive: diveId }).select('s3Key');
  for (const old of existing) {
    try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: old.s3Key })); } catch {}
  }
  await SonarFile.deleteMany({ dive: diveId });

  const s3Key = `sonar/${diveId}/${uuidv4()}-${filename}`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Body: buffer,
    ContentType: 'application/octet-stream',
    ContentDisposition: `attachment; filename="${filename}"`,
  }));

  await SonarFile.create({
    dive: diveId, filename, s3Key,
    frameCount:    meta.frameCount,
    durationMs:    meta.durationMs,
    fileSizeBytes: buffer.length,
    recordedAt:    recordedAtFromFilename(filename),
  });
  await Dive.findByIdAndUpdate(diveId, { $set: { sonarCount: 1 } });

  return { ok: true, filename, frameCount: meta.frameCount, durationMs: meta.durationMs };
}

// ─── Batch controller ─────────────────────────────────────────────────────────

const uploadBatch = async (req, res, next) => {
  try {
    const diveId = req.params.id;
    const dive = await Dive.findById(diveId);
    if (!dive) return error(res, 'Dive not found', 404);
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
      unknown: [], errors: [],
    };

    // Process each file sequentially so overwrite logic is race-condition-free
    for (const { filename, buffer } of files) {
      const type = classifyFile(filename);
      try {
        if (type === 'sensor') {
          results.sensor = await processSensor(diveId, buffer, filename);
        } else if (type === 'dvl') {
          results.dvl = await processDvl(diveId, buffer);
        } else if (type === 'sonar') {
          if (!results.sonar) {
            results.sonar = await processSonar(diveId, buffer, filename);
          } else {
            results.errors.push({ filename, error: 'Only 1 sonar file per dive — skipped (first file was used)' });
          }
        } else if (type === 'video' || type === 'image') {
          results[type].push({ filename, note: 'Use media upload for video/image files' });
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
