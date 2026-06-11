const auditService = require('./audit.service');
const { success } = require('../../utils/response.util');

const { freshenAvatar } = require('../../utils/avatar.util');

const getAll = async (req, res, next) => {
  try {
    const result = await auditService.getAll(req.query);
    const data = await Promise.all(result.data.map(async log => {
      const obj = log.toObject ? log.toObject() : log;
      if (obj.userId && obj.userId.avatar) {
        obj.userId.avatar = await freshenAvatar(obj.userId.avatar);
      }
      return obj;
    }));
    return success(res, { ...result, data });
  } catch (err) { next(err); }
};

module.exports = { getAll };
