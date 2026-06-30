const mongoose = require('mongoose');

const snapshotSchema = new mongoose.Schema({
  type:          { type: String, enum: ['photo', 'clip'], required: true },
  trip:          { type: mongoose.Schema.Types.ObjectId, ref: 'Trip',  required: true },
  project:          { type: mongoose.Schema.Types.ObjectId, ref: 'Project',  required: true },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  parentMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', required: true },

  // Photo: captured frame PNG
  imageS3Key: { type: String, default: null },
  imageTime:  { type: Number, default: null }, // seconds in video

  // Clip: time range reference into parent video
  startTime:      { type: Number, default: null }, // seconds
  endTime:        { type: Number, default: null },
  thumbnailS3Key: { type: String, default: null }, // frame at startTime

  // YOLO analysis results
  aiLabels: [{
    name:       { type: String },
    confidence: { type: Number },
    frameTime:  { type: Number, default: null },
    trackId:    { type: Number, default: null },
    bbox: { x1: Number, y1: Number, x2: Number, y2: Number },
  }],
  analysisStatus: {
    type:    String,
    enum:    ['idle', 'pending', 'done', 'failed'],
    default: 'idle',
  },
  analysisMeta: {
    model:      { type: String },
    confidence: { type: Number },
    analyzedAt: { type: Date },
  },

  note: { type: String, default: '' },
}, { timestamps: true });

snapshotSchema.index({ trip: 1, createdAt: -1 });

module.exports = mongoose.model('Snapshot', snapshotSchema);
