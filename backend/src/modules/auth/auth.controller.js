const { validationResult } = require('express-validator');
const authService = require('./auth.service');
const { success } = require('../../utils/response.util');

const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }
    const data = await authService.register(req.body);
    return success(res, data, 'Account created successfully', 201);
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }
    const data = await authService.login(req.body);
    return success(res, data, 'Login successful');
  } catch (err) {
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const data = await authService.refresh(req.body.refreshToken);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    await authService.logout(req.user._id);
    return success(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};

const me = (req, res) => {
  return success(res, req.user);
};

const updateMe = async (req, res, next) => {
  try {
    const User = require('../users/user.model');
    const allowed = {};
    if (req.body.fullName) allowed.fullName = req.body.fullName.trim();
    const updated = await User.findByIdAndUpdate(req.user._id, allowed, { new: true }).select('-password -refreshToken');
    return success(res, updated, 'Profile updated successfully');
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }
    await authService.changePassword(req.user._id, req.body);
    return success(res, null, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, refresh, logout, me, updateMe, changePassword };
