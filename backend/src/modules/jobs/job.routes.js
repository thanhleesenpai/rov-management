const express = require('express');
const router = express.Router({ mergeParams: true });
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./job.controller');

router.use(authenticate);

// /api/v1/trips/:tripId/jobs
router.get('/', ctrl.getAllByTrip);
router.post('/', authorize('admin', 'operator'), ctrl.create);

// /api/v1/jobs/:id
router.get('/:id', ctrl.getOne);
router.patch('/:id', authorize('admin', 'operator'), ctrl.update);
router.delete('/:id', authorize('admin'), ctrl.remove);

module.exports = router;
