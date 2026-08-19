const express = require('express');
const router = express.Router();
const passport = require('../../config/passport');
const authController = require('./auth.controller');
const { registerValidation, loginValidation, changePasswordValidation } = require('./auth.validation');
const { authenticate } = require('../../middleware/auth.middleware');
const { authLimiter } = require('../../middleware/rateLimit.middleware');
const { encodeOAuthState, decodeOAuthState } = require('../../utils/oauthState.util');

router.post('/register', authLimiter, registerValidation, authController.register);
router.post('/login', authLimiter, loginValidation, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, authController.updateMe);
router.patch('/change-password', authenticate, authLimiter, changePasswordValidation, authController.changePassword);

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

  // nonce round-trips through Google's `state` param back to the frontend, which
  // verifies it against the value it stored before redirecting here (see oauthNonce.js) —
  // stops an attacker from handing a victim a crafted /auth/callback link (login CSRF).
  const nonce = typeof req.query.nonce === 'string' ? req.query.nonce.slice(0, 128) : '';
  const state = encodeOAuthState(clientUrl, nonce);

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state
  })(req, res, next);
});
router.get('/google/callback',
  (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user, info) => {
      const { clientUrl } = decodeOAuthState(req.query.state);
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
