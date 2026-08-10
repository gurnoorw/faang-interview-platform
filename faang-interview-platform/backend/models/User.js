/**
 * models/User.js — User schema with subscription state
 *
 * Subscription states:
 *   'none'    — never subscribed
 *   'active'  — paid, within billing period
 *   'expired' — paid previously but period ended
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  /* ── Identity ──────────────────────────────────────── */
  name:  { type: String, required: true, trim: true, maxlength: 80 },
  email: {
    type: String, required: true, unique: true,
    lowercase: true, trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
  },
  passwordHash: { type: String, required: true },

  /* ── Subscription ──────────────────────────────────── */
  subscription: {
    status:    { type: String, enum: ['none','active','expired'], default: 'none' },
    startDate: { type: Date },
    endDate:   { type: Date },   // subscription valid until this date
    // Razorpay IDs for reference / refunds
    razorpayOrderId:   { type: String },
    razorpayPaymentId: { type: String },
  },

  /* ── Usage tracking ────────────────────────────────── */
  interviews: {
    total:    { type: Number, default: 0 },
    thisMonth:{ type: Number, default: 0 },
    lastReset:{ type: Date, default: Date.now },  // when thisMonth was last zeroed
  },

  /* ── Meta ──────────────────────────────────────────── */
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
}, { timestamps: true });

/* ── Instance methods ──────────────────────────────────────────────── */

/** Check if subscription is currently active */
userSchema.methods.isSubscribed = function () {
  return (
    this.subscription.status === 'active' &&
    this.subscription.endDate &&
    new Date() < this.subscription.endDate
  );
};

/** Compare plain password against stored hash */
userSchema.methods.verifyPassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/* ── Pre-save hook: hash password ──────────────────────────────────── */
userSchema.pre('save', async function (next) {
  // Only hash if password was modified
  if (!this.isModified('passwordHash')) return next();
  // passwordHash field receives the plain password temporarily; we hash it here
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

module.exports = mongoose.model('User', userSchema);
