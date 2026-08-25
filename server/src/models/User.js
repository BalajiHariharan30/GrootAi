/**
 * @module User
 * @description Mongoose schema (with in-memory fallback) for GrootAi users
 * supporting both Email/Password authentication and Google OAuth 2.0.
 *
 * Role hierarchy:
 *   viewer  → read-only: can see datasets, profiles, issues
 *   steward → can propose fixes, dismiss issues
 *   admin   → can activate rules, approve/reject remediations
 */
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    /** Google OAuth subject identifier (optional for email/password users) */
    googleId: {
      type:     String,
      sparse:   true,
      index:    true,
      default:  null,
    },
    email: {
      type:      String,
      required:  true,
      unique:    true,
      lowercase: true,
      trim:      true,
      index:     true,
    },
    /** Hashed password (for email/password users) */
    password: {
      type:      String,
      default:   null,
    },
    name: {
      type:     String,
      required: true,
      trim:     true,
    },
    /** Profile photo URL */
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

export const User = mongoose.models.User || mongoose.model('User', userSchema);
