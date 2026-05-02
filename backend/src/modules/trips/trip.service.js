const Trip = require('./trip.model');

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
  const [trips, total] = await Promise.all([
    Trip.find(query)
      .populate('rov', 'name model status')
      .populate('createdBy', 'fullName email')
      .skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
    Trip.countDocuments(query)
  ]);

  return { data: trips, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
};

const getById = async (id) => {
  return Trip.findById(id)
    .populate('rov', 'name model serialNumber status')
    .populate('createdBy', 'fullName email');
};

const create = async (data) => {
  return Trip.create(data);
};

const update = async (id, data) => {
  return Trip.findByIdAndUpdate(id, data, { new: true, runValidators: true })
    .populate('rov', 'name model status')
    .populate('createdBy', 'fullName email');
};

const remove = async (id) => {
  return Trip.findByIdAndDelete(id);
};

module.exports = { getAll, getById, create, update, remove };
