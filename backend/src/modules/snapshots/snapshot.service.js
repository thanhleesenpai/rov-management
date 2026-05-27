const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const s3 = require('../../config/s3');
const Snapshot = require('./snapshot.model');
const Media = require('../media/media.model');
const { snapshotAnalysisQueue } = require('../../config/queue');

ffmpeg.setFfmpegPath(ffmpegPath);

const BUCKET = process.env.S3_BUCKET;

async function uploadImage(diveId, dataUrl, suffix = '') {
  if (!dataUrl) return null; // Handle null dataUrl (CORS case)
  const [header, b64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const ext  = mime === 'image/png' ? 'png' : 'jpg';
  const buf  = Buffer.from(b64, 'base64');
  const key  = `snapshots/${diveId}/${uuidv4()}${suffix}.${ext}`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buf, ContentType: mime }));
  return key;
}

// Extract frame from S3 video using FFmpeg when dataUrl is not available (CORS case)
async function extractFrameFromVideo(diveId, parentMediaId, imageTime) {
  try {
    const Media = require('../media/media.model');
    const media = await Media.findById(parentMediaId).lean();
    if (!media?.s3Key) return null;

    const videoUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: media.s3Key }),
      { expiresIn: 300 }
    );

    // Extract frame to temp file, then upload to S3
    return new Promise((resolve, reject) => {
      const tempFile = path.join(os.tmpdir(), `frame-${uuidv4()}.png`);
      const timeout = setTimeout(() => {
        fs.unlink(tempFile).catch(() => {});
        reject(new Error('FFmpeg frame extraction timeout'));
      }, 30000); // 30s timeout

      ffmpeg(videoUrl)
        .seekInput(Math.max(0, imageTime))
        .frames(1)
        .output(tempFile)
        .on('end', async () => {
          clearTimeout(timeout);
          try {
            const buffer = await fs.readFile(tempFile);
            if (buffer.length === 0) throw new Error('FFmpeg produced empty output');

            const key = `snapshots/${diveId}/${uuidv4()}.png`;
            await s3.send(new PutObjectCommand({
              Bucket: BUCKET,
              Key: key,
              Body: buffer,
              ContentType: 'image/png'
            }));
            await fs.unlink(tempFile);
            resolve(key);
          } catch (err) {
            await fs.unlink(tempFile).catch(() => {});
            reject(err);
          }
        })
        .on('error', (err) => {
          clearTimeout(timeout);
          fs.unlink(tempFile).catch(() => {});
          reject(err);
        })
        .run();
    });
  } catch (err) {
    console.error('extractFrameFromVideo error:', err.message);
    return null;
  }
}

const create = async ({ type, diveId, tripId, userId, parentMediaId, imageTime, startTime, endTime, dataUrl, note }) => {
  let imageS3Key    = null;
  let thumbnailS3Key = null;

  if (dataUrl) {
    // Client sent base64 image (no CORS issue)
    if (type === 'photo') {
      imageS3Key = await uploadImage(diveId, dataUrl);
    } else {
      thumbnailS3Key = await uploadImage(diveId, dataUrl, '-thumb');
    }
  } else {
    // Canvas was tainted (CORS) — extract frame from S3 video using FFmpeg
    if (type === 'photo' && imageTime != null) {
      try {
        imageS3Key = await extractFrameFromVideo(diveId, parentMediaId, imageTime);
      } catch (err) {
        console.error('Frame extraction failed:', err.message);
        // Continue anyway — snapshot created without image
      }
    } else if (type === 'clip' && startTime != null && endTime != null) {
      // Extract thumbnail at startTime
      try {
        thumbnailS3Key = await extractFrameFromVideo(diveId, parentMediaId, startTime);
      } catch (err) {
        console.error('Thumbnail extraction failed:', err.message);
        // Continue anyway
      }
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
      // Photo: imageUrl, Clip: thumbnailUrl
      const urlField = s.type === 'photo' ? 'imageUrl' : 'thumbnailUrl';
      return { ...s, [urlField]: url };
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

const getDownloadUrl = async (snapshotId) => {
  const snap = await Snapshot.findById(snapshotId);
  if (!snap) throw { statusCode: 404, message: 'Snapshot not found' };
  const key = snap.type === 'photo' ? snap.imageS3Key : snap.thumbnailS3Key;
  if (!key) throw { statusCode: 404, message: 'No image stored for this snapshot' };
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: 300,
  });
  const filename = snap.type === 'photo'
    ? `snapshot-${String(snap._id).slice(-6)}.png`
    : `clip-thumb-${String(snap._id).slice(-6)}.png`;
  return { url, filename };
};

const updateNote = async (snapshotId, note) => {
  const snap = await Snapshot.findByIdAndUpdate(snapshotId, { note }, { new: true });
  if (!snap) throw { statusCode: 404, message: 'Snapshot not found' };
  return snap;
};

// Stream a clip segment directly to the HTTP response using FFmpeg -c copy (no re-encode)
const streamClipDownload = async (snapshotId, res) => {
  const snap = await Snapshot.findById(snapshotId).lean();
  if (!snap) throw { statusCode: 404, message: 'Snapshot not found' };
  if (snap.type !== 'clip') throw { statusCode: 400, message: 'Not a clip snapshot' };
  if (snap.startTime == null || snap.endTime == null) throw { statusCode: 400, message: 'Clip has no time range' };

  const media = await Media.findById(snap.parentMediaId).lean();
  if (!media?.s3Key) throw { statusCode: 404, message: 'Parent video not found' };

  // Short-lived presigned URL — ffmpeg downloads it directly, never touches disk
  const videoUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: media.s3Key }),
    { expiresIn: 300 },
  );

  const duration = snap.endTime - snap.startTime;
  const filename = `clip-${String(snap._id).slice(-6)}.mp4`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'video/mp4');

  ffmpeg(videoUrl)
    .seekInput(snap.startTime)
    .duration(duration)
    .outputOptions([
      '-c copy',
      '-movflags frag_keyframe+empty_moov',
      '-f mp4',
    ])
    .on('error', (err) => {
      console.error('FFmpeg clip error:', err.message);
      if (!res.headersSent) res.status(500).json({ message: 'FFmpeg processing failed' });
    })
    .pipe(res, { end: true });
};

// Stream snapshot image through backend (avoids CORS/tainted-canvas issues for client-side canvas export)
const proxyImage = async (snapshotId, res) => {
  const snap = await Snapshot.findById(snapshotId).lean();
  if (!snap) throw { statusCode: 404, message: 'Snapshot not found' };
  const key = snap.type === 'photo' ? snap.imageS3Key : snap.thumbnailS3Key;
  if (!key) throw { statusCode: 404, message: 'No image stored for this snapshot' };
  const { Body, ContentType } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  res.setHeader('Content-Type', ContentType || 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=600');
  Body.pipe(res);
};

module.exports = { create, getByDive, remove, enqueueAnalysis, updateNote, getDownloadUrl, streamClipDownload, proxyImage };
