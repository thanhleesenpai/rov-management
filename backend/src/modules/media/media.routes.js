const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./media.controller');

router.use(authenticate);

// Lấy presigned URL để upload (operator/admin)
router.post('/presigned-url', authorize('admin', 'operator'), ctrl.getUploadUrl);

// Confirm sau khi upload xong
router.patch('/:id/confirm', authorize('admin', 'operator'), ctrl.confirmUpload);

// Lấy URL xem file
router.get('/:id/url', ctrl.getViewUrl);

// Đổi thứ tự (operator/admin)
router.patch('/reorder', authorize('admin', 'operator'), ctrl.reorder);

// Chuyển sang job khác (operator/admin)
router.patch('/:id/move', authorize('admin', 'operator'), ctrl.moveMedia);

// Xóa nhiều media (admin)
router.delete('/bulk', authorize('admin'), ctrl.bulkDelete);

// Xóa media (admin)
router.delete('/:id', authorize('admin'), ctrl.remove);

// Media theo job
router.get('/job/:jobId', ctrl.getByJob);

// Media theo trip
router.get('/trip/:tripId', ctrl.getByTrip);

module.exports = router;
