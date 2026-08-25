import mongoose from 'mongoose';

/**
 * FeedbackLog — Immutable record of every human decision on an AI proposal.
 * Drives the continuous learning calibration map used by AIClient.
 */
const FeedbackLogSchema = new mongoose.Schema({
  remediationId: { type: mongoose.Schema.Types.ObjectId, ref: 'RemediationAction', index: true },
  datasetId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', index: true },
  issueType:     { type: String, required: true, index: true },
  strategy:      { type: String, required: true, index: true },
  targetField:   { type: String },
  outcome:       {
    type: String,
    enum: ['approved', 'rejected', 'rolled_back'],
    required: true,
    index: true,
  },
  actorName:     { type: String, default: 'Human Data Steward' },
  confidence:    { type: Number }, // AI's confidence at time of proposal
  notes:         { type: String },
}, { timestamps: true });

FeedbackLogSchema.index({ issueType: 1, strategy: 1, createdAt: -1 });

export const FeedbackLog = mongoose.models.FeedbackLog
  || mongoose.model('FeedbackLog', FeedbackLogSchema);
