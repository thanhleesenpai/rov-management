const DVLData = require('./dvl.model');
const Dive = require('../dives/dive.model');
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
    const diveId = req.params.id;
    const dive = await Dive.findById(diveId);
    if (!dive) return error(res, 'Dive not found', 404);

    if (!req.file) return error(res, 'No file provided', 400);

    const all = parseDvlBuffer(req.file.buffer);
    const valid = all.filter(r => r.status === 0);
    if (valid.length === 0) return error(res, 'No valid DVL readings found (status=0)', 400);

    const docs = valid.map(r => ({ dive: diveId, ...r }));
    await DVLData.deleteMany({ dive: diveId });
    await DVLData.insertMany(docs, { ordered: false });
    await Dive.findByIdAndUpdate(diveId, { dvlCount: docs.length });

    success(res, { count: docs.length }, `${docs.length} DVL points uploaded`);
  } catch (err) {
    next(err);
  }
};

const getPath = async (req, res, next) => {
  try {
    const diveId = req.params.id;
    const dive = await Dive.findById(diveId).select('gpsLocation').lean();
    if (!dive) return error(res, 'Dive not found', 404);

    const raw = await DVLData.find({ dive: diveId }).sort({ ts: 1 }).lean();
    const data = downsample(raw, 2000).map(r => ({
      ts: r.ts, x: r.x, y: r.y, z: r.z,
      roll: r.roll, pitch: r.pitch, yaw: r.yaw,
    }));

    success(res, {
      data,
      count: raw.length,
      gpsAnchor: dive.gpsLocation?.lat != null ? dive.gpsLocation : null,
    });
  } catch (err) {
    next(err);
  }
};

const clear = async (req, res, next) => {
  try {
    const diveId = req.params.id;
    await DVLData.deleteMany({ dive: diveId });
    await Dive.findByIdAndUpdate(diveId, { dvlCount: 0 });
    success(res, null, 'DVL data cleared');
  } catch (err) {
    next(err);
  }
};

module.exports = { upload, getPath, clear, parseDvlBuffer };
