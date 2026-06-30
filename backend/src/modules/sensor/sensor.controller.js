const mongoose = require('mongoose');
const SensorData = require('./sensor.model');
const DVLData    = require('../dvl/dvl.model');
const SonarFile  = require('../sonar/sonar.model');
const Trip = require('../trips/trip.model');
const { success, error } = require('../../utils/response.util');

const { reverseGeocode } = require('../../utils/geocode.util');

const upload = async (req, res, next) => {
  try {
    const tripId = req.params.id;
    const { readings, sourceFile } = req.body;

    if (!Array.isArray(readings) || readings.length === 0) {
      return error(res, 'readings must be a non-empty array', 400);
    }

    const trip = await Trip.findById(tripId);
    if (!trip) return error(res, 'Trip not found', 404);

    const optNum = (v) => (v != null && v !== '') ? Number(v) : null;
    const docs = [];
    for (const [i, r] of readings.entries()) {
      const ts = new Date(r.timestamp);
      if (isNaN(ts.getTime())) return error(res, `Row ${i + 1}: invalid timestamp "${r.timestamp}"`, 400);
      if (r.depth == null) return error(res, `Row ${i + 1}: depth is required`, 400);
      docs.push({
        trip:            tripId,
        sourceFile:      sourceFile || null,
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

    let insertDocs = docs;
    let warning = null;
    let droppedCount = 0;

    if (!sourceFile) {
      // Legacy (no sourceFile) → replace all, backward compat with SensorUpload.jsx
      await SensorData.deleteMany({ trip: tripId });
    } else {
      const existingCount = await SensorData.countDocuments({ trip: tripId, sourceFile });
      if (existingCount > 0) {
        // Same filename → replace that file's data
        await SensorData.deleteMany({ trip: tripId, sourceFile });
      } else {
        // New file → trim timestamps that overlap with already-stored data
        const latest = await SensorData.findOne({ trip: tripId })
          .sort({ timestamp: -1 }).select('timestamp').lean();
        const maxTs = latest?.timestamp ?? null;
        if (maxTs) {
          insertDocs = docs.filter(d => d.timestamp > maxTs);
          droppedCount = docs.length - insertDocs.length;
          if (insertDocs.length === 0) warning = 'file_skipped';
          else if (droppedCount > 0) warning = 'overlap_trimmed';
        }
      }
    }

    if (insertDocs.length > 0) {
      await SensorData.insertMany(insertDocs, { ordered: false });
    }

    const first = readings[0];
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lng);
    const hasGps = !isNaN(lat) && !isNaN(lng);

    const newCount = await SensorData.countDocuments({ trip: tripId });
    const tripUpdate = { sensorCount: newCount };
    // First GPS encountered wins — don't overwrite if trip already has coords
    if (hasGps && !trip.gpsLocation?.lat) {
      tripUpdate.gpsLocation = { lat, lng };
      tripUpdate.locationName = await reverseGeocode(lat, lng);
    }
    await Trip.findByIdAndUpdate(tripId, tripUpdate);

    const responseData = { count: insertDocs.length, total: newCount };
    if (warning) { responseData.warning = warning; responseData.droppedCount = droppedCount; }

    success(res, responseData,
      warning === 'file_skipped'
        ? 'File skipped: all timestamps overlap with existing data'
        : `${insertDocs.length} readings uploaded`);
  } catch (err) {
    next(err);
  }
};

const clear = async (req, res, next) => {
  try {
    const tripId = req.params.id;
    const { file } = req.query;

    if (file) {
      // Delete a single source file's readings only
      await SensorData.deleteMany({ trip: tripId, sourceFile: file });
      const newCount = await SensorData.countDocuments({ trip: tripId });
      await Trip.findByIdAndUpdate(tripId, { sensorCount: newCount });
      return success(res, { count: newCount }, `Removed "${file}"`);
    }

    // No ?file= → wipe all sensor data for this trip
    await SensorData.deleteMany({ trip: tripId });
    await Trip.findByIdAndUpdate(tripId, {
      sensorCount: 0,
      gpsLocation: { lat: null, lng: null },
      locationName: '',
    });
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
    const tripId = req.params.id;
    const trip = await Trip.findById(tripId);
    if (!trip) return error(res, 'Trip not found', 404);

    const raw = await SensorData.find({ trip: tripId }).sort({ timestamp: 1 }).lean();
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
      sourceFile:      r.sourceFile      || null,
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

// GET /trips/:id/data-files — aggregate all data files attached to a trip
const getDataFiles = async (req, res, next) => {
  try {
    const tripId = req.params.id;
    const tripObjId = new mongoose.Types.ObjectId(tripId);

    const [sensorFiles, dvlGroups, sonarFiles] = await Promise.all([
      SensorData.aggregate([
        { $match: { trip: tripObjId } },
        { $group: {
          _id:   '$sourceFile',
          count: { $sum: 1 },
          minTs: { $min: '$timestamp' },
          maxTs: { $max: '$timestamp' },
        }},
        { $sort: { minTs: 1 } },
      ]),
      DVLData.aggregate([
        { $match: { trip: tripObjId } },
        { $group: { _id: '$sourceFile', count: { $sum: 1 } } },
      ]),
      SonarFile.find({ trip: tripId }).sort({ recordedAt: 1, createdAt: 1 }).lean(),
    ]);

    success(res, {
      sensor: sensorFiles.map(f => ({
        sourceFile: f._id,
        count:      f.count,
        minTs:      f.minTs,
        maxTs:      f.maxTs,
      })),
      dvl:   dvlGroups.map(f => ({ sourceFile: f._id, count: f.count })),
      sonar: sonarFiles,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { upload, clear, getSensorData, getDataFiles };
