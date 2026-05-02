const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl = require('./notification.controller');

router.get('/stream', ctrl.stream);
router.get('/', authenticate, ctrl.list);
router.patch('/read-all', authenticate, ctrl.markAllRead);
router.patch('/:id/read', authenticate, ctrl.markRead);

module.exports = router;
