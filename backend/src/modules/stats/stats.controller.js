const Trip = require('../trips/trip.model');
const Dive = require('../dives/dive.model');
const ROV = require('../rovs/rov.model');
const Media = require('../media/media.model');
const { success } = require('../../utils/response.util');

const getOverview = async (req, res, next) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [tripByStatus, diveByStatus, rovByStatus, tripsPerMonth, divesPerMonth, rovUtilization, mediaPerMonth] = await Promise.all([
      Trip.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Dive.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      ROV.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

      // Trips per month (6 tháng)
      Trip.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      // Dives per month (6 tháng)
      Dive.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      // ROV utilization — số trip mỗi ROV
      Trip.aggregate([
        { $group: { _id: '$rov', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
        { $lookup: { from: 'rovs', localField: '_id', foreignField: '_id', as: 'rov' } },
        { $unwind: { path: '$rov', preserveNullAndEmptyArrays: true } },
        { $project: { name: { $ifNull: ['$rov.name', 'Unknown'] }, count: 1 } }
      ]),

      // Media uploaded per month (6 tháng)
      Media.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo }, status: 'ready' } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
    ]);

    // Build 6-month labels
    const monthLabels = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthLabels.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: d.toLocaleString('default', { month: 'short', year: '2-digit' })
      });
    }

    // Merge timelines
    const activityTimeline = monthLabels.map(({ year, month, label }) => {
      const key = `${year}-${month}`
      return {
        name: label,
        trips: (tripsPerMonth.find(r => `${r._id.year}-${r._id.month}` === key)?.count) || 0,
        dives: (divesPerMonth.find(r => `${r._id.year}-${r._id.month}` === key)?.count) || 0,
        media: (mediaPerMonth.find(r => `${r._id.year}-${r._id.month}` === key)?.count) || 0,
      }
    });

    const toMap = (arr) => Object.fromEntries(arr.map(({ _id, count }) => [_id, count]));

    return success(res, {
      tripByStatus:   toMap(tripByStatus),
      diveByStatus:   toMap(diveByStatus),
      rovByStatus:    toMap(rovByStatus),
      activityTimeline,
      rovUtilization: rovUtilization.map(r => ({ name: r.name, trips: r.count })),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getOverview };
