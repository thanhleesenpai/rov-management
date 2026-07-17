const DVLData = require('./dvl.model');
const Trip = require('../trips/trip.model');
const { success, error } = require('../../utils/response.util');

// Parse newline-delimited JSON file (DVL format from ROV_DATA)
function parseDvlBuffer(buffer) {
  const lines = buffer.toString('utf8').split('\n');
  const readings = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj.type !== 'position_local') continue;
      if (obj.x == null || obj.y == null || obj.ts == null) continue;
      readings.push({
        ts:     obj.ts,
        x:      obj.x,
        y:      obj.y,
        z:      obj.z     ?? null,
        std:    obj.std   ?? null,
        roll:   obj.roll  ?? null,
        pitch:  obj.pitch ?? null,
        yaw:    obj.yaw   ?? null,
        status: obj.status ?? 0,
      });
    } catch { /* skip malformed line */ }
  }
  return readings;
}

// Uniform downsample to maxPts points
function downsample(arr, maxPts) {
  if (arr.length <= maxPts) return arr;
  const step = arr.length / maxPts;
  const result = [];
  for (let i = 0; i < maxPts; i++) result.push(arr[Math.round(i * step)]);
  return result;
}

const upload = async (req, res, next) => {
  try {
    const tripId = req.params.id;
    const trip = await Trip.findById(tripId);
    if (!trip) return error(res, 'Trip not found', 404);
    if (!req.file) return error(res, 'No file provided', 400);

    const filename = req.file.originalname;
    const all = parseDvlBuffer(req.file.buffer);
    const valid = all.filter(r => r.status === 0);
    if (valid.length === 0) return error(res, 'No valid DVL readings found (status=0)', 400);

    const docs = valid.map(r => ({ trip: tripId, sourceFile: filename, ...r }));

    // Same filename → replace that file's data; new filename → append
    const existingCount = await DVLData.countDocuments({ trip: tripId, sourceFile: filename });
    if (existingCount > 0) {
      await DVLData.deleteMany({ trip: tripId, sourceFile: filename });
    }
    await DVLData.insertMany(docs, { ordered: false });

    const newCount = await DVLData.countDocuments({ trip: tripId });
    await Trip.findByIdAndUpdate(tripId, { dvlCount: newCount });

    success(res, { count: docs.length, total: newCount }, `${docs.length} DVL points uploaded`);
  } catch (err) {
    next(err);
  }
};

const getPath = async (req, res, next) => {
  try {
    const tripId = req.params.id;
    const { parseTimestampFromFilename } = require('../../utils/parseTimestamp.util');
    const trip = await Trip.findById(tripId).select('gpsLocation manifestTimestamps').lean();
    if (!trip) return error(res, 'Trip not found', 404);

    // .lean() returns Map fields as a plain object keyed by sourceFile
    const manifestTimestamps = trip.manifestTimestamps || {};

    const raw = await DVLData.find({ trip: tripId }).lean();

    // Build per-sourceFile anchor: ts0 (earliest ROV-clock ts in that file) + recordedAt (UTC).
    // Prefer the trip.json manifest (ms-accurate) when this trip was batch-uploaded with one;
    // fall back to parsing the filename (second-accurate at best) otherwise.
    const fileMeta = {};
    for (const pt of raw) {
      const sf = pt.sourceFile ?? '__legacy__';
      if (!fileMeta[sf]) {
        const fromManifest = pt.sourceFile ? manifestTimestamps[pt.sourceFile] : null;
        const parsed = fromManifest
          ? new Date(fromManifest)
          : (pt.sourceFile ? parseTimestampFromFilename(pt.sourceFile) : null);
        fileMeta[sf] = { ts0: pt.ts, recordedAtMs: parsed ? parsed.getTime() : null };
      } else if (pt.ts < fileMeta[sf].ts0) {
        fileMeta[sf].ts0 = pt.ts;
      }
    }

    // Each file's `ts` is its own ROV-clock seconds (often resets to ~0 per file), so
    // sorting multiple files by raw ts interleaves them instead of placing them in real
    // chronological order. Merge by absoluteMs (recordedAt + relative offset) whenever
    // every file's start time is known; otherwise fall back to raw ts (legacy single-file data).
    const canMergeByTime = Object.values(fileMeta).every(m => m.recordedAtMs != null);

    const withAbs = raw.map(r => {
      const sf = r.sourceFile ?? '__legacy__';
      const meta = fileMeta[sf];
      const relativeMs = (r.ts - meta.ts0) * 1000;
      return { r, absoluteMs: meta.recordedAtMs != null ? meta.recordedAtMs + relativeMs : null };
    });

    withAbs.sort((a, b) => canMergeByTime ? a.absoluteMs - b.absoluteMs : a.r.ts - b.r.ts);

    const data = downsample(withAbs, 2000).map(({ r, absoluteMs }) => ({
      ts: r.ts, x: r.x, y: r.y, z: r.z,
      roll: r.roll, pitch: r.pitch, yaw: r.yaw,
      // absoluteMs = UTC ms for this point; null if filename has no timestamp pattern
      absoluteMs,
    }));

    success(res, {
      data,
      count: raw.length,
      gpsAnchor: trip.gpsLocation?.lat != null ? trip.gpsLocation : null,
    });
  } catch (err) {
    next(err);
  }
};

const clear = async (req, res, next) => {
  try {
    const tripId = req.params.id;
    const { file } = req.query;

    if (file) {
      await DVLData.deleteMany({ trip: tripId, sourceFile: file });
      const newCount = await DVLData.countDocuments({ trip: tripId });
      await Trip.findByIdAndUpdate(tripId, { dvlCount: newCount });
      return success(res, { count: newCount }, `Removed "${file}"`);
    }

    await DVLData.deleteMany({ trip: tripId });
    await Trip.findByIdAndUpdate(tripId, { dvlCount: 0 });
    success(res, null, 'DVL data cleared');
  } catch (err) {
    next(err);
  }
};

module.exports = { upload, getPath, clear, parseDvlBuffer };
