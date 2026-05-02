const jobService = require('./job.service');
const { success, error } = require('../../utils/response.util');
const notifService = require('../notifications/notification.service');

const getAll = async (req, res, next) => {
  try {
    const result = await jobService.getAll(req.query);
    success(res, result);
  } catch (err) {
    next(err);
  }
};

const getAllByTrip = async (req, res, next) => {
  try {
    if (req.params.tripId) {
      const jobs = await jobService.getAllByTrip(req.params.tripId);
      success(res, jobs);
    } else {
      const result = await jobService.getAll(req.query);
      success(res, result);
    }
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const job = await jobService.getById(req.params.id);
    if (!job) return error(res, 'Job not found', 404);
    success(res, job);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const job = await jobService.create({
      ...req.body,
      trip: req.params.tripId,
      createdBy: req.user._id
    });
    success(res, job, 'Job created', 201);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const prev = await jobService.getById(req.params.id);
    const job = await jobService.update(req.params.id, req.body);
    if (!job) return error(res, 'Job not found', 404);

    // Notify job creator khi status chuyển sang done/failed
    if (req.body.status && req.body.status !== prev?.status) {
      if (req.body.status === 'done' || req.body.status === 'failed') {
        const recipientId = job.createdBy?._id || job.createdBy;
        if (recipientId) {
          const label = req.body.status === 'done' ? 'completed' : 'failed';
          notifService.create(
            recipientId,
            `job_${req.body.status}`,
            `Job "${job.title}" ${label}`,
            `The job status has changed to ${req.body.status}.`,
            job.trip ? `/trips/${job.trip}` : '/jobs'
          ).catch(() => {});
        }
      }
    }

    success(res, job, 'Job updated');
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const job = await jobService.remove(req.params.id);
    if (!job) return error(res, 'Job not found', 404);
    success(res, null, 'Job deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getAllByTrip, getOne, create, update, remove };
