const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./trip.controller');
const diveRoutes = require('../dives/dive.routes');

router.use(authenticate);

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.post('/', authorize('admin', 'operator'), ctrl.create);
router.patch('/:id', authorize('admin', 'operator'), ctrl.update);
router.delete('/:id', authorize('admin'), ctrl.remove);
router.post('/:id/ai-summary', authorize('admin', 'operator'), ctrl.generateAISummary);

// Nested: /api/v1/trips/:tripId/dives
router.use('/:tripId/dives', diveRoutes);

module.exports = router;
