const axios = require('axios');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../../config/s3');
const { mediaAnalysisQueue } = require('../../config/queue');
const Media = require('./media.model');
const notifService = require('../notifications/notification.service');

const YOLO_URL = process.env.YOLO_SERVICE_URL || 'http://localhost:8000';
const BUCKET   = process.env.S3_BUCKET;

mediaAnalysisQueue.process(async (job) => {
  const { mediaId, mimeType, userId } = job.data;

  const media = await Media.findById(mediaId);
  if (!media) throw new Error(`Media ${mediaId} not found`);

  // Generate a fresh 10-minute presigned URL for the yolo service to download
  const command  = new GetObjectCommand({ Bucket: BUCKET, Key: media.s3Key });
  const mediaUrl = await getSignedUrl(s3, command, { expiresIn: 600 });

  // Video needs much longer timeout: download from S3 + YOLO inference per sampled frame.
  // 30-min video @ 2s sampling = ~900 frames × ~400ms/frame ≈ 6 min + download time.
  const isVideo   = mimeType.startsWith('video/');
  const axiosTimeout = isVideo ? 22 * 60 * 1000 : 60 * 1000; // 22 min video / 60s image

  let labels;
  try {
    const { model = 'yolov8n', confidence = 0.3 } = job.data;
    const res = await axios.post(
      `${YOLO_URL}/detect`,
      { mediaUrl, mediaType: mimeType, model, confidence },
      { timeout: axiosTimeout }
    );
    labels = res.data;
  } catch (err) {
    const isConnErr = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
    await Media.findByIdAndUpdate(mediaId, { analysisStatus: 'failed' });
    if (isConnErr) {
      console.warn(`[Media Worker] YOLO unavailable or timed out — skipping ${mediaId} (${err.code})`);
      return;
    }
    throw err;
  }

  await Media.findByIdAndUpdate(mediaId, {
    labels,
    analysisStatus: 'done',
  });

  // SSE push to uploader
  if (userId) {
    notifService.create(
      userId,
      'media_analysis_done',
      'Object detection complete',
      `${labels.length} object${labels.length !== 1 ? 's' : ''} detected in your media.`,
      `/trips/${media.trip}`
    ).catch(() => {});
  }
});

console.log('[Worker] media-analysis queue ready');
