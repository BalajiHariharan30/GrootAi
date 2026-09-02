import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, sparse: true, index: true, default: null },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    /** Hashed password — select:false ensures it is NEVER returned in API responses */
    password: { type: String, default: null, select: false },
    name:     { type: String, required: true, trim: true },
    avatar:   { type: String, default: null },
    role: {
      type:    String,
      enum:    ['viewer', 'steward', 'admin'],
      default: 'steward',
      index:   true,
    },
    lastLoginAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false },
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
