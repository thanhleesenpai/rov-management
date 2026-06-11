const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const SonarFile = require('./sonar.model');
const Dive = require('../dives/dive.model');
const s3 = require('../../config/s3');
const { success, error } = require('../../utils/response.util');

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
function recordedAtFromFilename(filename) {
  const m = filename.match(/(\d{8})_(\d{6})/);
  if (!m) return null;
  const [, date, time] = m;
  const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${time.slice(0,2)}:${time.slice(2,4)}:${time.slice(4,6)}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

const upload = async (req, res, next) => {
  try {
    const diveId = req.params.id;
    const dive = await Dive.findById(diveId);
    if (!dive) return error(res, 'Dive not found', 404);
    if (!req.file) return error(res, 'No file provided', 400);

    let meta;
    try {
      meta = parseSonarMeta(req.file.buffer);
    } catch (e) {
      return error(res, e.message, 400);
    }

    const filename = req.file.originalname;
    const s3Key = `sonar/${diveId}/${uuidv4()}-${filename}`;

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: 'application/octet-stream',
      ContentDisposition: `attachment; filename="${filename}"`,
    }));

    // Replace existing sonar file (1 per dive)
    const existing = await SonarFile.find({ dive: diveId }).select('s3Key');
    for (const old of existing) {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: old.s3Key })).catch(() => {});
    }
    await SonarFile.deleteMany({ dive: diveId });

    const doc = await SonarFile.create({
      dive: diveId,
      filename,
      s3Key,
      frameCount:    meta.frameCount,
      durationMs:    meta.durationMs,
      fileSizeBytes: req.file.size,
      recordedAt:    recordedAtFromFilename(filename),
    });

    await Dive.findByIdAndUpdate(diveId, { $set: { sonarCount: 1 } });

    success(res, doc, 'Sonar file uploaded', 201);
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const diveId = req.params.id;
    const dive = await Dive.findById(diveId).lean();
    if (!dive) return error(res, 'Dive not found', 404);

    const files = await SonarFile.find({ dive: diveId }).sort({ createdAt: 1 }).lean();
    success(res, files);
  } catch (err) {
    next(err);
  }
};

const getUrl = async (req, res, next) => {
  try {
    const sonarFile = await SonarFile.findOne({
      _id: req.params.sonarId,
      dive: req.params.id,
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
      dive: req.params.id,
    });
    if (!sonarFile) return error(res, 'Sonar file not found', 404);

    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: sonarFile.s3Key })).catch(() => {});
    await sonarFile.deleteOne();
    await Dive.findByIdAndUpdate(req.params.id, { $set: { sonarCount: 0 } });

    success(res, null, 'Sonar file deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { upload, list, getUrl, remove, parseSonarMeta, recordedAtFromFilename };
