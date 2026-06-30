const tripService = require('./trip.service');
const { success, error } = require('../../utils/response.util');
const notifService = require('../notifications/notification.service');
const audit = require('../audit/audit.service');

const getAll = async (req, res, next) => {
  try {
    const result = await tripService.getAll(req.query);
    success(res, result);
  } catch (err) {
    next(err);
  }
};

const getAllByProject = async (req, res, next) => {
  try {
    if (req.params.projectId) {
      const trips = await tripService.getAllByProject(req.params.projectId);
      success(res, trips);
    } else {
      const result = await tripService.getAll(req.query);
      success(res, result);
    }
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
    const Project = require('../projects/project.model');
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return error(res, 'Project not found', 404);

    const trip = await tripService.create({
      ...req.body,
      project: req.params.projectId,
      createdBy: req.user._id
    });
    audit.log(req.user._id, 'create', 'Trip', trip._id, { name: trip.title });
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

    // Notify trip creator when status changes to done/failed
    if (req.body.status && req.body.status !== prev?.status) {
      if (req.body.status === 'done' || req.body.status === 'failed') {
        const recipientId = trip.createdBy?._id || trip.createdBy;
        if (recipientId) {
          const label = req.body.status === 'done' ? 'completed' : 'failed';
          notifService.create(
            recipientId,
            `trip_${req.body.status}`,
            `Trip "${trip.title}" ${label}`,
            `The trip status has changed to ${req.body.status}.`,
            trip.project ? `/projects/${trip.project}` : '/trips'
          ).catch(() => {});
        }
      }
    }

    audit.log(req.user._id, 'update', 'Trip', trip._id, { name: trip.title, status: trip.status });
    success(res, trip, 'Trip updated');
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const trip = await tripService.remove(req.params.id);
    if (!trip) return error(res, 'Trip not found', 404);
    audit.log(req.user._id, 'delete', 'Trip', trip._id, { name: trip.title });
    success(res, null, 'Trip deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getAllByProject, getOne, create, update, remove };
