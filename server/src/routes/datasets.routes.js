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
import { Issue }                     from '../models/Issue.js';
import { RemediationAction }         from '../models/RemediationAction.js';
import { store }                     from '../data/inMemoryStore.js';
import { getDBStatus }               from '../config/db.js';
import { ProfilerService }           from '../services/profiler.service.js';
import { RuleEngineService }         from '../services/ruleEngine.service.js';
import { MatcherService }            from '../services/matcher.service.js';
import { RemediationService }        from '../services/remediation.service.js';
import { cache }             from '../cache/redisClient.js';
import { asyncHandler }      from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/requireAuth.js';
import logger                from '../config/logger.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── GET /api/datasets ────────────────────────────────────────────────────
/** Returns all datasets sorted by creation date. Public (guests can view). */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    // Cache-Control: serve fresh for 30s, allow stale up to 5min while revalidating
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    if (getDBStatus()) {
      // lean() returns plain JS objects — ~3x faster than full Mongoose documents
      const datasets = await Dataset.find()
        .select('-profile.history -__v')   // exclude large history array from list view
        .sort({ createdAt: -1 })
        .lean();
      return res.json({ success: true, data: datasets });
    }
    res.json({ success: true, data: store.datasets });
  }),
);

// ── POST /api/datasets/seed ──────────────────────────────────────────────
/**
 * Resets and re-seeds the two default enterprise datasets.
 * BUG 4 FIX: Requires admin role — previously had no auth guard.
 */
router.post(
  '/seed',
  requireAuth(),
  requireRole('admin'),
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
        const { _id: _oldId, ...datasetData } = d;
        const datasetDoc = await Dataset.create(datasetData);
        const recs       = store.records.filter((r) => r.datasetId === d._id);
        await Record.insertMany(
          recs.map((r) => {
            const { _id: _recOldId, ...recData } = r;
            return { ...recData, datasetId: datasetDoc._id };
          }),
        );
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
 * Enqueues a full DQ scan job and returns immediately with a jobId.
 * Heavy work (profiling + rule scan + dedup + AI proposals) runs in BullMQ worker.
 * Poll GET /api/jobs/:jobId/status for progress (0-100) and final results.
 */
router.post(
  '/:id/scan',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Quick existence check before enqueuing
    let exists = false;
    if (getDBStatus()) {
      exists = Boolean(await Dataset.exists({ _id: id }));
    } else {
      exists = store.datasets.some((d) => String(d._id) === String(id));
    }
    if (!exists) return res.status(404).json({ success: false, error: 'Dataset not found' });

    const { enqueueJob }      = await import('../jobs/jobQueue.js');
    const { processScanJob }  = await import('../jobs/scanProcessor.js');

    const jobId = await enqueueJob(
      'scan',
      { datasetId: id },
      processScanJob,   // fallback fn for local dev (no Redis)
    );

    logger.info({ event: 'scan_enqueued', datasetId: id, jobId });

    res.status(202).json({
      success: true,
      message: 'DQ scan queued. Poll /api/jobs/:jobId/status for results.',
      jobId,
      statusUrl: `/api/jobs/${jobId}/status`,
    });
  }),
);


// ── POST /api/datasets/upload ────────────────────────────────────────────
/**
 * Phase 1 (sync, <50ms): Validate file, parse CSV headers, create Dataset
 *   stub in DB with status='processing', respond with { dataset, jobId }.
 * Phase 2 (async, BullMQ): Bulk-insert records in 500-row chunks, profile,
 *   update dataset to status='ready'.
 * Supports up to 100,000 rows without blocking the HTTP request.
 */
router.post(
  '/upload',
  requireAuth(),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const content = req.file.buffer.toString('utf-8');
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Uploaded file is empty.' });
    }

    // Quick header validation — parse only first 5 rows synchronously to fail fast
    const firstLines = content.split('\n').slice(0, 6).join('\n');
    let headerCheck = [];
    try {
      await new Promise((resolve, reject) => {
        Readable.from(firstLines)
          .pipe(csvParser({ strict: false }))
          .on('data', (d) => headerCheck.push(d))
          .on('end', resolve)
          .on('error', (e) => reject(new Error(`CSV parse error: ${e.message}`)));
      });
    } catch (e) {
      return res.status(400).json({ success: false, error: e.message });
    }

    if (headerCheck.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid data rows found in CSV.' });
    }

    const datasetName = req.body.name || req.file.originalname.replace(/\.[^/.]+$/, '');
    const datasetId   = store.generateId();

    // Create dataset stub immediately so the UI can poll/display it
    const datasetStub = {
      _id:         datasetId,
      name:        datasetName,
      description: req.body.description || `Uploaded CSV — processing…`,
      sourceType:  'csv',
      status:      'processing',    // Worker will flip this to 'ready'
      rowCount:    0,
      qualityScore: null,
      createdAt:   new Date(),
      updatedAt:   new Date(),
    };

    if (getDBStatus()) {
      const { _id: _dsId, ...dsData } = datasetStub;
      const doc = await Dataset.create(dsData);
      datasetStub._id = String(doc._id);
    } else {
      store.datasets.unshift(datasetStub);
    }

    // Enqueue the heavy work
    const { enqueueJob }         = await import('../jobs/jobQueue.js');
    const { processUploadJob }   = await import('../jobs/scanProcessor.js');

    const jobId = await enqueueJob(
      'upload',
      { csvContent: content, datasetName, description: req.body.description, datasetId: datasetStub._id },
      processUploadJob,
    );

    logger.info({ event: 'csv_upload_enqueued', name: datasetName, jobId, datasetId: datasetStub._id });

    res.status(202).json({
      success:   true,
      message:   `Upload queued for '${datasetName}'. Processing up to 100,000 rows in the background.`,
      data:      datasetStub,
      jobId,
      statusUrl: `/api/jobs/${jobId}/status`,
    });
  }),
);

export default router;
