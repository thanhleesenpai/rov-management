const rovService = require('./rov.service');
const { success, error } = require('../../utils/response.util');
const audit = require('../audit/audit.service');

const getAll = async (req, res, next) => {
  try {
    const result = await rovService.getAll(req.query);
    success(res, result);
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const rov = await rovService.getById(req.params.id);
    if (!rov) return error(res, 'ROV not found', 404);
    success(res, rov);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const rov = await rovService.create(req.body);
    audit.log(req.user._id, 'create', 'ROV', rov._id, { name: rov.name });
    success(res, rov, 'ROV created', 201);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const rov = await rovService.update(req.params.id, req.body);
    if (!rov) return error(res, 'ROV not found', 404);
    audit.log(req.user._id, 'update', 'ROV', rov._id, { name: rov.name });
    success(res, rov, 'ROV updated');
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const rov = await rovService.remove(req.params.id);
    if (!rov) return error(res, 'ROV not found', 404);
    audit.log(req.user._id, 'delete', 'ROV', rov._id, { name: rov.name });
    success(res, null, 'ROV deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, create, update, remove };
