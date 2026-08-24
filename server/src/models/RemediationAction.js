import mongoose from 'mongoose';

const RemediationActionSchema = new mongoose.Schema({
  issueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true, index: true },
  datasetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', required: true, index: true },
  recordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Record', index: true },
  rowNumber: { type: Number },
  targetField: { type: String },
  strategy: { 
    type: String, 
    enum: ['format_standardize', 'impute_default', 'merge_records', 'trim_sanitize', 'domain_fix', 'custom_patch'],
    default: 'format_standardize'
  },
  proposedFix: {
    beforeValue: { type: mongoose.Schema.Types.Mixed },
    afterValue: { type: mongoose.Schema.Types.Mixed },
    diffDetails: { type: String },
    mergedRecordPayload: { type: mongoose.Schema.Types.Mixed }
  },
  agentReasoning: { type: String, required: true },
  confidence: { type: Number, default: 0.95 },
  status: { 
    type: String, 
    enum: ['proposed', 'approved', 'rejected', 'applied', 'rolled_back'], 
    default: 'proposed',
    index: true 
  },
  approvedBy: { type: String, default: 'Human Data Steward' },
  rejectionReason: { type: String },
  appliedAt: { type: Date },
  auditLog: [{
    action: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    actor: { type: String, default: 'System Agent' },
    details: { type: String }
  }]
}, { timestamps: true });

RemediationActionSchema.index({ datasetId: 1, status: 1, createdAt: -1 });

export const RemediationAction = mongoose.models.RemediationAction || mongoose.model('RemediationAction', RemediationActionSchema);
