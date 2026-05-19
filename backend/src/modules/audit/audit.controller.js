const auditService = require('./audit.service');
const { success } = require('../../utils/response.util');

const getAll = async (req, res, next) => {
  try {
    const result = await auditService.getAll(req.query);
    return success(res, result);
  } catch (err) { next(err); }
};

module.exports = { getAll };
