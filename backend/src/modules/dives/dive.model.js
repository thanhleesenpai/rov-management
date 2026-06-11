const mongoose = require('mongoose');

const diveSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Dive title is required'],
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  trip: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: [true, 'Trip is required']
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

module.exports = mongoose.model('Dive', diveSchema);
