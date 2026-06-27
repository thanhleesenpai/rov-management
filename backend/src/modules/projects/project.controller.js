const projectService = require('./project.service');
const Project = require('./project.model');
const { success, error } = require('../../utils/response.util');
const notifService = require('../notifications/notification.service');
const { aiSummaryQueue } = require('../../config/queue');
const audit = require('../audit/audit.service');

const getAll = async (req, res, next) => {
  try {
    const result = await projectService.getAll(req.query);
    success(res, result);
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const project = await projectService.getById(req.params.id);
    if (!project) return error(res, 'Project not found', 404);
    success(res, project);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const project = await projectService.create({ ...req.body, createdBy: req.user._id });
    audit.log(req.user._id, 'create', 'Project', project._id, { name: project.name });
    success(res, project, 'Project created', 201);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const prev = await projectService.getById(req.params.id);
    const project = await projectService.update(req.params.id, req.body);
    if (!project) return error(res, 'Project not found', 404);

    // Notify project creator khi status chuyển sang completed
    if (req.body.status === 'completed' && prev?.status !== 'completed') {
      const recipientId = project.createdBy?._id || project.createdBy;
      if (recipientId) {
        notifService.create(
          recipientId,
          'project_completed',
          `Project "${project.name}" completed`,
          'The project has been marked as completed.',
          `/projects/${project._id}`
        ).catch(() => {});
      }
    }

    audit.log(req.user._id, 'update', 'Project', project._id, { name: project.name, status: project.status });
    success(res, project, 'Project updated');
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const project = await projectService.remove(req.params.id);
    if (!project) return error(res, 'Project not found', 404);
    audit.log(req.user._id, 'delete', 'Project', project._id, { name: project.name });
    success(res, null, 'Project deleted');
  } catch (err) {
    next(err);
  }
};

const generateAISummary = async (req, res, next) => {
  try {
    const project = await projectService.getById(req.params.id);
    if (!project) return error(res, 'Project not found', 404);
    if (project.status !== 'completed') return error(res, 'Project must be completed to generate summary', 400);

    await Project.findByIdAndUpdate(req.params.id, { 'aiSummary.status': 'pending' });

    await aiSummaryQueue.add({ projectId: req.params.id, userId: req.user._id.toString() });
    audit.log(req.user._id, 'generate_summary', 'Project', req.params.id, { name: project.name });

    return res.status(202).json({ success: true, message: 'Summary generation started' });
  } catch (err) { next(err); }
};

module.exports = { getAll, getOne, create, update, remove, generateAISummary };
