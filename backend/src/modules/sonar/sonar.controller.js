const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const SonarFile = require('./sonar.model');
const Trip = require('../trips/trip.model');
const s3 = require('../../config/s3');
const { success, error } = require('../../utils/response.util');
const { parseTimestampFromFilename } = require('../../utils/parseTimestamp.util');

const BUCKET = process.env.S3_BUCKET;
const MAGIC = 'SONAR360';
const HEADER_SIZE = 32;
const FRAME_HEADER = 12; // timestampMs(8) + angleGrads(2) + numSamples(2)

// Parse sonar binary: validate magic, count frames, get duration
function parseSonarMeta(buffer) {
  if (buffer.length < HEADER_SIZE) throw new Error('File too small');
  const magic = buffer.toString('ascii', 0, 8);
  if (magic !== MAGIC) throw new Error(`Invalid sonar file: expected magic "${MAGIC}", got "${magic}"`);

  let offset = HEADER_SIZE;
  let frameCount = 0;
  let firstTs = null;
  let lastTs = null;

  while (offset + FRAME_HEADER <= buffer.length) {
    const tsMs = Number(buffer.readBigInt64LE(offset));
    const numSamples = buffer.readUInt16LE(offset + 10);
    const frameSize = FRAME_HEADER + numSamples;

    if (offset + frameSize > buffer.length) break;

    if (firstTs === null) firstTs = tsMs;
    lastTs = tsMs;
    frameCount++;
    offset += frameSize;
  }

  const durationMs = (firstTs !== null && lastTs !== null) ? lastTs - firstTs : 0;
  return { frameCount, durationMs };
}

// Parse recordedAt from filename e.g. "sonar_20260601_170042.sonar"
// (filename timestamps are UTC+7 — delegate to the shared parser)
function recordedAtFromFilename(filename) {
  return parseTimestampFromFilename(filename);
}

const upload = async (req, res, next) => {
  try {
    const tripId = req.params.id;
    const trip = await Trip.findById(tripId);
    if (!trip) return error(res, 'Trip not found', 404);
    if (!req.file) return error(res, 'No file provided', 400);

    let meta;
    try {
      meta = parseSonarMeta(req.file.buffer);
    } catch (e) {
      return error(res, e.message, 400);
    }

    const filename = req.file.originalname;

    // Same filename → replace (delete old S3 + DB); new filename → append
    const existing = await SonarFile.findOne({ trip: tripId, filename }).lean();
    if (existing) {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: existing.s3Key })).catch(() => {});
      await SonarFile.deleteOne({ _id: existing._id });
    }

    const s3Key = `sonar/${tripId}/${uuidv4()}-${filename}`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: 'application/octet-stream',
      ContentDisposition: `attachment; filename="${filename}"`,
    }));

    const doc = await SonarFile.create({
      trip: tripId,
      filename,
      s3Key,
      frameCount:    meta.frameCount,
      durationMs:    meta.durationMs,
      fileSizeBytes: req.file.size,
      recordedAt:    recordedAtFromFilename(filename),
    });

    const newCount = await SonarFile.countDocuments({ trip: tripId });
    await Trip.findByIdAndUpdate(tripId, { sonarCount: newCount });

    success(res, doc, 'Sonar file uploaded', 201);
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const tripId = req.params.id;
    const trip = await Trip.findById(tripId).lean();
    if (!trip) return error(res, 'Trip not found', 404);

    const files = await SonarFile.find({ trip: tripId }).sort({ createdAt: 1 }).lean();
    success(res, files);
  } catch (err) {
    next(err);
  }
};

const getUrl = async (req, res, next) => {
  try {
    const sonarFile = await SonarFile.findOne({
      _id: req.params.sonarId,
      trip: req.params.id,
    }).lean();
    if (!sonarFile) return error(res, 'Sonar file not found', 404);

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: sonarFile.s3Key }),
      { expiresIn: 900 },
    );
    success(res, { url, expiresIn: 900 });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const sonarFile = await SonarFile.findOne({
      _id: req.params.sonarId,
      trip: req.params.id,
    });
    if (!sonarFile) return error(res, 'Sonar file not found', 404);

    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: sonarFile.s3Key })).catch(() => {});
    await sonarFile.deleteOne();
    const newCount = await SonarFile.countDocuments({ trip: req.params.id });
    await Trip.findByIdAndUpdate(req.params.id, { sonarCount: newCount });

    success(res, null, 'Sonar file deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { upload, list, getUrl, remove, parseSonarMeta, recordedAtFromFilename };
