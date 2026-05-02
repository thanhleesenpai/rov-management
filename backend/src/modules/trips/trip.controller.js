const tripService = require('./trip.service');
const { success, error } = require('../../utils/response.util');
const notifService = require('../notifications/notification.service');

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
    const prev = await tripService.getById(req.params.id);
    const trip = await tripService.update(req.params.id, req.body);
    if (!trip) return error(res, 'Trip not found', 404);

    // Notify trip creator khi status chuyển sang completed
    if (req.body.status === 'completed' && prev?.status !== 'completed') {
      const recipientId = trip.createdBy?._id || trip.createdBy;
      if (recipientId) {
        notifService.create(
          recipientId,
          'trip_completed',
          `Trip "${trip.name}" completed`,
          'The trip has been marked as completed.',
          `/trips/${trip._id}`
        ).catch(() => {});
      }
    }

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
