import mongoose from 'mongoose';

const ColumnProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  inferredType: { 
    type: String, 
    enum: ['string', 'integer', 'float', 'email', 'phone', 'date', 'boolean', 'category', 'mixed', 'id'],
    default: 'string'
  },
  nullPercent: { type: Number, default: 0 },
  nullCount: { type: Number, default: 0 },
  cardinality: { type: Number, default: 0 },
  distinctCount: { type: Number, default: 0 },
  sampleValues: [{ type: mongoose.Schema.Types.Mixed }],
  stats: {
    min: { type: mongoose.Schema.Types.Mixed },
    max: { type: mongoose.Schema.Types.Mixed },
    avg: { type: Number },
    topValues: [{ value: mongoose.Schema.Types.Mixed, count: Number }],
    patternExamples: [String]
  }
}, { _id: false });

const DatasetSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  sourceType: { type: String, enum: ['csv', 'mongodb', 'demo'], default: 'demo' },
  status: { type: String, enum: ['ready', 'profiling', 'scanning', 'error'], default: 'ready' },
  rowCount: { type: Number, default: 0 },
  qualityScore: { type: Number, default: 100 }, // Overall data health score 0 - 100
  dimensions: {
    completeness: { type: Number, default: 100 },
    validity: { type: Number, default: 100 },
    uniqueness: { type: Number, default: 100 },
    consistency: { type: Number, default: 100 },
  },
  profile: {
    columns: [ColumnProfileSchema],
    profiledAt: { type: Date, default: Date.now },
    version: { type: Number, default: 1 },
    history: [{
      version: Number,
      profiledAt: Date,
      qualityScore: Number,
      rowCount: Number,
      driftSummary: String
    }]
  }
}, { timestamps: true });

DatasetSchema.index({ createdAt: -1 });

export const Dataset = mongoose.models.Dataset || mongoose.model('Dataset', DatasetSchema);
