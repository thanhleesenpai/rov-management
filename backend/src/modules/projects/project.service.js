const Project = require('./project.model');
const Trip = require('../trips/trip.model');
const { reverseGeocode, parseCoordString } = require('../../utils/geocode.util');

// If location string looks like "lat, lng", auto-geocode and fill gpsLocation + locationName.
async function enrichLocation(data) {
  if (!data.location) return data;
  const coords = parseCoordString(data.location);
  if (!coords) return data; // plain text, keep as-is
  const name = await reverseGeocode(coords.lat, coords.lng);
  return {
    ...data,
    gpsLocation: coords,
    locationName: name || data.location,
    location: name || data.location, // replace raw coords with readable name
  };
}

const getAll = async (params = {}) => {
  const { page = 1, limit = 10, search, status, rovId, fromDate, toDate } = params
  const query = {};
  if (search) {
    query.$or = [
      { name: new RegExp(search, 'i') },
      { location: new RegExp(search, 'i') }
    ];
  }
  if (status) query.status = status;
  if (rovId) query.rov = rovId;
  if (fromDate || toDate) {
    query.startTime = {};
    if (fromDate) query.startTime.$gte = new Date(fromDate);
    if (toDate)   query.startTime.$lte = new Date(toDate + 'T23:59:59');
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [projects, total] = await Promise.all([
    Project.find(query)
      .populate('rov', 'name model status')
      .populate('createdBy', 'fullName email')
      .skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
    Project.countDocuments(query)
  ]);

  return { data: projects, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
};

const getById = async (id) => {
  return Project.findById(id)
    .populate('rov', 'name model serialNumber status')
    .populate('createdBy', 'fullName email');
};

const create = async (data) => {
  return Project.create(await enrichLocation(data));
};

const update = async (id, data) => {
  const enriched = await enrichLocation(data);
  return Project.findByIdAndUpdate(id, enriched, { new: true, runValidators: true })
    .populate('rov', 'name model status')
    .populate('createdBy', 'fullName email');
};

const remove = async (id) => {
  const project = await Project.findById(id);
  if (!project) throw { statusCode: 404, message: 'Project not found' };

  // Use tripService.remove() per trip to cascade-delete all related data (sensor/dvl/sonar/media/snapshots + S3)
  const tripService = require('../trips/trip.service');
  const trips = await Trip.find({ project: id }).select('_id').lean();
  await Promise.all(trips.map(d => tripService.remove(d._id)));

  await Project.findByIdAndDelete(id);
  return { projectDeleted: true, tripsDeleted: trips.length };
};

module.exports = { getAll, getById, create, update, remove };
