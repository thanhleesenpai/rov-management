const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

router.use(authenticate);
router.use(authorize('admin'));

router.get('/', userController.getAllUsers);
router.patch('/bulk/status', userController.bulkStatus);
router.patch('/bulk/role', userController.bulkRole);
router.patch('/:id', userController.updateUser);
router.patch('/:id/status', userController.toggleStatus);

module.exports = router;
