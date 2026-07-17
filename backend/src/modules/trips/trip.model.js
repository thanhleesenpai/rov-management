const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Trip title is required'],
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'Project is required']
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'done', 'failed'],
    default: 'pending'
  },
  sensorCount: { type: Number, default: 0 },
  dvlCount:    { type: Number, default: 0 },
  sonarCount:  { type: Number, default: 0 },
  gpsLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  locationName: { type: String, default: '' },
  // sourceFile → precise recordedAt derived from trip.json manifest (session start + asset.start_ms).
  // Populated during batch upload; used as the preferred timestamp source over filename parsing
  // wherever a manifest was provided (see batch.controller.js, dvl.controller.js getPath()).
  // Plain object, not Mongoose Map: Map casting breaks on keys containing "."
  // (every real filename has an extension), so Mixed is used and read/written as a plain object.
  manifestTimestamps: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined,
  },
  gcsData: {
    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

// Indexes cho các query phổ biến
tripSchema.index({ project: 1, createdAt: -1 });
tripSchema.index({ status: 1 });
tripSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Trip', tripSchema);
