const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const s3 = require('../../config/s3');
const Snapshot = require('./snapshot.model');
const { snapshotAnalysisQueue } = require('../../config/queue');

const BUCKET = process.env.S3_BUCKET;

async function uploadPng(diveId, dataUrl, suffix = '') {
  const buf = Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const key = `snapshots/${diveId}/${uuidv4()}${suffix}.png`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buf, ContentType: 'image/png' }));
  return key;
}

const create = async ({ type, diveId, tripId, userId, parentMediaId, imageTime, startTime, endTime, dataUrl, note }) => {
  let imageS3Key    = null;
  let thumbnailS3Key = null;

  if (dataUrl) {
    if (type === 'photo') {
      imageS3Key = await uploadPng(diveId, dataUrl);
    } else {
      thumbnailS3Key = await uploadPng(diveId, dataUrl, '-thumb');
    }
  }

  return Snapshot.create({
    type, dive: diveId, trip: tripId, createdBy: userId, parentMediaId,
    imageS3Key, imageTime,
    startTime, endTime, thumbnailS3Key,
    note: note || '',
  });
};

const getByDive = async (diveId) => {
  const snaps = await Snapshot.find({ dive: diveId }).sort({ createdAt: -1 }).lean();
  return Promise.all(snaps.map(async (s) => {
    const key = s.type === 'photo' ? s.imageS3Key : s.thumbnailS3Key;
    if (!key) return s;
    try {
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 });
      return { ...s, thumbnailUrl: url };
    } catch {
      return s;
    }
  }));
};

const remove = async (snapshotId) => {
  const snap = await Snapshot.findById(snapshotId);
  if (!snap) throw { statusCode: 404, message: 'Snapshot not found' };
  const keys = [snap.imageS3Key, snap.thumbnailS3Key].filter(Boolean);
  await Promise.all(keys.map(k => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: k })).catch(() => {})));
  await Snapshot.findByIdAndDelete(snapshotId);
};

const enqueueAnalysis = async (snapshotId, { model = 'yolov8n', confidence = 0.3 } = {}) => {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(model)) throw { statusCode: 400, message: 'Invalid model name' };
  if (confidence < 0.1 || confidence > 0.9) throw { statusCode: 400, message: 'confidence must be 0.1–0.9' };

  const snap = await Snapshot.findByIdAndUpdate(
    snapshotId,
    { analysisStatus: 'pending', aiLabels: [] },
    { new: true }
  ).populate('createdBy', '_id');
  if (!snap) throw { statusCode: 404, message: 'Snapshot not found' };

  await snapshotAnalysisQueue.add(
    { snapshotId: snap._id.toString(), userId: snap.createdBy?._id?.toString(), model, confidence },
    { jobId: `snap-${snap._id}-${Date.now()}` }
  );
  return snap;
};

const updateNote = async (snapshotId, note) => {
  const snap = await Snapshot.findByIdAndUpdate(snapshotId, { note }, { new: true });
  if (!snap) throw { statusCode: 404, message: 'Snapshot not found' };
  return snap;
};

module.exports = { create, getByDive, remove, enqueueAnalysis, updateNote };
