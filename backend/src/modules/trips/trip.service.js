const Trip       = require('./trip.model');
const SensorData = require('../sensor/sensor.model');
const DVLData    = require('../dvl/dvl.model');
const SonarFile  = require('../sonar/sonar.model');
const Media      = require('../media/media.model');
const Snapshot   = require('../snapshots/snapshot.model');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../../config/s3');

const BUCKET = process.env.S3_BUCKET;

const getAll = async ({ page = 1, limit = 10, search, status, projectId, fromDate, toDate } = {}) => {
  const query = {};
  if (search) query.title = new RegExp(search, 'i');
  if (status) query.status = status;
  if (projectId) query.project = projectId;
  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate)   query.createdAt.$lte = new Date(toDate + 'T23:59:59');
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [trips, total] = await Promise.all([
    Trip.find(query)
      .populate('project', 'name status')
      .populate('createdBy', 'fullName email')
      .skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
    Trip.countDocuments(query)
  ]);

  return { data: trips, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
};

// Used for ProjectDetailPage — no pagination needed (scoped to one project)
const getAllByProject = async (projectId) => {
  return Trip.find({ project: projectId })
    .populate('createdBy', 'fullName email')
    .sort({ createdAt: -1 });
};

const getById = async (id) => {
  return Trip.findById(id)
    .populate('project', 'name status')
    .populate('createdBy', 'fullName email');
};

const create = async (data) => {
  return Trip.create(data);
};

const update = async (id, data) => {
  return Trip.findByIdAndUpdate(id, data, { new: true, runValidators: true })
    .populate('createdBy', 'fullName email');
};

const remove = async (id) => {
  // Collect S3 keys before deleting DB records
  const [sonarFiles, mediaFiles, snapshots] = await Promise.all([
    SonarFile.find({ trip: id }).select('s3Key').lean(),
    Media.find({ trip: id }).select('s3Key meta').lean(),
    Snapshot.find({ trip: id }).select('imageS3Key thumbnailS3Key').lean(),
  ]);

  const s3Keys = [
    ...sonarFiles.map(f => f.s3Key),
    ...mediaFiles.flatMap(m => [m.s3Key, m.meta?.thumbnailKey].filter(Boolean)),
    ...snapshots.flatMap(s => [s.imageS3Key, s.thumbnailS3Key].filter(Boolean)),
  ].filter(Boolean);

  // Delete S3 objects (errors don't block DB cleanup)
  if (s3Keys.length > 0) {
    await Promise.allSettled(
      s3Keys.map(Key => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key })))
    );
  }

  // Cascade delete all related DB records
  await Promise.all([
    SensorData.deleteMany({ trip: id }),
    DVLData.deleteMany({ trip: id }),
    SonarFile.deleteMany({ trip: id }),
    Media.deleteMany({ trip: id }),
    Snapshot.deleteMany({ trip: id }),
  ]);

  return Trip.findByIdAndDelete(id);
};

module.exports = { getAll, getAllByProject, getById, create, update, remove };
