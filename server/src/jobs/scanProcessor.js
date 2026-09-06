/**
 * @module scanProcessor
 * @description BullMQ job processors for CPU/IO-heavy workloads.
 *
 * processScanJob  - full DQ scan: profile + rule violations + dedup + remediation proposals
 * processUploadJob - large CSV ingest: parse + profile + bulk DB insert
 *
 * Both functions receive a BullMQ Job object with:
 *   job.data       - the payload
 *   job.updateProgress(0-100) - incremental progress for SSE / polling
 */

import { ProfilerService }   from "../services/profiler.service.js";
import { RuleEngineService } from "../services/ruleEngine.service.js";
import { MatcherService }    from "../services/matcher.service.js";
import { RemediationService } from "../services/remediation.service.js";
import { Dataset }           from "../models/Dataset.js";
import { Record }            from "../models/Record.js";
import { Rule }              from "../models/Rule.js";
import { Issue }             from "../models/Issue.js";
import { RemediationAction } from "../models/RemediationAction.js";
import { store }             from "../data/inMemoryStore.js";
import { cache }             from "../cache/redisClient.js";
import { getDBStatus }       from "../config/db.js";
import logger                from "../config/logger.js";
import { Readable }          from "stream";
import csvParser             from "csv-parser";

// How many remediation proposals to auto-generate per scan (capped to control Gemini cost)
const MAX_AUTO_PROPOSALS = 10;
// Chunk size for batched Record.insertMany on large uploads
const INSERT_CHUNK_SIZE  = 500;

// ── Helper: batch-insert with chunking ───────────────────────────────────────
async function chunkedInsert(Model, docs, chunkSize = INSERT_CHUNK_SIZE) {
  for (let i = 0; i < docs.length; i += chunkSize) {
    await Model.insertMany(docs.slice(i, i + chunkSize), { ordered: false });
  }
}

// ── Processor 1: DQ Scan ─────────────────────────────────────────────────────
export async function processScanJob(job) {
  const { datasetId } = job.data;
  await job.updateProgress(5);

  let dataset, records, rules;
  if (getDBStatus()) {
    dataset = await Dataset.findById(datasetId);
    records = await Record.find({ datasetId }).lean();
    rules   = await Rule.find({ datasetId, status: "active" }).lean();
  } else {
    dataset = store.datasets.find((d) => String(d._id) === String(datasetId));
    records = store.records.filter((r) => String(r.datasetId) === String(datasetId));
    rules   = store.rules.filter((r) => String(r.datasetId) === String(datasetId) && r.status === "active");
  }

  if (!dataset) throw new Error(`Dataset ${datasetId} not found`);

  await job.updateProgress(15);

  // Step 1: Re-profile
  const newProfile = ProfilerService.profileRecords(records);
  await job.updateProgress(30);

  // Step 2: Rule violations
  const allViolations = [];
  for (const rule of rules) {
    allViolations.push(...RuleEngineService.runRuleOnDataset(rule, records));
  }
  await job.updateProgress(50);

  // Step 3: Deduplication scan
  const duplicateIssues = MatcherService.scanDatasetForDuplicates(datasetId, records);
  const combinedIssues  = [...allViolations, ...duplicateIssues];
  await job.updateProgress(65);

  // Step 4: Persist issues
  if (getDBStatus()) {
    await Issue.deleteMany({ datasetId, status: { $in: ["open", "in_review"] } });
    if (combinedIssues.length > 0) {
      const inserted = await Issue.insertMany(combinedIssues);

      // Step 5: Auto-generate up to MAX_AUTO_PROPOSALS remediation proposals
      // Uses Promise.all with concurrency limit of 3 to avoid Gemini rate-limit
      const batch = inserted.slice(0, MAX_AUTO_PROPOSALS);
      const CONCURRENCY = 3;
      for (let i = 0; i < batch.length; i += CONCURRENCY) {
        const slice = batch.slice(i, i + CONCURRENCY);
        await Promise.all(
          slice.map(async (iss) => {
            try {
              const rec      = records.find((r) => String(r._id) === String(iss.recordId));
              const proposal = await RemediationService.proposeFix(iss, rec ?? { data: { [iss.field]: iss.currentValue } });
              await RemediationAction.create(proposal);
            } catch (e) {
              logger.warn({ event: "auto_proposal_fail", issueId: String(iss._id), error: e.message });
            }
          })
        );
        await job.updateProgress(65 + Math.round(((i + CONCURRENCY) / batch.length) * 25));
      }
    }

    // Step 6: Update dataset metadata
    const drift = ProfilerService.diffProfiles(dataset.profile, newProfile);
    dataset.qualityScore = newProfile.qualityScore;
    dataset.dimensions   = newProfile.dimensions;
    dataset.profile = {
      columns:    newProfile.columns,
      profiledAt: new Date(),
      version:    (dataset.profile?.version || 1) + 1,
      history:    [
        ...(dataset.profile?.history || []),
        { version: (dataset.profile?.version || 1) + 1, profiledAt: new Date(), qualityScore: newProfile.qualityScore, rowCount: records.length, driftSummary: drift.summary },
      ],
    };
    await dataset.save();
  } else {
    // In-memory path
    store.issues = store.issues.filter((i) => String(i.datasetId) !== String(datasetId) || !["open", "in_review"].includes(i.status));
    for (const iss of combinedIssues) { iss._id = store.generateId(); iss.createdAt = new Date(); store.issues.push(iss); }
    for (const iss of combinedIssues.slice(0, MAX_AUTO_PROPOSALS)) {
      try {
        const rec      = records.find((r) => String(r._id) === String(iss.recordId));
        const proposal = await RemediationService.proposeFix(iss, rec ?? { data: { [iss.field]: iss.currentValue } });
        proposal._id   = store.generateId();
        if (!store.remediations) store.remediations = [];
        store.remediations.push(proposal);
      } catch (e) {
        logger.warn({ event: "auto_proposal_fail_mem", error: e.message });
      }
    }
    dataset.qualityScore = newProfile.qualityScore;
    dataset.dimensions   = newProfile.dimensions;
    dataset.profile = { columns: newProfile.columns, profiledAt: new Date(), version: (dataset.profile?.version || 1) + 1, history: [] };
  }

  await cache.del(`profile:${datasetId}`);
  await cache.delPattern(`records:${datasetId}:*`);
  await job.updateProgress(100);

  logger.info({ event: "scan_job_complete", datasetId, issues: combinedIssues.length });

  return {
    issuesFound:  combinedIssues.length,
    violations:   allViolations.length,
    duplicates:   duplicateIssues.length,
    qualityScore: newProfile.qualityScore,
  };
}

// ── Processor 2: CSV Upload ───────────────────────────────────────────────────
export async function processUploadJob(job) {
  const { csvContent, datasetName, description, datasetId } = job.data;
  await job.updateProgress(5);

  const MAX_CSV_ROWS = 100_000;
  const results = [];

  await new Promise((resolve, reject) => {
    let rowCount = 0;
    Readable.from(csvContent)
      .pipe(csvParser({ strict: false, skipComments: true }))
      .on("data", (data) => { rowCount++; if (rowCount <= MAX_CSV_ROWS) results.push(data); })
      .on("end", resolve)
      .on("error", (e) => reject(new Error(`CSV parse error: ${e.message}`)));
  });

  await job.updateProgress(30);

  const rawRecords = results.map((row, idx) => ({
    datasetId,
    rowNumber: idx + 1,
    data:      row,
    hasIssues: false,
    issueCount: 0,
    version:   1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const profile = ProfilerService.profileRecords(rawRecords.map((r) => ({ _id: r.datasetId + r.rowNumber, data: r.data })));
  await job.updateProgress(55);

  if (getDBStatus()) {
    await chunkedInsert(Record, rawRecords.map((r) => ({ ...r, datasetId })));
  } else {
    const withIds = rawRecords.map((r) => ({ ...r, _id: store.generateId() }));
    store.records.push(...withIds);
  }

  await job.updateProgress(85);

  if (getDBStatus()) {
    await Dataset.findByIdAndUpdate(datasetId, {
      status:      "ready",
      rowCount:    rawRecords.length,
      qualityScore: profile.qualityScore,
      dimensions:  profile.dimensions,
      profile: {
        columns:    profile.columns,
        profiledAt: new Date(),
        version:    1,
        history:    [{ version: 1, profiledAt: new Date(), qualityScore: profile.qualityScore, rowCount: rawRecords.length, driftSummary: "Initial CSV ingest" }],
      },
    });
  }

  await job.updateProgress(100);
  logger.info({ event: "upload_job_complete", datasetId, rows: rawRecords.length });

  return { rows: rawRecords.length, columns: profile.columns.length, qualityScore: profile.qualityScore };
}
