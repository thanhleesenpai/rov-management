const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:    { type: String, required: true },
  title:   { type: String, required: true },
  body:    { type: String, default: '' },
  link:    { type: String, default: '' },
  isRead:  { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
