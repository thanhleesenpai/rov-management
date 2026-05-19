const express = require('express');
const router = express.Router({ mergeParams: true });
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./dive.controller');
const sensorCtrl = require('../sensor/sensor.controller');

router.use(authenticate);

// /api/v1/trips/:tripId/dives
router.get('/', ctrl.getAllByTrip);
router.post('/', authorize('admin', 'operator'), ctrl.create);

// /api/v1/dives/:id
router.get('/:id', ctrl.getOne);
router.patch('/:id', authorize('admin', 'operator'), ctrl.update);
router.delete('/:id', authorize('admin'), ctrl.remove);

// Sensor data: /api/v1/dives/:id/sensor-data
router.get('/:id/sensor-data', sensorCtrl.getSensorData);
router.post('/:id/sensor-data/upload', authorize('admin', 'operator'), sensorCtrl.upload);
router.delete('/:id/sensor-data', authorize('admin', 'operator'), sensorCtrl.clear);

module.exports = router;
