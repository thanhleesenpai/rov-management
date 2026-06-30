const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./trip.controller');
const sensorCtrl = require('../sensor/sensor.controller');
const dvlCtrl = require('../dvl/dvl.controller');
const sonarCtrl = require('../sonar/sonar.controller');
const batchCtrl = require('./batch.controller');

const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

router.use(authenticate);

// /api/v1/projects/:projectId/trips
router.get('/', ctrl.getAllByProject);
router.post('/', authorize('admin', 'operator'), ctrl.create);

// /api/v1/trips/:id
router.get('/:id', ctrl.getOne);
router.patch('/:id', authorize('admin', 'operator'), ctrl.update);
router.delete('/:id', authorize('admin'), ctrl.remove);

// Sensor data
router.get('/:id/sensor-data', sensorCtrl.getSensorData);
router.post('/:id/sensor-data/upload', authorize('admin', 'operator'), sensorCtrl.upload);
router.delete('/:id/sensor-data',      authorize('admin', 'operator'), sensorCtrl.clear);

// Aggregated data-file list (sensor + dvl + sonar in one call)
router.get('/:id/data-files', sensorCtrl.getDataFiles);

// DVL data
router.get('/:id/dvl',                                                   dvlCtrl.getPath);
router.post('/:id/dvl/upload', authorize('admin', 'operator'), memUpload.single('file'), dvlCtrl.upload);
router.delete('/:id/dvl',      authorize('admin', 'operator'),           dvlCtrl.clear);

// Sonar files
router.get('/:id/sonar',                                                        sonarCtrl.list);
router.post('/:id/sonar/upload', authorize('admin', 'operator'), memUpload.single('file'), sonarCtrl.upload);
router.get('/:id/sonar/:sonarId/url',                                           sonarCtrl.getUrl);
router.delete('/:id/sonar/:sonarId',  authorize('admin', 'operator'),           sonarCtrl.remove);

// Batch upload (folder or ZIP)
router.post('/:id/data/upload-batch', authorize('admin', 'operator'), memUpload.any(), batchCtrl.uploadBatch);

module.exports = router;
