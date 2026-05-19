const { aiSummaryQueue } = require('../../config/queue');
const { generateTripSummary } = require('./ai.service');
const Trip = require('../trips/trip.model');
const Dive = require('../dives/dive.model');
const Media = require('../media/media.model');
const notifService = require('../notifications/notification.service');

// Errors that should not be retried (quota, auth, config)
const isNonRetryable = (err) => {
  const msg = err.message || '';
  const code = err.status ?? err.statusCode;
  return code === 429 || code === 403 ||
    msg.includes('429') || msg.includes('quota') || msg.includes('API key') ||
    msg.includes('not configured') || msg.includes('not found');
};

aiSummaryQueue.process(async (job) => {
  const { tripId, userId } = job.data;

  const [trip, dives, mediaCount] = await Promise.all([
    Trip.findById(tripId).populate('rov', 'name model'),
    Dive.find({ trip: tripId }),
    Media.countDocuments({ trip: tripId, status: 'ready' }),
  ]);

  if (!trip) throw new Error(`Trip ${tripId} not found`);

  try {
    const { vi, en } = await generateTripSummary(trip, dives, mediaCount);

    await Trip.findByIdAndUpdate(tripId, {
      'aiSummary.vi':          vi,
      'aiSummary.en':          en,
      'aiSummary.generatedAt': new Date(),
      'aiSummary.status':      'done',
    });

    notifService.create(
      userId,
      'ai_summary_done',
      `AI summary ready for "${trip.name}"`,
      'Click to view the generated summary.',
      `/trips/${tripId}`
    ).catch(() => {});

  } catch (err) {
    console.error('[AI Worker] generateTripSummary failed:', err.message);
    await Trip.findByIdAndUpdate(tripId, { 'aiSummary.status': 'failed' });

    // Non-retryable errors: mark done so Bull doesn't waste retry attempts
    if (isNonRetryable(err)) {
      const nonRetryErr = new Error(err.message);
      nonRetryErr.noRetry = true;
      throw nonRetryErr;
    }
    throw err;
  }
});

console.log('[Worker] ai-summary queue ready');
