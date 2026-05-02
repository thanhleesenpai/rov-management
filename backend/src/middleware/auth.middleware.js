const jwt = require('jsonwebtoken');
const User = require('../modules/users/user.model');
const redis = require('../config/redis');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check blacklist (token đã logout) — bỏ qua nếu Redis chưa kết nối
    try {
      const isBlacklisted = await redis.get(`blacklist:${token}`);
      if (isBlacklisted) return res.status(401).json({ message: 'Token has been revoked' });
    } catch { /* Redis unavailable — fail open in dev */ }

    const user = await User.findById(decoded.id).select('-password -refreshToken');

    if (!user) return res.status(401).json({ message: 'User not found' });
    if (!user.isActive) return res.status(403).json({ message: 'Account is disabled' });

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Dùng: authorize('admin') hoặc authorize('admin', 'operator')
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission' });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
