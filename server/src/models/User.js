import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { USER_ROLES, USER_STATUSES } from './constants.js';
import { environment } from '../config/env.js';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: { type: String, select: false },
    role: { type: String, required: true, enum: Object.values(USER_ROLES) },
    status: { type: String, required: true, enum: Object.values(USER_STATUSES), default: USER_STATUSES.ACTIVE },
    phone: { type: String, trim: true, maxlength: 40 },
    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date },
    // Bumped on password change / logout-all to invalidate all previously
    // issued access and refresh tokens (compared against the JWT `tv` claim).
    tokenVersion: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, status: 1 });

userSchema.virtual('displayName').get(function getDisplayName() {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.set('toJSON', { virtuals: true });

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.hashPassword = async function hashPassword(password) {
  this.passwordHash = await bcrypt.hash(password, environment.auth.bcryptRounds);
};

userSchema.virtual('isLocked').get(function isLocked() {
  return Boolean(this.lockedUntil && this.lockedUntil > Date.now());
});

export const User = mongoose.model('User', userSchema);