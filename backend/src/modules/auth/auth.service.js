const jwt = require('jsonwebtoken');
const User = require('../users/user.model');
const { generateAccessToken, generateRefreshToken } = require('../../utils/jwt.util');

const register = async ({ email, password, fullName }) => {
  const existing = await User.findOne({ email });
  if (existing) throw { statusCode: 400, message: 'Email already in use' };

  const user = await User.create({ email, password, fullName });
  return {
    id: user._id,
    email: user.email,
    fullName: user.fullName,
    role: user.role
  };
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password +refreshToken');

  if (!user) throw { statusCode: 401, message: 'Invalid email or password' };
  if (!user.isActive) throw { statusCode: 403, message: 'Account has been disabled' };

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw { statusCode: 401, message: 'Invalid email or password' };

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = refreshToken;
  user.lastLoginAt = new Date();
  await user.save();

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      avatar: user.avatar
    }
  };
};

const refresh = async (token) => {
  if (!token) throw { statusCode: 401, message: 'Refresh token required' };

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw { statusCode: 401, message: 'Invalid refresh token' };
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== token) {
    throw { statusCode: 401, message: 'Refresh token is invalid or expired' };
  }

  const accessToken = generateAccessToken(user._id);
  return { accessToken };
};

const logout = async (userId) => {
  await User.findByIdAndUpdate(userId, { refreshToken: null });
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password');
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw { statusCode: 400, message: 'Current password is incorrect' };

  user.password = newPassword;
  await user.save();
};

module.exports = { register, login, refresh, logout, changePassword };
