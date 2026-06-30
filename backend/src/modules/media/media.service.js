const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const s3 = require('../../config/s3');
const Media = require('./media.model');
const { mediaAnalysisQueue } = require('../../config/queue');

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION;

// Xác định type từ mimeType
const MIME_TYPE_MAP = {
  image:    (m) => m.startsWith('image/'),
  video:    (m) => m.startsWith('video/') || m === 'audio/mp4',
  document: (m) => m === 'application/pdf',
};

const getMediaType = (mimeType) => {
  const entry = Object.entries(MIME_TYPE_MAP).find(([, test]) => test(mimeType));
  return entry ? entry[0] : 'other';
};

// Tạo presigned URL để client upload thẳng lên S3
const createPresignedUploadUrl = async ({ tripId, projectId, userId, fileName, mimeType, size, recordedAt }) => {
  const ext = fileName.split('.').pop();
  const s3Key = `trips/${tripId}/${uuidv4()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 phút

  // Tìm order cao nhất hiện tại để media mới luôn nằm ở cuối
  const last = await Media.findOne({ trip: tripId }).sort({ order: -1 }).select('order').lean();
  const nextOrder = last ? last.order + 1 : 0;

  // Lưu metadata vào DB với status pending
  const media = await Media.create({
    trip: tripId,
    project: projectId,
    uploadedBy: userId,
    originalName: fileName,
    s3Key,
    s3Bucket: BUCKET,
    mimeType,
    size,
    type: getMediaType(mimeType),
    status: 'pending',
    order: nextOrder,
    recordedAt: recordedAt || null,
  });

  return { uploadUrl, media };
};

// Sau khi upload xong, client gọi để confirm
const confirmUpload = async (mediaId) => {
  const media = await Media.findById(mediaId);
  if (!media) throw { statusCode: 404, message: 'Media not found' };

  const update = { status: 'ready', analysisStatus: 'idle' };

  // Priority: manifest (set during presigned URL) > filename > sensor auto-sync > null
  // If recordedAt already stored (came from manifest or sensor auto-sync) → keep it.
  // If null → fall back to filename pattern parsing.
  if (media.originalName && !media.recordedAt) {
    const { parseTimestampFromFilename } = require('../../utils/parseTimestamp.util');
    const parsed = parseTimestampFromFilename(media.originalName);
    if (parsed) update.recordedAt = parsed;
  }

  return Media.findByIdAndUpdate(mediaId, update, { new: true })
    .populate('uploadedBy', 'fullName');
};

// All media sorted by user-defined order then createdAt (recordedAt doesn't affect ordering)
const getByTrip = async (tripId) => {
  return Media.find({ trip: tripId, status: 'ready' })
    .populate('uploadedBy', 'fullName')
    .sort({ order: 1, createdAt: 1 });
};

const reorder = async (items) => {
  // items = [{ id, order }, ...]
  await Promise.all(
    items.map(({ id, order }) =>
      Media.findByIdAndUpdate(id, { order })
    )
  );
};

// Lấy danh sách media của 1 project
const getByProject = async (projectId) => {
  return Media.find({ project: projectId, status: 'ready' })
    .populate('uploadedBy', 'fullName')
    .sort({ createdAt: -1 });
};

// Tạo presigned URL để xem file (tránh public S3)
const createViewUrl = async (mediaId) => {
  const media = await Media.findById(mediaId);
  if (!media) throw { statusCode: 404, message: 'Media not found' };

  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: media.s3Key,
    ResponseContentDisposition: `attachment; filename="${media.originalName || 'download'}"`,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 giờ
  return { url, media };
};

// Chuyển media sang trip khác
const moveToTrip = async (mediaId, newTripId) => {
  const media = await Media.findById(mediaId);
  if (!media) throw { statusCode: 404, message: 'Media not found' };
  media.trip = newTripId;
  media.order = 0;
  await media.save();
  return media;
};

// Xóa nhiều media cùng lúc
const bulkRemove = async (ids) => {
  const mediaList = await Media.find({ _id: { $in: ids } });
  await Promise.all(
    mediaList.map(media =>
      s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: media.s3Key })).catch(() => {})
    )
  );
  await Media.deleteMany({ _id: { $in: ids } });
  return mediaList.length;
};

// Xóa media
const remove = async (mediaId) => {
  const media = await Media.findById(mediaId);
  if (!media) throw { statusCode: 404, message: 'Media not found' };

  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: media.s3Key }));
  if (media.meta?.thumbnailKey) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: media.meta.thumbnailKey })).catch(() => {});
  }

  await Media.findByIdAndDelete(mediaId);
};

// URL công khai (nếu S3 bucket public)
const getPublicUrl = (s3Key) =>
  `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`;

const update = async (mediaId, data) => {
  const allowed = ['recordedAt', 'description', 'order'];
  const patch = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
  const media = await Media.findByIdAndUpdate(mediaId, patch, { new: true });
  if (!media) throw { statusCode: 404, message: 'Media not found' };
  return media;
};

// (Re-)queue YOLO analysis — overwrites existing labels
const enqueueAnalysis = async (mediaId, { model = 'yolov8n', confidence = 0.3 } = {}) => {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(model)) throw { statusCode: 400, message: 'Invalid model name' };
  if (confidence < 0.1 || confidence > 0.9) throw { statusCode: 400, message: 'confidence must be 0.1–0.9' };

  const media = await Media.findByIdAndUpdate(
    mediaId,
    { analysisStatus: 'pending' },
    { new: true }
  ).populate('uploadedBy', '_id');
  if (!media) throw { statusCode: 404, message: 'Media not found' };

  await mediaAnalysisQueue.add(
    { mediaId: media._id.toString(), mimeType: media.mimeType, userId: media.uploadedBy?._id?.toString(), model, confidence },
    { jobId: `media-analysis-${media._id}-${Date.now()}` }
  );
  return media;
};

const cancelAnalysis = async (mediaId) => {
  const media = await Media.findByIdAndUpdate(
    mediaId,
    { analysisStatus: 'failed' },
    { new: true }
  );
  if (!media) throw { statusCode: 404, message: 'Media not found' };
  return media;
};

module.exports = { createPresignedUploadUrl, confirmUpload, getByTrip, getByProject, createViewUrl, remove, bulkRemove, reorder, moveToTrip, getPublicUrl, update, enqueueAnalysis, cancelAnalysis };
