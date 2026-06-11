const mongoose = require('mongoose');

const sonarFileSchema = new mongoose.Schema({
  dive:          { type: mongoose.Schema.Types.ObjectId, ref: 'Dive', required: true },
  filename:      { type: String, required: true },
  s3Key:         { type: String, required: true },
  frameCount:    { type: Number, default: 0 },
  durationMs:    { type: Number, default: 0 },
  fileSizeBytes: { type: Number, default: 0 },
  recordedAt:    { type: Date, default: null },
}, { timestamps: true, versionKey: false });

sonarFileSchema.index({ dive: 1 });

module.exports = mongoose.model('SonarFile', sonarFileSchema);
