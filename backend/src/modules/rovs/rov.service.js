const ROV = require('./rov.model');
const Project = require('../projects/project.model');

const getAll = async ({ page = 1, limit = 10, search, status } = {}) => {
  const query = {};
  if (search) {
    query.$or = [
      { name: new RegExp(search, 'i') },
      { model: new RegExp(search, 'i') },
      { serialNumber: new RegExp(search, 'i') }
    ];
  }
  if (status) query.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [rovs, total] = await Promise.all([
    ROV.find(query).skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
    ROV.countDocuments(query)
  ]);

  return { data: rovs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
};

const getById = async (id) => {
  return ROV.findById(id);
};

const create = async (data) => {
  return ROV.create(data);
};

const update = async (id, data) => {
  return ROV.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

const remove = async (id) => {
  const rov = await ROV.findById(id);
  if (!rov) throw { statusCode: 404, message: 'ROV not found' };

  // Check if there are projects using this ROV
  const projectCount = await Project.countDocuments({ rov: id });
  if (projectCount > 0) {
    throw {
      statusCode: 400,
      message: `Cannot delete this ROV. It is being used in ${projectCount} project(s). Please set its status to "Maintenance" or "Retired" instead.`
    };
  }

  // Only delete if no projects are using this ROV
  return ROV.findByIdAndDelete(id);
};

module.exports = { getAll, getById, create, update, remove };
