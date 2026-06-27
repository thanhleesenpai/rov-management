const router = require('express').Router();
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const c = require('./snapshot.controller');

router.use(authenticate);

router.post('/',              authorize('operator', 'admin'), c.create);
router.get('/trip/:tripId',   c.getByTrip);
router.delete('/bulk',        authorize('operator', 'admin'), c.bulkDelete);
router.delete('/:id',         authorize('operator', 'admin'), c.remove);
router.post('/:id/analyze',   authorize('operator', 'admin'), c.analyze);
router.post('/:id/analyze/cancel', authorize('operator', 'admin'), c.cancelAnalyze);
router.patch('/:id/note',          authorize('operator', 'admin'), c.updateNote);
router.get('/:id/download-url',    c.getDownloadUrl);
router.get('/:id/download-clip',   c.downloadClip);
router.get('/:id/image-raw',       c.proxyImage);
router.get('/:id/frame-at',        c.frameAt);

module.exports = router;
