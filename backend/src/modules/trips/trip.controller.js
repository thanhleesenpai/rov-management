const tripService = require('./trip.service');
const Trip = require('./trip.model');
const { success, error } = require('../../utils/response.util');
const notifService = require('../notifications/notification.service');
const { aiSummaryQueue } = require('../../config/queue');
const audit = require('../audit/audit.service');

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
    audit.log(req.user._id, 'create', 'Trip', trip._id, { name: trip.name });
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

    audit.log(req.user._id, 'update', 'Trip', trip._id, { name: trip.name, status: trip.status });
    success(res, trip, 'Trip updated');
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const trip = await tripService.remove(req.params.id);
    if (!trip) return error(res, 'Trip not found', 404);
    audit.log(req.user._id, 'delete', 'Trip', trip._id, { name: trip.name });
    success(res, null, 'Trip deleted');
  } catch (err) {
    next(err);
  }
};

const generateAISummary = async (req, res, next) => {
  try {
    const trip = await tripService.getById(req.params.id);
    if (!trip) return error(res, 'Trip not found', 404);
    if (trip.status !== 'completed') return error(res, 'Trip must be completed to generate summary', 400);

    await Trip.findByIdAndUpdate(req.params.id, { 'aiSummary.status': 'pending' });

    await aiSummaryQueue.add({ tripId: req.params.id, userId: req.user._id.toString() });
    audit.log(req.user._id, 'generate_summary', 'Trip', req.params.id, { name: trip.name });

    return res.status(202).json({ success: true, message: 'Summary generation started' });
  } catch (err) { next(err); }
};

module.exports = { getAll, getOne, create, update, remove, generateAISummary };
