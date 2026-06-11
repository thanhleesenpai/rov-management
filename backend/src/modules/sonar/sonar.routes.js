const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./sonar.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

router.use(authenticate);

// /api/v1/dives/:id/sonar
router.get('/:id/sonar',                                                       ctrl.list);
router.post('/:id/sonar/upload',  authorize('admin', 'operator'), upload.single('file'), ctrl.upload);
router.get('/:id/sonar/:sonarId/url',                                          ctrl.getUrl);
router.delete('/:id/sonar/:sonarId', authorize('admin', 'operator'),           ctrl.remove);

module.exports = router;
