const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const s3 = require('../../config/s3');
const Media = require('./media.model');

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
const createPresignedUploadUrl = async ({ jobId, tripId, userId, fileName, mimeType, size }) => {
  const ext = fileName.split('.').pop();
  const s3Key = `jobs/${jobId}/${uuidv4()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: mimeType,
    // Không ký ContentLength — tránh lỗi signature khi client upload
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 phút

  // Lưu metadata vào DB với status pending
  const media = await Media.create({
    job: jobId,
    trip: tripId,
    uploadedBy: userId,
    originalName: fileName,
    s3Key,
    s3Bucket: BUCKET,
    mimeType,
    size,
    type: getMediaType(mimeType),
    status: 'pending',
  });

  return { uploadUrl, media };
};

// Sau khi upload xong, client gọi để confirm
const confirmUpload = async (mediaId) => {
  const media = await Media.findByIdAndUpdate(
    mediaId,
    { status: 'ready' },
    { new: true }
  ).populate('uploadedBy', 'fullName');

  if (!media) throw { statusCode: 404, message: 'Media not found' };
  return media;
};

// Lấy danh sách media của 1 job
const getByJob = async (jobId) => {
  return Media.find({ job: jobId, status: 'ready' })
    .populate('uploadedBy', 'fullName')
    .sort({ order: 1, createdAt: -1 });
};

const reorder = async (items) => {
  // items = [{ id, order }, ...]
  await Promise.all(
    items.map(({ id, order }) =>
      Media.findByIdAndUpdate(id, { order })
    )
  );
};

// Lấy danh sách media của 1 trip
const getByTrip = async (tripId) => {
  return Media.find({ trip: tripId, status: 'ready' })
    .populate('uploadedBy', 'fullName')
    .sort({ createdAt: -1 });
};

// Tạo presigned URL để xem file (tránh public S3)
const createViewUrl = async (mediaId) => {
  const media = await Media.findById(mediaId);
  if (!media) throw { statusCode: 404, message: 'Media not found' };

  const command = new GetObjectCommand({ Bucket: BUCKET, Key: media.s3Key });
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 giờ
  return { url, media };
};

// Chuyển media sang job khác
const moveToJob = async (mediaId, newJobId) => {
  const media = await Media.findById(mediaId);
  if (!media) throw { statusCode: 404, message: 'Media not found' };
  media.job = newJobId;
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

module.exports = { createPresignedUploadUrl, confirmUpload, getByJob, getByTrip, createViewUrl, remove, bulkRemove, reorder, moveToJob, getPublicUrl };
