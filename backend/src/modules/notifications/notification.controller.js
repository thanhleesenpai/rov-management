const notifService = require('./notification.service');
const { success } = require('../../utils/response.util');

const jwt = require('jsonwebtoken');
const User = require('../users/user.model');

const stream = async (req, res) => {
  // EventSource không gửi được Authorization header — đọc token từ query param
  if (!req.user) {
    const token = req.query.token;
    if (!token) return res.status(401).end();
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password -refreshToken');
      if (!user || !user.isActive) return res.status(401).end();
      req.user = user;
    } catch {
      return res.status(401).end();
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Gửi ping ngay để client biết kết nối thành công
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  const userId = req.user._id.toString();
  notifService.registerSSE(userId, res);

  // Keepalive ping mỗi 30s để tránh proxy timeout
  const keepalive = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepalive);
    notifService.unregisterSSE(userId);
  });
};

const list = async (req, res, next) => {
  try {
    const { limit, unreadOnly } = req.query;
    const [notifications, unreadCount] = await Promise.all([
      notifService.getForUser(req.user._id, { limit, unreadOnly: unreadOnly === 'true' }),
      notifService.countUnread(req.user._id),
    ]);
    return success(res, { notifications, unreadCount });
  } catch (err) { next(err); }
};

const markRead = async (req, res, next) => {
  try {
    const notif = await notifService.markRead(req.params.id, req.user._id);
    if (!notif) return res.status(404).json({ message: 'Notification not found' });
    return success(res, notif);
  } catch (err) { next(err); }
};

const markAllRead = async (req, res, next) => {
  try {
    await notifService.markAllRead(req.user._id);
    return success(res, null, 'All notifications marked as read');
  } catch (err) { next(err); }
};

module.exports = { stream, list, markRead, markAllRead };
