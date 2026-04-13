const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./trip.controller');
const jobRoutes = require('../jobs/job.routes');

router.use(authenticate);

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.post('/', authorize('admin', 'operator'), ctrl.create);
router.patch('/:id', authorize('admin', 'operator'), ctrl.update);
router.delete('/:id', authorize('admin'), ctrl.remove);

// Nested: /api/v1/trips/:tripId/jobs
router.use('/:tripId/jobs', jobRoutes);

module.exports = router;
