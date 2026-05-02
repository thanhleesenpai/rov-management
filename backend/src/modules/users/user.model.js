const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    minlength: 6,
    select: false
  },
  googleId: {
    type: String,
    default: null
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  avatar: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ['admin', 'operator', 'viewer'],
    default: 'viewer'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  refreshToken: {
    type: String,
    default: null,
    select: false
  },
  lastLoginAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) throw { statusCode: 400, message: 'This account uses Google login' };
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
