import mongoose from 'mongoose';
import { encryptPIIFields, decryptPIIFields } from '../utils/fieldEncryption.js';

const RecordSchema = new mongoose.Schema({
  datasetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', required: true, index: true },
  rowNumber: { type: Number, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  hasIssues: { type: Boolean, default: false, index: true },
  issueCount: { type: Number, default: 0 },
  version: { type: Number, default: 1 }
}, { timestamps: true });

RecordSchema.index({ datasetId: 1, _id: 1 });
RecordSchema.index({ datasetId: 1, hasIssues: 1, _id: 1 });
RecordSchema.index({ datasetId: 1, rowNumber: 1 });

// Encrypt PII fields at rest before persisting to MongoDB
RecordSchema.pre('save', function () {
  if (this.isModified('data') && this.data) {
    this.data = encryptPIIFields(this.data);
  }
});

// Decrypt PII fields transparently after retrieval
RecordSchema.post('find', function (docs) {
  docs.forEach(doc => { if (doc.data) doc.data = decryptPIIFields(doc.data); });
});
RecordSchema.post('findOne', function (doc) {
  if (doc?.data) doc.data = decryptPIIFields(doc.data);
});

export const Record = mongoose.models.Record || mongoose.model('Record', RecordSchema);
