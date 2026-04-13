const userService = require('./user.service');
const { success } = require('../../utils/response.util');

const getAllUsers = async (req, res, next) => {
  try {
    const data = await userService.getAllUsers(req.query);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const data = await userService.updateUser(req.params.id, req.body);
    return success(res, data, 'User updated successfully');
  } catch (err) {
    next(err);
  }
};

const toggleStatus = async (req, res, next) => {
  try {
    const data = await userService.toggleStatus(req.params.id, req.user._id);
    return success(res, data, `Account ${data.isActive ? 'activated' : 'disabled'} successfully`);
  } catch (err) {
    next(err);
  }
};

module.exports = { getAllUsers, updateUser, toggleStatus };
