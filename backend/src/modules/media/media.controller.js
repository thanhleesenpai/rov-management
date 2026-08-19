const mediaService = require('./media.service');
const Trip = require('../trips/trip.model');
const { success, error } = require('../../utils/response.util');

const YOLO_URL = process.env.YOLO_SERVICE_URL || 'http://localhost:8000';

// Cache of the last successful /models response — used as fallback when the
// YOLO service is momentarily unresponsive (e.g. busy with a heavy inference job),
// so a transient timeout doesn't make the UI drop back to showing only yolov8n.
let lastKnownModels = [{ name: 'yolov8n', label: 'YOLOv8n General', speed: 'fast', warning: null }];

const MAX_SIZE = 500 * 1024 * 1024; // 500MB

const ALLOWED_TYPES = [
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  'image/jpeg', 'image/png', 'image/webp',
  'audio/mp4', 'audio/mpeg',
  'application/pdf'
];

// Lấy presigned URL để upload
const getUploadUrl = async (req, res, next) => {
  try {
    const { tripId, fileName, mimeType, size, recordedAt } = req.body;
    let { projectId } = req.body;
    if (!tripId || !fileName || !mimeType || !size) {
      return error(res, 'Missing required fields: tripId, fileName, mimeType, size', 400);
    }
    if (size > MAX_SIZE) {
      return error(res, 'File too large. Maximum allowed size is 500MB', 400);
    }
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return error(res, `File type not allowed. Accepted: video, image, PDF`, 400);
    }
    // Derive projectId from trip if not provided by client
    if (!projectId) {
      const trip = await Trip.findById(tripId).select('project').lean();
      if (!trip) return error(res, 'Trip not found', 404);
      projectId = trip.project;
    }
    const result = await mediaService.createPresignedUploadUrl({
      tripId, projectId,
      userId: req.user._id,
      fileName, mimeType, size, recordedAt,
    });
    return success(res, result, 'Presigned URL created', 201);
  } catch (err) {
    next(err);
  }
};

// Confirm upload hoàn tất
const confirmUpload = async (req, res, next) => {
  try {
    const media = await mediaService.confirmUpload(req.params.id);
    return success(res, media, 'Upload confirmed');
  } catch (err) {
    next(err);
  }
};

// Media của 1 trip
const getByTrip = async (req, res, next) => {
  try {
    const media = await mediaService.getByTrip(req.params.tripId);
    return success(res, media);
  } catch (err) {
    next(err);
  }
};

// Media của 1 project
const getByProject = async (req, res, next) => {
  try {
    const media = await mediaService.getByProject(req.params.projectId);
    return success(res, media);
  } catch (err) {
    next(err);
  }
};

// Lấy URL xem file (presigned GET)
const getViewUrl = async (req, res, next) => {
  try {
    const result = await mediaService.createViewUrl(req.params.id);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

// Xóa media
const remove = async (req, res, next) => {
  try {
    await mediaService.remove(req.params.id);
    return success(res, null, 'Media deleted');
  } catch (err) {
    next(err);
  }
};

const reorder = async (req, res, next) => {
  try {
    const { items } = req.body; // [{ id, order }]
    if (!Array.isArray(items)) return error(res, 'items must be an array', 400);
    await mediaService.reorder(items);
    return success(res, null, 'Order updated');
  } catch (err) {
    next(err);
  }
};

const moveMedia = async (req, res, next) => {
  try {
    const { tripId } = req.body;
    if (!tripId) return error(res, 'tripId is required', 400);
    const media = await mediaService.moveToTrip(req.params.id, tripId);
    return success(res, media, 'Media moved');
  } catch (err) {
    next(err);
  }
};

const bulkDelete = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return error(res, 'ids must be a non-empty array', 400);
    const count = await mediaService.bulkRemove(ids);
    return success(res, { deleted: count }, `${count} file(s) deleted`);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const media = await mediaService.update(req.params.id, req.body);
    return success(res, media, 'Media updated');
  } catch (err) {
    next(err);
  }
};

const analyze = async (req, res, next) => {
  try {
    const { model = 'yolov8n', confidence = 0.3 } = req.body;
    await mediaService.enqueueAnalysis(req.params.id, { model, confidence });
    return success(res, null, 'Analysis queued', 202);
  } catch (err) {
    next(err);
  }
};

const getModels = async (req, res, next) => {
  try {
    const r = await fetch(`${YOLO_URL}/models`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`YOLO service returned ${r.status}`);
    const data = await r.json();
    const models = data.models?.length
      ? data.models
      : [{ name: 'yolov8n', label: 'YOLOv8n General', speed: 'fast', warning: null }];
    lastKnownModels = models;
    return success(res, models);
  } catch (err) {
    console.error('[media] GET /models failed, falling back to cache:', err.message);
    return success(res, lastKnownModels);
  }
};

const cancelAnalyze = async (req, res, next) => {
  try {
    await mediaService.cancelAnalysis(req.params.id);
    return success(res, null, 'Analysis cancelled');
  } catch (err) {
    next(err);
  }
};

module.exports = { getUploadUrl, confirmUpload, getByTrip, getByProject, getViewUrl, remove, bulkDelete, reorder, moveMedia, update, analyze, cancelAnalyze, getModels };
