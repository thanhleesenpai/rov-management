const router = require('express').Router();
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl = require('./stats.controller');

router.get('/overview', authenticate, ctrl.getOverview);

module.exports = router;
