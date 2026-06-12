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
router.get('/google', (req, res, next) => {
  let clientUrl = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0] : 'http://localhost:5173';
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  
  if (origin && origin.startsWith('http')) {
    clientUrl = origin;
  } else if (referer && referer.startsWith('http')) {
    const url = new URL(referer);
    clientUrl = `${url.protocol}//${url.host}`;
  }

  passport.authenticate('google', { 
    scope: ['profile', 'email'], 
    session: false,
    state: Buffer.from(clientUrl).toString('base64')
  })(req, res, next);
});
router.get('/google/callback',
  (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user, info) => {
      let clientUrl = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0] : 'http://localhost:5173';
      if (req.query.state) {
        try { clientUrl = Buffer.from(req.query.state, 'base64').toString('ascii'); } catch (e) {}
      }
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
