const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 0,  // fail fast khi Redis không có — không retry mãi
  lazyConnect: true,
  enableOfflineQueue: false, // không queue command khi offline
});

redis.on('error', (err) => {
  // Không crash app nếu Redis chưa kết nối được (dev không có Redis)
  if (process.env.NODE_ENV !== 'production') return;
  console.error('Redis error:', err.message);
});

module.exports = redis;
