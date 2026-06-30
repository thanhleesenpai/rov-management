const axios = require('axios');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../../config/s3');
const { snapshotAnalysisQueue } = require('../../config/queue');
const Snapshot = require('./snapshot.model');
const Media    = require('../media/media.model');
const notifService = require('../notifications/notification.service');

const YOLO_URL = process.env.YOLO_SERVICE_URL || 'http://localhost:8000';
const BUCKET   = process.env.S3_BUCKET;

snapshotAnalysisQueue.process(async (job) => {
  const { snapshotId, userId, model = 'yolov8n', confidence = 0.3 } = job.data;

  const snap = await Snapshot.findById(snapshotId);
  if (!snap) throw new Error(`Snapshot ${snapshotId} not found`);

  let mediaUrl, mimeType, startTime, endTime;

  if (snap.type === 'photo') {
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: snap.imageS3Key });
    mediaUrl = await getSignedUrl(s3, cmd, { expiresIn: 600 });
    mimeType = 'image/png';
  } else {
    // Clip: analyze the time range in the parent video
    const parent = await Media.findById(snap.parentMediaId);
    if (!parent) throw new Error(`Parent media ${snap.parentMediaId} not found`);
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: parent.s3Key });
    mediaUrl  = await getSignedUrl(s3, cmd, { expiresIn: 600 });
    mimeType  = parent.mimeType;
    startTime = snap.startTime;
    endTime   = snap.endTime;
  }

  let labels;
  try {
    const res = await axios.post(
      `${YOLO_URL}/detect`,
      { mediaUrl, mediaType: mimeType, model, confidence, startTime, endTime },
      { timeout: 5 * 60 * 1000 }
    );
    labels = res.data;
  } catch (err) {
    const isConnErr = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(err.code);
    await Snapshot.findByIdAndUpdate(snapshotId, { analysisStatus: 'failed' });
    if (isConnErr) {
      console.warn(`[Snap Worker] YOLO unavailable — skipping ${snapshotId} (${err.code})`);
      return;
    }
    throw err;
  }

  await Snapshot.findByIdAndUpdate(snapshotId, {
    aiLabels: labels,
    analysisStatus: 'done',
    'analysisMeta.model':      model,
    'analysisMeta.confidence': confidence,
    'analysisMeta.analyzedAt': new Date(),
  });

  if (userId) {
    notifService.create(
      userId,
      'snapshot_analysis_done',
      'Evidence analysis complete',
      `${labels.length} object${labels.length !== 1 ? 's' : ''} detected in evidence item.`,
      `/trips/${snap.trip}`
    ).catch(() => {});
  }
});

console.log('[Worker] snapshot-analysis queue ready');
