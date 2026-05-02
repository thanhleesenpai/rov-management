const Notification = require('./notification.model');

// SSE connections: Map<userId(string), res>
const sseClients = new Map();

const registerSSE = (userId, res) => {
  sseClients.set(userId, res);
};

const unregisterSSE = (userId) => {
  sseClients.delete(userId);
};

const pushSSE = (userId, data) => {
  const client = sseClients.get(userId.toString());
  if (client) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
};

/**
 * Tạo notification + push SSE nếu user đang online
 */
const create = async (userId, type, title, body = '', link = '') => {
  const notification = await Notification.create({ userId, type, title, body, link });
  pushSSE(userId, { type: 'notification', data: notification });
  return notification;
};

const getForUser = async (userId, { limit = 20, unreadOnly = false } = {}) => {
  const query = { userId };
  if (unreadOnly) query.isRead = false;
  return Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(Number(limit));
};

const countUnread = async (userId) => {
  return Notification.countDocuments({ userId, isRead: false });
};

const markRead = async (id, userId) => {
  return Notification.findOneAndUpdate(
    { _id: id, userId },
    { isRead: true },
    { new: true }
  );
};

const markAllRead = async (userId) => {
  return Notification.updateMany({ userId, isRead: false }, { isRead: true });
};

module.exports = { create, getForUser, countUnread, markRead, markAllRead, registerSSE, unregisterSSE };
