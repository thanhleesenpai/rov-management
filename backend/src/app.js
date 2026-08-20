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
const projectRoutes = require('./modules/projects/project.routes');
const tripRoutes = require('./modules/trips/trip.routes');
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

// Tin tưởng Proxy Nginx để lấy đúng IP thật khi chạy đằng sau Reverse Proxy
if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet());

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(url => url.trim());

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error('CORS blocked: ' + origin), false);
  },
  credentials: true
}));

// Rate limiting — chỉ apply khi production
if (process.env.NODE_ENV === 'production') {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { message: 'Too many requests, please try again later' }
  });
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000
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
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/trips', tripRoutes);
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
