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
    const token = req.headers.authorization?.split(' ')[1];
    await authService.logout(req.user._id, token);
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
    if (req.body.avatar !== undefined) allowed.avatar = req.body.avatar;
    const updated = await User.findByIdAndUpdate(req.user._id, allowed, { new: true }).select('-password -refreshToken');
    return success(res, updated, 'Profile updated successfully');
  } catch (err) {
    next(err);
  }
};

const avatarPresigned = async (req, res, next) => {
  try {
    const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const { v4: uuidv4 } = require('uuid');
    const s3 = require('../../config/s3');

    const { fileName, mimeType } = req.body;
    if (!fileName || !mimeType || !mimeType.startsWith('image/')) {
      return res.status(400).json({ message: 'fileName and image mimeType required' });
    }

    const ext = fileName.split('.').pop();
    const s3Key = `avatars/${req.user._id}/${uuidv4()}.${ext}`;
    const BUCKET = process.env.S3_BUCKET;

    const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, ContentType: mimeType }), { expiresIn: 300 });
    // Presigned GET URL để xem ảnh — 7 ngày
    const viewUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }), { expiresIn: 7 * 24 * 3600 });

    return success(res, { uploadUrl, viewUrl, s3Key });
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

const { generateAccessToken, generateRefreshToken } = require('../../utils/jwt.util');

const googleCallback = async (req, res) => {
  try {
    const user = req.user;
    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    user.lastLoginAt  = new Date();
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const params = new URLSearchParams({ accessToken, refreshToken });
    res.redirect(`${clientUrl}/auth/callback?${params}`);
  } catch (err) {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}/login?error=oauth_failed`);
  }
};

module.exports = { register, login, refresh, logout, me, updateMe, changePassword, googleCallback, avatarPresigned };
