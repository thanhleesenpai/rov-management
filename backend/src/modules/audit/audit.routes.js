const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./audit.controller');

router.get('/', authenticate, authorize('admin'), ctrl.getAll);

module.exports = router;
