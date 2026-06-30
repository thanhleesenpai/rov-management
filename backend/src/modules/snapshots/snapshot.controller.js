const snapshotService = require('./snapshot.service');
const Trip = require('../trips/trip.model');
const { success, error } = require('../../utils/response.util');

const create = async (req, res, next) => {
  try {
    const { type, tripId, parentMediaId, imageTime, startTime, endTime, dataUrl, note } = req.body;
    if (!type || !tripId || !parentMediaId) return error(res, 'type, tripId, parentMediaId required', 400);
    if (type === 'photo' && imageTime == null) return error(res, 'imageTime required for photo', 400);
    if (type === 'clip' && (startTime == null || endTime == null))
      return error(res, 'startTime and endTime required for clip', 400);

    const trip = await Trip.findById(tripId).select('project').lean();
    if (!trip) return error(res, 'Trip not found', 404);

    const snap = await snapshotService.create({
      type, tripId, projectId: trip.project, userId: req.user._id,
      parentMediaId, imageTime, startTime, endTime, dataUrl, note,
    });
    return success(res, snap, 'Snapshot created', 201);
  } catch (err) { next(err); }
};

const getByTrip = async (req, res, next) => {
  try {
    const snaps = await snapshotService.getByTrip(req.params.tripId);
    return success(res, snaps);
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await snapshotService.remove(req.params.id);
    return success(res, null, 'Snapshot deleted');
  } catch (err) { next(err); }
};

const bulkDelete = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return error(res, 'ids must be an array', 400);
    const count = await snapshotService.bulkRemove(ids);
    return success(res, { deleted: count }, `${count} snapshots deleted`);
  } catch (err) { next(err); }
};

const analyze = async (req, res, next) => {
  try {
    const { model = 'yolov8n', confidence = 0.3 } = req.body;
    await snapshotService.enqueueAnalysis(req.params.id, { model, confidence });
    return success(res, null, 'Analysis queued', 202);
  } catch (err) { next(err); }
};

const cancelAnalyze = async (req, res, next) => {
  try {
    await snapshotService.cancelAnalysis(req.params.id);
    return success(res, null, 'Analysis cancelled');
  } catch (err) { next(err); }
};

const getDownloadUrl = async (req, res, next) => {
  try {
    const result = await snapshotService.getDownloadUrl(req.params.id);
    return success(res, result);
  } catch (err) { next(err); }
};

const updateNote = async (req, res, next) => {
  try {
    const snap = await snapshotService.updateNote(req.params.id, req.body.note || '');
    return success(res, snap, 'Note updated');
  } catch (err) { next(err); }
};

// Streams clip video directly — does NOT use success() wrapper (binary response)
const downloadClip = async (req, res, next) => {
  try {
    await snapshotService.streamClipDownload(req.params.id, res);
  } catch (err) { next(err); }
};

// Proxy raw image bytes through backend — avoids CORS/tainted-canvas for client canvas export
const proxyImage = async (req, res, next) => {
  try {
    await snapshotService.proxyImage(req.params.id, res);
  } catch (err) { next(err); }
};

const frameAt = async (req, res, next) => {
  try {
    const time = parseFloat(req.query.time);
    if (isNaN(time) || time < 0) return res.status(400).json({ message: 'Invalid time parameter' });
    await snapshotService.streamFrameAt(req.params.id, time, res);
  } catch (err) { next(err); }
};

module.exports = { create, getByTrip, remove, bulkDelete, analyze, cancelAnalyze, updateNote, getDownloadUrl, downloadClip, proxyImage, frameAt };
