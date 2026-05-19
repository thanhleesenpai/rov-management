const AuditLog = require('./audit.model');

const log = (userId, action, entity, entityId = null, details = {}) => {
  if (!userId) return;
  // Fire-and-forget — không block request
  AuditLog.create({ userId, action, entity, entityId, details }).catch(
    (err) => console.error('[Audit] Failed to log:', err.message)
  );
};

const getAll = async ({ page = 1, limit = 20, entity, userId } = {}) => {
  const query = {};
  if (entity) query.entity = entity;
  if (userId) query.userId = userId;

  const skip = (Number(page) - 1) * Number(limit);
  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .populate('userId', 'fullName email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    AuditLog.countDocuments(query),
  ]);

  return { data: logs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
};

module.exports = { log, getAll };
