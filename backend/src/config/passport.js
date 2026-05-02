const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const User = require('../modules/users/user.model');

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('[passport] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google OAuth disabled');
  module.exports = passport;
  return;
}

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(null, false, { message: 'No email from Google' });

    let user = await User.findOne({ email });

    if (user) {
      // Tài khoản email đã tồn tại — gắn googleId nếu chưa có
      if (!user.googleId) {
        user.googleId = profile.id;
        user.authProvider = 'google';
        if (!user.avatar && profile.photos?.[0]?.value) {
          user.avatar = profile.photos[0].value;
        }
        await user.save();
      }
    } else {
      // Tạo user mới từ Google
      user = await User.create({
        email,
        fullName: profile.displayName || email.split('@')[0],
        googleId: profile.id,
        authProvider: 'google',
        avatar: profile.photos?.[0]?.value || null,
        role: 'viewer',
      });
    }

    if (!user.isActive) return done(null, false, { message: 'Account has been disabled' });

    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

module.exports = passport;
