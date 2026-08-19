const User = require('./user.model');
const { escapeRegex } = require('../../utils/query.util');

const getAllUsers = async ({ page = 1, limit = 10, search, role } = {}) => {
  const query = {};

  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    query.$or = [{ fullName: re }, { email: re }];
  }
  if (role) query.role = String(role);

  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(query).skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
    User.countDocuments(query)
  ]);

  return {
    users,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit))
  };
};

const updateUser = async (id, data, requesterId) => {
  const allowed = ['fullName', 'role', 'avatar'];
  const updates = Object.fromEntries(
    Object.entries(data).filter(([k]) => allowed.includes(k))
  );
  if (requesterId && id === requesterId.toString() && updates.role) {
    throw { statusCode: 400, message: 'Cannot change your own role' };
  }
  const user = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  if (!user) throw { statusCode: 404, message: 'User not found' };
  return user;
};

const toggleStatus = async (id, requesterId) => {
  if (id === requesterId.toString()) {
    throw { statusCode: 400, message: 'Cannot disable your own account' };
  }
  const user = await User.findById(id);
  if (!user) throw { statusCode: 404, message: 'User not found' };
  user.isActive = !user.isActive;
  await user.save();
  return user;
};

const bulkSetStatus = async (ids, isActive, requesterId) => {
  const filtered = ids.filter(id => id !== requesterId.toString());
  await User.updateMany({ _id: { $in: filtered } }, { isActive });
  return filtered.length;
};

const bulkSetRole = async (ids, role, requesterId) => {
  const filtered = ids.filter(id => id !== requesterId.toString());
  await User.updateMany({ _id: { $in: filtered } }, { role });
  return filtered.length;
};

module.exports = { getAllUsers, updateUser, toggleStatus, bulkSetStatus, bulkSetRole };
