import mongoose from 'mongoose';

const ConditionSchema = new mongoose.Schema({
  field: { type: String, required: true },
  operator: { 
    type: String, 
    enum: [
      'regex', 
      'range', 
      'min', 
      'max', 
      'not_null', 
      'is_null',
      'in_set', 
      'not_in_set', 
      'unique', 
      'email_valid', 
      'phone_valid',
      'date_format',
      'length_between',
      'custom_logic'
    ],
    required: true 
  },
  value: { type: mongoose.Schema.Types.Mixed },
  minValue: { type: Number },
  maxValue: { type: Number },
  pattern: { type: String },
  set: [{ type: mongoose.Schema.Types.Mixed }],
  negate: { type: Boolean, default: false }
}, { _id: false });

const RuleSchema = new mongoose.Schema({
  datasetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', required: true, index: true },
  name: { type: String, required: true },
  naturalLanguageInput: { type: String, required: true },
  description: { type: String, default: '' },
  category: { 
    type: String, 
    enum: ['validity', 'completeness', 'uniqueness', 'consistency', 'range', 'custom'],
    default: 'validity' 
  },
  severity: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'], 
    default: 'medium' 
  },
  structuredRule: {
    logic: { type: String, enum: ['AND', 'OR'], default: 'AND' },
    conditions: [ConditionSchema]
  },
  status: { 
    type: String, 
    enum: ['pending_review', 'active', 'rejected', 'disabled'], 
    default: 'pending_review',
    index: true 
  },
  validationSample: {
    testedRows: { type: Number, default: 0 },
    passRate: { type: Number, default: 100 },
    passedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    flaggedAsUnsafe: { type: Boolean, default: false },
    safetyReason: { type: String, default: '' },
    sampleFailures: [{
      rowNumber: Number,
      recordId: String,
      actualValue: mongoose.Schema.Types.Mixed,
      reason: String
    }],
    validatedAt: { type: Date, default: Date.now }
  },
  executionStats: {
    totalRuns: { type: Number, default: 0 },
    violationsFound: { type: Number, default: 0 },
    lastRunAt: { type: Date }
  }
}, { timestamps: true });

RuleSchema.index({ datasetId: 1, status: 1, createdAt: -1 });

export const Rule = mongoose.models.Rule || mongoose.model('Rule', RuleSchema);
