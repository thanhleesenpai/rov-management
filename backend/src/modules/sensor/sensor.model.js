const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  trip:       { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
  sourceFile: { type: String, default: null },
  timestamp:  { type: Date,   required: true },
  depth:      { type: Number, required: true },
  temp:      { type: Number, default: null },
  pressure:  { type: Number, default: null },
  yaw:             { type: Number, default: null },
  pitch:           { type: Number, default: null },
  roll:            { type: Number, default: null },
  temperature:     { type: Number, default: null },  // ambient/electronics temp (GCS Temperature column)
  voltage:         { type: Number, default: null },
  battery_percent: { type: Number, default: null },
  humidity:        { type: Number, default: null },
  // GCS discrete/control fields
  holdDepth:   { type: Number, default: null },  // 0/1 boolean
  holdHeading: { type: Number, default: null },  // 0/1 boolean
  manual:      { type: Number, default: null },  // 0/1 (GCS "Manual"/"Auto")
  cameraTilt:  { type: Number, default: null },
  lightLevel:  { type: Number, default: null },
  powerLevel:  { type: Number, default: null },
});

sensorSchema.index({ trip: 1, timestamp: -1 });
sensorSchema.index({ trip: 1, sourceFile: 1, timestamp: 1 });

module.exports = mongoose.model('SensorData', sensorSchema);
