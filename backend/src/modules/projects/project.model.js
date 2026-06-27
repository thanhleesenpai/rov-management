const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  rov: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ROV',
    required: [true, 'ROV is required']
  },
  location: {
    type: String,
    default: ''
  },
  startTime: {
    type: Date,
    default: null
  },
  endTime: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['planned', 'ongoing', 'completed', 'cancelled'],
    default: 'planned'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  aiSummary: {
    vi:          { type: String, default: '' },
    en:          { type: String, default: '' },
    generatedAt: { type: Date, default: null },
    status:      { type: String, enum: ['idle', 'pending', 'done', 'failed'], default: 'idle' },
  },
  gpsLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  locationName: { type: String, default: '' },
}, { timestamps: true });

// Indexes cho các query phổ biến
projectSchema.index({ status: 1, createdAt: -1 });
projectSchema.index({ rov: 1 });
projectSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Project', projectSchema);
