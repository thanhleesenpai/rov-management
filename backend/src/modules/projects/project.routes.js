const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./project.controller');
const tripRoutes = require('../trips/trip.routes');

router.use(authenticate);

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.post('/', authorize('admin', 'operator'), ctrl.create);
router.patch('/:id', authorize('admin', 'operator'), ctrl.update);
router.delete('/:id', authorize('admin'), ctrl.remove);
router.post('/:id/ai-summary', authorize('admin', 'operator'), ctrl.generateAISummary);

// Nested: /api/v1/projects/:projectId/trips
router.use('/:projectId/trips', tripRoutes);

module.exports = router;
