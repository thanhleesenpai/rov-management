const snapshotService = require('./snapshot.service');
const Dive = require('../dives/dive.model');
const { success, error } = require('../../utils/response.util');

const create = async (req, res, next) => {
  try {
    const { type, diveId, parentMediaId, imageTime, startTime, endTime, dataUrl, note } = req.body;
    if (!type || !diveId || !parentMediaId) return error(res, 'type, diveId, parentMediaId required', 400);
    if (type === 'photo' && imageTime == null) return error(res, 'imageTime required for photo', 400);
    if (type === 'clip' && (startTime == null || endTime == null))
      return error(res, 'startTime and endTime required for clip', 400);

    const dive = await Dive.findById(diveId).select('trip').lean();
    if (!dive) return error(res, 'Dive not found', 404);

    const snap = await snapshotService.create({
      type, diveId, tripId: dive.trip, userId: req.user._id,
      parentMediaId, imageTime, startTime, endTime, dataUrl, note,
    });
    return success(res, snap, 'Snapshot created', 201);
  } catch (err) { next(err); }
};

const getByDive = async (req, res, next) => {
  try {
    const snaps = await snapshotService.getByDive(req.params.diveId);
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

module.exports = { create, getByDive, remove, bulkDelete, analyze, updateNote, getDownloadUrl, downloadClip, proxyImage };
