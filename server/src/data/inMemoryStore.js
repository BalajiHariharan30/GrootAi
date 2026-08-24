import { sampleEnterpriseDatasets } from './seedDatasets.js';
import { ProfilerService } from '../services/profiler.service.js';

class InMemoryStore {
  constructor() {
    this.datasets = [];
    this.records = [];
    this.rules = [];
    this.issues = [];
    this.remediations = [];
    this.idCounter = 1000;
    this.initDefaultSeed();
  }

  generateId() {
    return 'ds_' + (++this.idCounter) + '_' + Math.random().toString(36).substr(2, 6);
  }

  initDefaultSeed() {
    this.datasets = [];
    this.records = [];
    this.rules = [];
    this.issues = [];
    this.remediations = [];

    sampleEnterpriseDatasets.forEach(d => {
      const datasetId = this.generateId();
      const rawRecords = d.records.map((rec, idx) => ({
        _id: this.generateId(),
        datasetId,
        rowNumber: idx + 1,
        data: rec,
        hasIssues: false,
        issueCount: 0,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const profile = ProfilerService.profileRecords(rawRecords);

      const dataset = {
        _id: datasetId,
        name: d.name,
        description: d.description,
        sourceType: d.sourceType,
        status: 'ready',
        rowCount: rawRecords.length,
        qualityScore: profile.qualityScore,
        dimensions: profile.dimensions,
        profile: {
          columns: profile.columns,
          profiledAt: new Date(),
          version: 1,
          history: [{
            version: 1,
            profiledAt: new Date(),
            qualityScore: profile.qualityScore,
            rowCount: rawRecords.length,
            driftSummary: 'Initial profiling baseline'
          }]
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.datasets.push(dataset);
      this.records.push(...rawRecords);
    });
  }
}

export const store = new InMemoryStore();
