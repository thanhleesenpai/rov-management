const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { errorHandler } = require('./middleware/error.middleware');
const passport = require('./config/passport');

const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const rovRoutes = require('./modules/rovs/rov.routes');
const tripRoutes = require('./modules/trips/trip.routes');
const diveRoutes = require('./modules/dives/dive.routes');
const mediaRoutes = require('./modules/media/media.routes');
const statsRoutes = require('./modules/stats/stats.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const auditRoutes      = require('./modules/audit/audit.routes');
const snapshotRoutes   = require('./modules/snapshots/snapshot.routes');

// Bull workers
require('./modules/ai/ai.worker');
require('./modules/media/media.worker');
require('./modules/snapshots/snapshot.worker');

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

// Rate limiting — chỉ apply khi production
if (process.env.NODE_ENV === 'production') {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: 'Too many requests, please try again later' }
  });
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
  });
  app.use('/api', generalLimiter);
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);
}

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Passport (Google OAuth — session: false, chỉ dùng JWT)
app.use(passport.initialize());

// Body parsing — 8 MB to accommodate base64 thumbnail images in snapshot payloads
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/rovs', rovRoutes);
app.use('/api/v1/trips', tripRoutes);
app.use('/api/v1/dives', diveRoutes);
app.use('/api/v1/media', mediaRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/audit',     auditRoutes);
app.use('/api/v1/snapshots', snapshotRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// 404
app.use('*', (req, res) => res.status(404).json({ message: 'Route not found' }));

// Error handler (phải để cuối cùng)
app.use(errorHandler);

module.exports = app;
