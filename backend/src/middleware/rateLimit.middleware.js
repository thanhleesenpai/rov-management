const rateLimit = require('express-rate-limit');

// 20 requests / 15 phút cho các auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

module.exports = { authLimiter };
