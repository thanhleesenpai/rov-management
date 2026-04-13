const mongoose = require('mongoose');

const rovSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'ROV name is required'],
    trim: true
  },
  model: {
    type: String,
    required: [true, 'ROV model is required'],
    trim: true
  },
  serialNumber: {
    type: String,
    required: [true, 'Serial number is required'],
    unique: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'maintenance', 'retired'],
    default: 'active'
  },
  specs: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  notes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('ROV', rovSchema);
