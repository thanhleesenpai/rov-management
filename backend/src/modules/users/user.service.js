const User = require('./user.model');

const getAllUsers = async ({ page = 1, limit = 10, search, role } = {}) => {
  const query = {};

  if (search) {
    query.$or = [
      { fullName: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') }
    ];
  }
  if (role) query.role = role;

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

const updateUser = async (id, data) => {
  const allowed = ['fullName', 'role', 'avatar'];
  const updates = Object.fromEntries(
    Object.entries(data).filter(([k]) => allowed.includes(k))
  );
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

module.exports = { getAllUsers, updateUser, toggleStatus };
