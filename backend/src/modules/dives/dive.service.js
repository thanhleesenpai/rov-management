const Dive = require('./dive.model');

const getAll = async ({ page = 1, limit = 10, search, status, tripId, fromDate, toDate } = {}) => {
  const query = {};
  if (search) query.title = new RegExp(search, 'i');
  if (status) query.status = status;
  if (tripId) query.trip = tripId;
  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate)   query.createdAt.$lte = new Date(toDate + 'T23:59:59');
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [dives, total] = await Promise.all([
    Dive.find(query)
      .populate('trip', 'name status')
      .populate('createdBy', 'fullName email')
      .skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
    Dive.countDocuments(query)
  ]);

  return { data: dives, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
};

// Used for TripDetailPage — no pagination needed (scoped to one trip)
const getAllByTrip = async (tripId) => {
  return Dive.find({ trip: tripId })
    .populate('createdBy', 'fullName email')
    .sort({ createdAt: -1 });
};

const getById = async (id) => {
  return Dive.findById(id)
    .populate('trip', 'name status')
    .populate('createdBy', 'fullName email');
};

const create = async (data) => {
  return Dive.create(data);
};

const update = async (id, data) => {
  return Dive.findByIdAndUpdate(id, data, { new: true, runValidators: true })
    .populate('createdBy', 'fullName email');
};

const remove = async (id) => {
  return Dive.findByIdAndDelete(id);
};

module.exports = { getAll, getAllByTrip, getById, create, update, remove };
