const userService = require('./user.service');
const { success } = require('../../utils/response.util');
const notifService = require('../notifications/notification.service');
const audit = require('../audit/audit.service');

const { freshenAvatar } = require('../../utils/avatar.util');

const getAllUsers = async (req, res, next) => {
  try {
    const data = await userService.getAllUsers(req.query);
    const users = await Promise.all(data.users.map(async u => {
      const obj = u.toObject();
      obj.avatar = await freshenAvatar(obj.avatar);
      return obj;
    }));
    return success(res, { ...data, users });
  } catch (err) {
    next(err);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const data = await userService.updateUser(req.params.id, req.body, req.user._id);
    if (req.body.role) audit.log(req.user._id, 'change_role', 'User', data._id, { role: req.body.role, email: data.email });
    return success(res, data, 'User updated successfully');
  } catch (err) {
    next(err);
  }
};

const toggleStatus = async (req, res, next) => {
  try {
    const data = await userService.toggleStatus(req.params.id, req.user._id);
    audit.log(req.user._id, data.isActive ? 'activate' : 'disable', 'User', data._id, { email: data.email });
    return success(res, data, `Account ${data.isActive ? 'activated' : 'disabled'} successfully`);
  } catch (err) {
    next(err);
  }
};

const bulkStatus = async (req, res, next) => {
  try {
    const { ids, isActive } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || typeof isActive !== 'boolean')
      return res.status(400).json({ message: 'ids (array) and isActive (boolean) required' });
    const count = await userService.bulkSetStatus(ids, isActive, req.user._id);

    // Notify mỗi user bị disable
    if (!isActive) {
      ids.forEach(userId => {
        notifService.create(
          userId,
          'account_disabled',
          'Your account has been disabled',
          'An administrator has disabled your account. Please contact support.',
          '/profile'
        ).catch(() => {});
      });
    }

    audit.log(req.user._id, isActive ? 'bulk_activate' : 'bulk_disable', 'User', null, { count, ids });
    return success(res, { updated: count }, `${count} user(s) ${isActive ? 'activated' : 'disabled'}`);
  } catch (err) { next(err); }
};

const bulkRole = async (req, res, next) => {
  try {
    const { ids, role } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !['viewer','operator','admin'].includes(role))
      return res.status(400).json({ message: 'ids (array) and valid role required' });
    const count = await userService.bulkSetRole(ids, role, req.user._id);
    audit.log(req.user._id, 'bulk_change_role', 'User', null, { count, role, ids });
    return success(res, { updated: count }, `${count} user(s) updated to ${role}`);
  } catch (err) { next(err); }
};

module.exports = { getAllUsers, updateUser, toggleStatus, bulkStatus, bulkRole };
