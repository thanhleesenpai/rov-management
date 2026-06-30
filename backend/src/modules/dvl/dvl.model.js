const mongoose = require('mongoose');

const dvlDataSchema = new mongoose.Schema({
  trip:       { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
  sourceFile: { type: String, default: null },
  ts:         { type: Number, required: true },  // Unix seconds (float)
  x:      { type: Number, required: true },  // meters East
  y:      { type: Number, required: true },  // meters North
  z:      { type: Number, default: null },   // meters depth
  std:    { type: Number, default: null },   // uncertainty (m)
  roll:   { type: Number, default: null },
  pitch:  { type: Number, default: null },
  yaw:    { type: Number, default: null },
  status: { type: Number, default: 0 },
}, { timestamps: false, versionKey: false });

dvlDataSchema.index({ trip: 1, ts: 1 });
dvlDataSchema.index({ trip: 1, sourceFile: 1, ts: 1 });

module.exports = mongoose.model('DVLData', dvlDataSchema);
