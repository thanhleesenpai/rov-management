const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./media.controller');

router.use(authenticate);

// Danh sách model YOLO available (operator/admin)
router.get('/models', authorize('admin', 'operator'), ctrl.getModels);

// Lấy presigned URL để upload (operator/admin)
router.post('/presigned-url', authorize('admin', 'operator'), ctrl.getUploadUrl);

// Confirm sau khi upload xong
router.patch('/:id/confirm', authorize('admin', 'operator'), ctrl.confirmUpload);

// Lấy URL xem file
router.get('/:id/url', ctrl.getViewUrl);

// Đổi thứ tự (operator/admin)
router.patch('/reorder', authorize('admin', 'operator'), ctrl.reorder);

// Chuyển sang trip khác (operator/admin)
router.patch('/:id/move', authorize('admin', 'operator'), ctrl.moveMedia);

// Xóa nhiều media (admin)
router.delete('/bulk', authorize('admin'), ctrl.bulkDelete);

// Trigger (re-)analysis với model + confidence tuỳ chọn (operator/admin)
router.post('/:id/analyze', authorize('admin', 'operator'), ctrl.analyze);
router.post('/:id/analyze/cancel', authorize('admin', 'operator'), ctrl.cancelAnalyze);

// Cập nhật metadata (operator/admin) — phải đặt SAU các route /:id/... cụ thể
router.patch('/:id', authorize('admin', 'operator'), ctrl.update);

// Xóa media (admin)
router.delete('/:id', authorize('admin'), ctrl.remove);

// Media theo trip
router.get('/trip/:tripId', ctrl.getByTrip);

// Media theo project
router.get('/project/:projectId', ctrl.getByProject);

module.exports = router;
