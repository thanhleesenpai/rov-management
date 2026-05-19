const Bull = require('bull');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const createQueue = (name) => new Bull(name, redisUrl, {
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    timeout: 60000, // 60s max per job — tránh treo vô tận khi AI/email API không phản hồi
  },
});

const aiSummaryQueue     = createQueue('ai-summary');
const emailQueue         = createQueue('email');
const mediaAnalysisQueue = new Bull('media-analysis', redisUrl, {
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 1,      // no retry — same video will time out again; retry only useful for ECONNREFUSED
    timeout: 25 * 60 * 1000, // 25 min — covers ~40-min video on slow CPU (download + inference)
  },
});

const snapshotAnalysisQueue = new Bull('snapshot-analysis', redisUrl, {
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail:     100,
    attempts:         1,
    timeout:          5 * 60 * 1000, // 5 min — clip max
  },
});

// Log lỗi queue — không crash app
aiSummaryQueue.on('error',          (err)      => console.error('[Queue:ai-summary] Redis error:', err.message));
aiSummaryQueue.on('failed',         (job, err) => console.error(`[Queue:ai-summary] Job ${job.id} failed:`, err.message));
emailQueue.on('error',              (err)      => console.error('[Queue:email] Redis error:', err.message));
emailQueue.on('failed',             (job, err) => console.error(`[Queue:email] Job ${job.id} failed:`, err.message));
mediaAnalysisQueue.on('error',      (err)      => console.error('[Queue:media-analysis] Redis error:', err.message));
mediaAnalysisQueue.on('failed',     (job, err) => console.error(`[Queue:media-analysis] Job ${job.id} failed:`, err.message));
snapshotAnalysisQueue.on('error',   (err)      => console.error('[Queue:snapshot-analysis] Redis error:', err.message));
snapshotAnalysisQueue.on('failed',  (job, err) => console.error(`[Queue:snapshot-analysis] Job ${job.id} failed:`, err.message));

module.exports = { aiSummaryQueue, emailQueue, mediaAnalysisQueue, snapshotAnalysisQueue };
