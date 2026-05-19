const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action:   { type: String, required: true },
  entity:   { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  details:  { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

auditSchema.index({ createdAt: -1 });
auditSchema.index({ entity: 1, createdAt: -1 });
auditSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditSchema);
