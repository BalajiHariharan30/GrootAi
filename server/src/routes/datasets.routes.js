/**
 * @module datasets.routes
 * @description Express router for Dataset catalog, profiling, record pagination,
 * DQ scanning, and CSV ingest.
 *
 * Caching strategy:
 *   dataset profile   → Redis 1 h  (key: `profile:{id}`)
 *   record pages      → Redis 5 m  (key: `records:{id}:{cursor}:{limit}:{filters}`)
 *
 * All handlers use `asyncHandler` — no naked try/catch blocks.
 */
import express               from 'express';
import multer                from 'multer';
import csvParser             from 'csv-parser';
import { Readable }          from 'stream';

import { Dataset }           from '../models/Dataset.js';
import { Record }            from '../models/Record.js';
import { Rule }              from '../models/Rule.js';
import { Issue }             from '../models/Issue.js';
import { store }             from '../data/inMemoryStore.js';
import { getDBStatus }       from '../config/db.js';
import { ProfilerService }   from '../services/profiler.service.js';
import { RuleEngineService } from '../services/ruleEngine.service.js';
import { MatcherService }    from '../services/matcher.service.js';
import { cache }             from '../cache/redisClient.js';
import { asyncHandler }      from '../middleware/asyncHandler.js';
import logger                from '../config/logger.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── GET /api/datasets ────────────────────────────────────────────────────
/** Returns all datasets sorted by creation date. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    if (getDBStatus()) {
      const datasets = await Dataset.find().sort({ createdAt: -1 });
      return res.json({ success: true, data: datasets });
    }
    res.json({ success: true, data: store.datasets });
  }),
);

// ── POST /api/datasets/seed ──────────────────────────────────────────────
/** Resets and re-seeds the two default enterprise datasets. */
router.post(
  '/seed',
  asyncHandler(async (_req, res) => {
    store.initDefaultSeed();
    await cache.delPattern('profile:*');
    await cache.delPattern('records:*');

    if (getDBStatus()) {
      await Dataset.deleteMany({});
      await Record.deleteMany({});
      await Rule.deleteMany({});
      await Issue.deleteMany({});

      for (const d of store.datasets) {
        const datasetDoc = await Dataset.create(d);
        const recs       = store.records.filter((r) => r.datasetId === d._id);
        await Record.insertMany(recs.map((r) => ({ ...r, datasetId: datasetDoc._id })));
      }
    }

    logger.info({ event: 'datasets_seeded', count: store.datasets.length });
    res.json({ success: true, message: 'Seeded enterprise datasets', count: store.datasets.length });
  }),
);

// ── GET /api/datasets/:id/profile ───────────────────────────────────────
/** Returns dataset profile with 1-hour Redis cache. */
router.get(
  '/:id/profile',
  asyncHandler(async (req, res) => {
    const { id }   = req.params;
    const cacheKey = `profile:${id}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug({ event: 'profile_cache_hit', datasetId: id });
      return res.json({ success: true, data: cached, fromCache: true });
    }

    let dataset = null;
    let records = [];

    if (getDBStatus()) {
      dataset = await Dataset.findById(id);
      records = await Record.find({ datasetId: id }).limit(200);
    } else {
      dataset = store.datasets.find((d) => String(d._id) === String(id));
      records = store.records.filter((r)  => String(r.datasetId) === String(id));
    }

    if (!dataset) return res.status(404).json({ success: false, error: 'Dataset not found' });

    const responseData = {
      dataset,
      columns:      dataset.profile?.columns || [],
      qualityScore: dataset.qualityScore     || 100,
      dimensions:   dataset.dimensions       || {},
      rowCount:     dataset.rowCount         || records.length,
    };

    await cache.set(cacheKey, responseData, 3_600);
    res.json({ success: true, data: responseData, fromCache: false });
  }),
);

// ── GET /api/datasets/:id/records ───────────────────────────────────────
/**
 * Cursor-paginated records with optional `hasIssues` and `search` filters.
 * Cached 5 minutes per unique cursor + filter combination.
 */
router.get(
  '/:id/records',
  asyncHandler(async (req, res) => {
    const { id }                                   = req.params;
    const { cursor, limit = 25, hasIssues, search } = req.query;
    const pageSize = Math.min(100, parseInt(limit, 10));
    const cacheKey = `records:${id}:${cursor ?? 'start'}:${pageSize}:${hasIssues ?? 'all'}:${search ?? ''}`;

    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    let allRecords = [];

    if (getDBStatus()) {
      const query = { datasetId: id };
      if (hasIssues === 'true') query.hasIssues = true;
      if (cursor)               query._id       = { $gt: cursor };
      allRecords = await Record.find(query).limit(pageSize + 1).sort({ _id: 1 });
    } else {
      let filtered = store.records.filter((r) => String(r.datasetId) === String(id));
      if (hasIssues === 'true') filtered = filtered.filter((r) => r.hasIssues);
      if (search) {
        const q = String(search).toLowerCase();
        filtered = filtered.filter((r) => JSON.stringify(r.data).toLowerCase().includes(q));
      }

      let startIndex = 0;
      if (cursor) {
        const idx = filtered.findIndex((r) => String(r._id) === String(cursor));
        if (idx !== -1) startIndex = idx + 1;
      }
      allRecords = filtered.slice(startIndex, startIndex + pageSize + 1);
    }

    const hasMore    = allRecords.length > pageSize;
    const pageData   = hasMore ? allRecords.slice(0, pageSize) : allRecords;
    const nextCursor = pageData.length > 0 ? String(pageData[pageData.length - 1]._id) : null;

    const response = { success: true, data: pageData, nextCursor, hasMore, pageSize: pageData.length };
    await cache.set(cacheKey, response, 300);
    res.json(response);
  }),
);

// ── POST /api/datasets/:id/scan ──────────────────────────────────────────
/**
 * Full DQ scan: re-profiles dataset, runs active rules, runs deduplication.
 * Returns issue count, quality score delta, and schema drift summary.
 */
router.post(
  '/:id/scan',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    let dataset = null;
    let records = [];
    let rules   = [];

    if (getDBStatus()) {
      dataset = await Dataset.findById(id);
      records = await Record.find({ datasetId: id });
      rules   = await Rule.find({ datasetId: id, status: 'active' });
    } else {
      dataset = store.datasets.find((d) => String(d._id) === String(id));
      records = store.records.filter((r) => String(r.datasetId) === String(id));
      rules   = store.rules.filter((r) =>
        String(r.datasetId) === String(id) && r.status === 'active',
      );
    }

    if (!dataset) return res.status(404).json({ success: false, error: 'Dataset not found' });

    // Step 1: Re-profile
    const newProfile = ProfilerService.profileRecords(records);
    const drift      = ProfilerService.diffProfiles(dataset.profile, newProfile);

    // Step 2: Run active rules
    const allViolations = [];
    for (const rule of rules) {
      const violations = RuleEngineService.runRuleOnDataset(rule, records);
      allViolations.push(...violations);
    }

    // Step 3: Deduplication
    const duplicateIssues = MatcherService.scanDatasetForDuplicates(id, records);
    const combinedIssues  = [...allViolations, ...duplicateIssues];

    // Mark records
    const issueRecordIds = new Set(combinedIssues.map((i) => String(i.recordId)));
    records.forEach((r) => {
      r.hasIssues  = issueRecordIds.has(String(r._id));
      r.issueCount = combinedIssues.filter((i) => String(i.recordId) === String(r._id)).length;
    });

    const newProfileData = {
      columns:     newProfile.columns,
      profiledAt:  new Date(),
      version:     (dataset.profile?.version || 1) + 1,
      history: [
        ...(dataset.profile?.history || []),
        {
          version:      (dataset.profile?.version || 1) + 1,
          profiledAt:   new Date(),
          qualityScore: newProfile.qualityScore,
          rowCount:     records.length,
          driftSummary: drift.summary,
        },
      ],
    };

    if (getDBStatus()) {
      await Issue.deleteMany({ datasetId: id, status: { $in: ['open', 'in_review'] } });
      if (combinedIssues.length > 0) await Issue.insertMany(combinedIssues);
      dataset.qualityScore = newProfile.qualityScore;
      dataset.dimensions   = newProfile.dimensions;
      dataset.profile      = newProfileData;
      await dataset.save();
    } else {
      store.issues = store.issues.filter(
        (i) => String(i.datasetId) !== String(id) || !['open', 'in_review'].includes(i.status),
      );
      combinedIssues.forEach((iss) => {
        iss._id       = store.generateId();
        iss.createdAt = new Date();
        store.issues.push(iss);
      });
      dataset.qualityScore = newProfile.qualityScore;
      dataset.dimensions   = newProfile.dimensions;
      dataset.profile      = newProfileData;
    }

    await cache.del(`profile:${id}`);
    await cache.delPattern(`records:${id}:*`);

    logger.info({
      event:       'scan_complete',
      datasetId:   String(id),
      totalIssues: combinedIssues.length,
      duplicates:  duplicateIssues.length,
      violations:  allViolations.length,
      score:       newProfile.qualityScore,
    });

    res.json({
      success:      true,
      message:      `Scan complete. Found ${combinedIssues.length} issues (${duplicateIssues.length} duplicates, ${allViolations.length} violations).`,
      issuesFound:  combinedIssues.length,
      qualityScore: newProfile.qualityScore,
      drift,
    });
  }),
);

// ── POST /api/datasets/upload ────────────────────────────────────────────
/** Ingests a CSV file, auto-profiles it, and registers it as a new dataset. */
router.post(
  '/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const results = [];
    const stream  = Readable.from(req.file.buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csvParser())
        .on('data',  (data) => results.push(data))
        .on('end',   resolve)
        .on('error', reject);
    });

    const datasetName = req.body.name || req.file.originalname.replace(/\.[^/.]+$/, '');
    const datasetId   = store.generateId();

    const rawRecords = results.map((row, idx) => ({
      _id:       store.generateId(),
      datasetId,
      rowNumber: idx + 1,
      data:      row,
      hasIssues: false,
      issueCount: 0,
      version:   1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const profile = ProfilerService.profileRecords(rawRecords);

    const dataset = {
      _id:         datasetId,
      name:        datasetName,
      description: req.body.description || `Uploaded CSV — ${rawRecords.length} records`,
      sourceType:  'csv',
      status:      'ready',
      rowCount:    rawRecords.length,
      qualityScore: profile.qualityScore,
      dimensions:  profile.dimensions,
      profile: {
        columns:    profile.columns,
        profiledAt: new Date(),
        version:    1,
        history:    [{ version: 1, profiledAt: new Date(), qualityScore: profile.qualityScore, rowCount: rawRecords.length, driftSummary: 'Initial CSV ingest' }],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (getDBStatus()) {
      const doc = await Dataset.create(dataset);
      await Record.insertMany(rawRecords.map((r) => ({ ...r, datasetId: doc._id })));
    } else {
      store.datasets.unshift(dataset);
      store.records.push(...rawRecords);
    }

    logger.info({
      event:    'csv_upload',
      name:     datasetName,
      rows:     rawRecords.length,
      columns:  profile.columns.length,
      score:    profile.qualityScore,
    });

    res.json({
      success: true,
      message: `Ingested '${datasetName}' — ${rawRecords.length} rows, ${profile.columns.length} columns.`,
      data:    dataset,
    });
  }),
);

export default router;
