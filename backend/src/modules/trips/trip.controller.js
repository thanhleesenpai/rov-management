const tripService = require('./trip.service');
const { success, error } = require('../../utils/response.util');

const getAll = async (req, res, next) => {
  try {
    const result = await tripService.getAll(req.query);
    success(res, result);
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const trip = await tripService.getById(req.params.id);
    if (!trip) return error(res, 'Trip not found', 404);
    success(res, trip);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const trip = await tripService.create({ ...req.body, createdBy: req.user._id });
    success(res, trip, 'Trip created', 201);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const trip = await tripService.update(req.params.id, req.body);
    if (!trip) return error(res, 'Trip not found', 404);
    success(res, trip, 'Trip updated');
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const trip = await tripService.remove(req.params.id);
    if (!trip) return error(res, 'Trip not found', 404);
    success(res, null, 'Trip deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, create, update, remove };
