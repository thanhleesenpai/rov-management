const SensorData = require('./sensor.model');
const Dive = require('../dives/dive.model');
const { success, error } = require('../../utils/response.util');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse?format=json';
const USER_AGENT    = 'ROV-Management/1.0 (thanhle20072004@gmail.com)';

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

const upload = async (req, res, next) => {
  try {
    const diveId = req.params.id;
    const { readings } = req.body;

    if (!Array.isArray(readings) || readings.length === 0) {
      return error(res, 'readings must be a non-empty array', 400);
    }

    const dive = await Dive.findById(diveId);
    if (!dive) return error(res, 'Dive not found', 404);

    const docs = [];
    for (const [i, r] of readings.entries()) {
      const ts = new Date(r.timestamp);
      if (isNaN(ts.getTime())) return error(res, `Row ${i + 1}: invalid timestamp "${r.timestamp}"`, 400);
      if (r.depth == null) {
        return error(res, `Row ${i + 1}: depth is required`, 400);
      }
      const optNum = (v) => (v != null && v !== '') ? Number(v) : null;
      docs.push({
        dive:            diveId,
        timestamp:       ts,
        depth:           Number(r.depth),
        temp:            optNum(r.temp),
        pressure:        optNum(r.pressure),
        temperature:     optNum(r.temperature),
        yaw:             optNum(r.yaw),
        pitch:           optNum(r.pitch),
        roll:            optNum(r.roll),
        voltage:         optNum(r.voltage),
        battery_percent: optNum(r.battery_percent),
        humidity:        optNum(r.humidity),
        holdDepth:       optNum(r.holdDepth),
        holdHeading:     optNum(r.holdHeading),
        manual:          optNum(r.manual),
        cameraTilt:      optNum(r.cameraTilt),
        lightLevel:      optNum(r.lightLevel),
        powerLevel:      optNum(r.powerLevel),
      });
    }

    await SensorData.deleteMany({ dive: diveId });
    await SensorData.insertMany(docs, { ordered: false });

    // Read GPS from first row → save to dive
    const first = readings[0];
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lng);
    const hasGps = !isNaN(lat) && !isNaN(lng);

    const diveUpdate = { sensorCount: docs.length };
    if (hasGps) {
      diveUpdate.gpsLocation = { lat, lng };
      diveUpdate.locationName = await reverseGeocode(lat, lng);
    }
    await Dive.findByIdAndUpdate(diveId, diveUpdate);

    success(res, { count: docs.length }, `${docs.length} readings uploaded`);
  } catch (err) {
    next(err);
  }
};

const clear = async (req, res, next) => {
  try {
    const diveId = req.params.id;
    await SensorData.deleteMany({ dive: diveId });
    await Dive.findByIdAndUpdate(diveId, { sensorCount: 0, gpsLocation: { lat: null, lng: null }, locationName: '' });
    success(res, null, 'Sensor data cleared');
  } catch (err) {
    next(err);
  }
};

function zScoreAnomalies(readings, metric, threshold = 2.5) {
  const vals = readings.map(r => r[metric]).filter(v => v != null && !isNaN(v));
  if (vals.length < 4) return [];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  if (std === 0) return [];
  const anomalies = [];
  readings.forEach((r, index) => {
    const v = r[metric];
    if (v == null || isNaN(v)) return;
    const z = Math.abs((v - mean) / std);
    if (z > threshold) anomalies.push({ index, metric, value: v, zScore: +z.toFixed(2), timestamp: r.timestamp });
  });
  return anomalies;
}

const getSensorData = async (req, res, next) => {
  try {
    const diveId = req.params.id;
    const dive = await Dive.findById(diveId);
    if (!dive) return error(res, 'Dive not found', 404);

    const raw = await SensorData.find({ dive: diveId }).sort({ timestamp: 1 }).lean();
    if (raw.length === 0) return success(res, { data: [], stats: null, anomalies: [] });

    const stats = {};
    for (const metric of ['depth', 'temp', 'temperature', 'pressure', 'voltage', 'battery_percent', 'humidity', 'powerLevel', 'lightLevel', 'cameraTilt']) {
      const vals = raw.map(r => r[metric]).filter(v => v != null);
      if (!vals.length) { stats[metric] = null; continue; }
      stats[metric] = {
        min: +Math.min(...vals).toFixed(3),
        max: +Math.max(...vals).toFixed(3),
        avg: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3),
      };
    }

    const anomalies = [
      ...zScoreAnomalies(raw, 'depth'),
      ...zScoreAnomalies(raw, 'temp'),
      ...zScoreAnomalies(raw, 'temperature'),
      ...zScoreAnomalies(raw, 'pressure'),
      ...zScoreAnomalies(raw, 'voltage'),
      ...zScoreAnomalies(raw, 'battery_percent'),
      ...zScoreAnomalies(raw, 'humidity'),
    ].sort((a, b) => a.index - b.index);

    const data = raw.map(r => ({
      timestamp:       r.timestamp,
      depth:           r.depth,
      temp:            r.temp,
      pressure:        r.pressure,
      temperature:     r.temperature     ?? null,
      yaw:             r.yaw             ?? null,
      pitch:           r.pitch           ?? null,
      roll:            r.roll            ?? null,
      voltage:         r.voltage         ?? null,
      battery_percent: r.battery_percent ?? null,
      humidity:        r.humidity        ?? null,
      holdDepth:       r.holdDepth       ?? null,
      holdHeading:     r.holdHeading     ?? null,
      manual:          r.manual          ?? null,
      cameraTilt:      r.cameraTilt      ?? null,
      lightLevel:      r.lightLevel      ?? null,
      powerLevel:      r.powerLevel      ?? null,
    }));

    success(res, { data, stats, anomalies });
  } catch (err) {
    next(err);
  }
};

module.exports = { upload, clear, getSensorData };
