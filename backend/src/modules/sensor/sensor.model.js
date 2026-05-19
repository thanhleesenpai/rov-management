const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  dive:      { type: mongoose.Schema.Types.ObjectId, ref: 'Dive', required: true },
  timestamp: { type: Date,   required: true },
  depth:     { type: Number, required: true },
  temp:      { type: Number, required: true },
  pressure:  { type: Number, required: true },
  yaw:             { type: Number, default: null },
  pitch:           { type: Number, default: null },
  roll:            { type: Number, default: null },
  voltage:         { type: Number, default: null },
  battery_percent: { type: Number, default: null },
  humidity:        { type: Number, default: null },
});

sensorSchema.index({ dive: 1, timestamp: -1 });

module.exports = mongoose.model('SensorData', sensorSchema);
