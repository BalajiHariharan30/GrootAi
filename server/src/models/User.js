/**
 * @module User
 * @description Mongoose schema (with in-memory fallback) for Google OAuth users.
 *
 * Role hierarchy:
 *   viewer  → read-only: can see datasets, profiles, issues
 *   steward → can propose fixes, dismiss issues
 *   admin   → can activate rules, approve/reject remediations
 */
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    /** Google OAuth subject identifier — unique per Google account */
    googleId: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },
    email: {
      type:      String,
      required:  true,
      lowercase: true,
      trim:      true,
    },
    name: {
      type:     String,
      required: true,
      trim:     true,
    },
    /** Google profile photo URL */
    avatar: {
      type:    String,
      default: null,
    },
    /**
     * Role-based access:
     *  viewer  → read-only
     *  steward → read + propose/dismiss
     *  admin   → full control including approve mutations
     */
    role: {
      type:    String,
      enum:    ['viewer', 'steward', 'admin'],
      default: 'steward',
    },
    lastLoginAt: {
      type:    Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const User = mongoose.model('User', userSchema);
