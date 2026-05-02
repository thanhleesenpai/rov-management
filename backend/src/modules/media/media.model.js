const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  trip: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // File info
  originalName: { type: String, required: true },
  s3Key: { type: String, required: true, unique: true },  // path trong S3
  s3Bucket: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },  // bytes

  // Phân loại
  type: {
    type: String,
    enum: ['image', 'video', 'document', 'other'],
    required: true
  },

  // Metadata sau khi xử lý (Bull queue điền vào)
  meta: {
    duration: Number,      // video: giây
    width: Number,         // ảnh/video: px
    height: Number,
    thumbnailKey: String,  // S3 key của thumbnail
  },

  status: {
    type: String,
    enum: ['pending', 'ready', 'failed'],
    default: 'pending'
  },

  order: { type: Number, default: 0 },
  description: String,
}, { timestamps: true });

mediaSchema.index({ job: 1, createdAt: -1 });
mediaSchema.index({ trip: 1, createdAt: -1 });

module.exports = mongoose.model('Media', mediaSchema);
