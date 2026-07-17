const { aiSummaryQueue } = require('../../config/queue');
const { generateProjectSummary } = require('./ai.service');
const Project = require('../projects/project.model');
const Trip = require('../trips/trip.model');
const Media = require('../media/media.model');
const SensorData = require('../sensor/sensor.model');
const { zScoreAnomalies } = require('../sensor/sensor.controller');
const notifService = require('../notifications/notification.service');

// Aggregate depth/temp/pressure range + anomaly count across every trip in the project
const getSensorSummary = async (tripIds) => {
  if (!tripIds.length) return { sensorStats: null, anomalyCount: 0 };

  const [agg, raw] = await Promise.all([
    SensorData.aggregate([
      { $match: { trip: { $in: tripIds } } },
      { $group: {
          _id: null,
          count:       { $sum: 1 },
          depthMin:    { $min: '$depth' },    depthMax:    { $max: '$depth' },    depthAvg:    { $avg: '$depth' },
          tempMin:     { $min: '$temp' },     tempMax:     { $max: '$temp' },     tempAvg:     { $avg: '$temp' },
          pressureMin: { $min: '$pressure' }, pressureMax: { $max: '$pressure' }, pressureAvg: { $avg: '$pressure' },
      } },
    ]),
    // Only pull the 3 metrics we score, to keep the in-memory z-score pass cheap
    SensorData.find({ trip: { $in: tripIds } }).select('depth temp pressure').lean(),
  ]);

  const sensorStats = agg[0] || null;
  const anomalyCount = raw.length
    ? ['depth', 'temp', 'pressure'].reduce((sum, m) => sum + zScoreAnomalies(raw, m).length, 0)
    : 0;

  return { sensorStats, anomalyCount };
};

// Errors that should not be retried (quota, auth, config)
const isNonRetryable = (err) => {
  const msg = err.message || '';
  const code = err.status ?? err.statusCode;
  return code === 429 || code === 403 ||
    msg.includes('429') || msg.includes('quota') || msg.includes('API key') ||
    msg.includes('not configured') || msg.includes('not found');
};

aiSummaryQueue.process(async (job) => {
  const { projectId, userId } = job.data;

  const [project, trips, mediaCount] = await Promise.all([
    Project.findById(projectId).populate('rov', 'name model'),
    Trip.find({ project: projectId }),
    Media.countDocuments({ project: projectId, status: 'ready' }),
  ]);

  if (!project) throw new Error(`Project ${projectId} not found`);

  try {
    const { sensorStats, anomalyCount } = await getSensorSummary(trips.map(t => t._id));
    const { vi, en } = await generateProjectSummary(project, trips, mediaCount, sensorStats, anomalyCount);

    await Project.findByIdAndUpdate(projectId, {
      'aiSummary.vi':          vi,
      'aiSummary.en':          en,
      'aiSummary.generatedAt': new Date(),
      'aiSummary.status':      'done',
    });

    notifService.create(
      userId,
      'ai_summary_done',
      `AI summary ready for "${project.name}"`,
      'Click to view the generated summary.',
      `/projects/${projectId}`
    ).catch(() => {});

  } catch (err) {
    console.error('[AI Worker] generateProjectSummary failed:', err.message);
    await Project.findByIdAndUpdate(projectId, { 'aiSummary.status': 'failed' });

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
