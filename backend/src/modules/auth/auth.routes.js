const express = require('express');
const router = express.Router();
const passport = require('../../config/passport');
const authController = require('./auth.controller');
const { registerValidation, loginValidation, changePasswordValidation } = require('./auth.validation');
const { authenticate } = require('../../middleware/auth.middleware');
const { authLimiter } = require('../../middleware/rateLimit.middleware');

router.post('/register', authLimiter, registerValidation, authController.register);
router.post('/login', authLimiter, loginValidation, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, authController.updateMe);
router.patch('/change-password', authenticate, changePasswordValidation, authController.changePassword);

// Avatar upload presigned URL
router.post('/me/avatar/presigned', authenticate, authController.avatarPresigned);

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get('/google/callback',
  (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user, info) => {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      if (err) return res.redirect(`${clientUrl}/login?error=oauth_failed`);
      if (!user) {
        const error = info?.message === 'Account has been disabled' ? 'account_disabled' : 'oauth_failed';
        return res.redirect(`${clientUrl}/login?error=${error}`);
      }
      req.user = user;
      next();
    })(req, res, next);
  },
  authController.googleCallback
);

module.exports = router;
