import mongoose from 'mongoose';

const FieldMatchDetailSchema = new mongoose.Schema({
  field: { type: String, required: true },
  valueA: { type: mongoose.Schema.Types.Mixed },
  valueB: { type: mongoose.Schema.Types.Mixed },
  similarityScore: { type: Number, required: true }, // 0.0 - 1.0
  matchType: { type: String, enum: ['exact', 'fuzzy_high', 'fuzzy_medium', 'mismatch'], default: 'exact' },
  explanation: { type: String, required: true }
}, { _id: false });

const IssueSchema = new mongoose.Schema({
  datasetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', required: true, index: true },
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rule' },
  recordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Record', index: true },
  rowNumber: { type: Number },
  type: { 
    type: String, 
    enum: ['violation', 'duplicate', 'anomaly', 'null_defect', 'format_error', 'outlier'],
    required: true,
    index: true
  },
  severity: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'], 
    default: 'medium',
    index: true 
  },
  field: { type: String },
  currentValue: { type: mongoose.Schema.Types.Mixed },
  explanation: { type: String, required: true },
  matchConfidence: { type: Number }, // 0.0 to 1.0 for match/dedup
  matchDetails: {
    recordIdB: { type: mongoose.Schema.Types.ObjectId, ref: 'Record' },
    rowNumberB: { type: Number },
    compositeScore: { type: Number },
    fieldBreakdown: [FieldMatchDetailSchema],
    matchedRecordData: { type: mongoose.Schema.Types.Mixed },
    recommendedSurvivor: { type: String, enum: ['recordA', 'recordB', 'merge'], default: 'merge' }
  },
  status: { 
    type: String, 
    enum: ['open', 'in_review', 'confirmed', 'dismissed', 'remediated', 'auto_resolved'], 
    default: 'open',
    index: true 
  },
  hasRemediationProposal: { type: Boolean, default: false },
  remediationActionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RemediationAction' }
}, { timestamps: true });

// Compound index for hot filter+sort path
IssueSchema.index({ datasetId: 1, status: 1, severity: -1, createdAt: -1 });
IssueSchema.index({ datasetId: 1, type: 1, createdAt: -1 });

export const Issue = mongoose.models.Issue || mongoose.model('Issue', IssueSchema);
