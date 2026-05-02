const mediaService = require('./media.service');
const { success, error } = require('../../utils/response.util');

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
    const { jobId, tripId, fileName, mimeType, size } = req.body;
    if (!jobId || !tripId || !fileName || !mimeType || !size) {
      return error(res, 'Missing required fields: jobId, tripId, fileName, mimeType, size', 400);
    }
    if (size > MAX_SIZE) {
      return error(res, 'File too large. Maximum allowed size is 500MB', 400);
    }
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return error(res, `File type not allowed. Accepted: video, image, PDF`, 400);
    }
    const result = await mediaService.createPresignedUploadUrl({
      jobId, tripId,
      userId: req.user._id,
      fileName, mimeType, size
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

// Media của 1 job
const getByJob = async (req, res, next) => {
  try {
    const media = await mediaService.getByJob(req.params.jobId);
    return success(res, media);
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
    const { jobId } = req.body;
    if (!jobId) return error(res, 'jobId is required', 400);
    const media = await mediaService.moveToJob(req.params.id, jobId);
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

module.exports = { getUploadUrl, confirmUpload, getByJob, getByTrip, getViewUrl, remove, bulkDelete, reorder, moveMedia };
