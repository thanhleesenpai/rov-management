const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./dvl.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticate);

// /api/v1/dives/:id/dvl
router.get('/:id/dvl',                                           ctrl.getPath);
router.post('/:id/dvl/upload', authorize('admin', 'operator'), upload.single('file'), ctrl.upload);
router.delete('/:id/dvl',      authorize('admin', 'operator'), ctrl.clear);

module.exports = router;
