const router = require('express').Router();
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const c = require('./snapshot.controller');

router.use(authenticate);

router.post('/',              authorize('operator', 'admin'), c.create);
router.get('/dive/:diveId',   c.getByDive);
router.delete('/:id',         authorize('operator', 'admin'), c.remove);
router.post('/:id/analyze',   authorize('operator', 'admin'), c.analyze);
router.patch('/:id/note',     authorize('operator', 'admin'), c.updateNote);

module.exports = router;
