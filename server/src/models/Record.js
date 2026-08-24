import mongoose from 'mongoose';

const RecordSchema = new mongoose.Schema({
  datasetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', required: true, index: true },
  rowNumber: { type: Number, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true }, // Key-value object for raw data row
  hasIssues: { type: Boolean, default: false, index: true },
  issueCount: { type: Number, default: 0 },
  version: { type: Number, default: 1 }
}, { timestamps: true });

// Compound index for high-scale cursor pagination and fast dataset filtering
RecordSchema.index({ datasetId: 1, _id: 1 });
RecordSchema.index({ datasetId: 1, hasIssues: 1, _id: 1 });
RecordSchema.index({ datasetId: 1, rowNumber: 1 });

export const Record = mongoose.models.Record || mongoose.model('Record', RecordSchema);
