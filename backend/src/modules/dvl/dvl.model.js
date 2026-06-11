const mongoose = require('mongoose');

const dvlDataSchema = new mongoose.Schema({
  dive:   { type: mongoose.Schema.Types.ObjectId, ref: 'Dive', required: true },
  ts:     { type: Number, required: true },  // Unix seconds (float)
  x:      { type: Number, required: true },  // meters East
  y:      { type: Number, required: true },  // meters North
  z:      { type: Number, default: null },   // meters depth
  std:    { type: Number, default: null },   // uncertainty (m)
  roll:   { type: Number, default: null },
  pitch:  { type: Number, default: null },
  yaw:    { type: Number, default: null },
  status: { type: Number, default: 0 },
}, { timestamps: false, versionKey: false });

dvlDataSchema.index({ dive: 1, ts: 1 });

module.exports = mongoose.model('DVLData', dvlDataSchema);
