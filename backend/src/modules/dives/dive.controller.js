const diveService = require('./dive.service');
const { success, error } = require('../../utils/response.util');
const notifService = require('../notifications/notification.service');
const audit = require('../audit/audit.service');

const getAll = async (req, res, next) => {
  try {
    const result = await diveService.getAll(req.query);
    success(res, result);
  } catch (err) {
    next(err);
  }
};

const getAllByTrip = async (req, res, next) => {
  try {
    if (req.params.tripId) {
      const dives = await diveService.getAllByTrip(req.params.tripId);
      success(res, dives);
    } else {
      const result = await diveService.getAll(req.query);
      success(res, result);
    }
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const dive = await diveService.getById(req.params.id);
    if (!dive) return error(res, 'Dive not found', 404);
    success(res, dive);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const dive = await diveService.create({
      ...req.body,
      trip: req.params.tripId,
      createdBy: req.user._id
    });
    audit.log(req.user._id, 'create', 'Dive', dive._id, { name: dive.title });
    success(res, dive, 'Dive created', 201);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const prev = await diveService.getById(req.params.id);
    const dive = await diveService.update(req.params.id, req.body);
    if (!dive) return error(res, 'Dive not found', 404);

    // Notify dive creator when status changes to done/failed
    if (req.body.status && req.body.status !== prev?.status) {
      if (req.body.status === 'done' || req.body.status === 'failed') {
        const recipientId = dive.createdBy?._id || dive.createdBy;
        if (recipientId) {
          const label = req.body.status === 'done' ? 'completed' : 'failed';
          notifService.create(
            recipientId,
            `dive_${req.body.status}`,
            `Dive "${dive.title}" ${label}`,
            `The dive status has changed to ${req.body.status}.`,
            dive.trip ? `/trips/${dive.trip}` : '/dives'
          ).catch(() => {});
        }
      }
    }

    audit.log(req.user._id, 'update', 'Dive', dive._id, { name: dive.title, status: dive.status });
    success(res, dive, 'Dive updated');
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const dive = await diveService.remove(req.params.id);
    if (!dive) return error(res, 'Dive not found', 404);
    audit.log(req.user._id, 'delete', 'Dive', dive._id, { name: dive.title });
    success(res, null, 'Dive deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getAllByTrip, getOne, create, update, remove };
