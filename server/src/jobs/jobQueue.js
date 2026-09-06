/**
 * @module jobQueue
 * @description BullMQ-backed job queue for heavy async workloads:
 *   - CSV ingest + profiling (large uploads)
 *   - Dataset DQ scan + bulk remediation proposal generation
 *
 * Strategy:
 *   - Redis available  -> BullMQ Queue + Worker (persistent, crash-safe)
 *   - Redis absent     -> lightweight in-process async fallback
 *     (keeps local dev working with zero config change)
 *
 * Jobs always respond immediately with { jobId } so the HTTP request
 * never blocks. Clients poll GET /api/jobs/:jobId/status for progress.
 */

import { Queue, Worker, QueueEvents } from "bullmq";
import logger from "../config/logger.js";

const REDIS_URL  = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const USE_BULLMQ = Boolean(process.env.REDIS_URL);

function parseRedisUrl(url) {
  try {
    const u = new URL(url);
    return {
      host:     u.hostname || "127.0.0.1",
      port:     parseInt(u.port, 10) || 6379,
      password: u.password || undefined,
      tls:      u.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return { host: "127.0.0.1", port: 6379, maxRetriesPerRequest: null };
  }
}

const redisConnection = parseRedisUrl(REDIS_URL);

const inMemoryJobs = new Map();

function makeMemoryJobId() {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

let scanQueue       = null;
let scanWorker      = null;
let scanQueueEvents = null;

export async function initJobQueue({ processScanJob, processUploadJob }) {
  if (!USE_BULLMQ) {
    logger.info("[JobQueue] Redis not configured -- using in-process async fallback.");
    return;
  }
  try {
    scanQueue = new Queue("grootai:scan", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts:  3,
        backoff:   { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 200 },
        removeOnFail:     { count: 50  },
      },
    });

    scanQueueEvents = new QueueEvents("grootai:scan", { connection: redisConnection });

    scanWorker = new Worker(
      "grootai:scan",
      async (job) => {
        if (job.name === "scan")   return processScanJob(job);
        if (job.name === "upload") return processUploadJob(job);
        throw new Error(`Unknown job type: ${job.name}`);
      },
      {
        connection:  redisConnection,
        concurrency: 4,
        limiter:     { max: 10, duration: 1000 },
      },
    );

    scanWorker.on("completed", (job) =>
      logger.info({ event: "job_completed", jobId: job.id, ms: Date.now() - job.timestamp })
    );
    scanWorker.on("failed", (job, err) =>
      logger.error({ event: "job_failed", jobId: job?.id, error: err.message })
    );

    logger.info("[JobQueue] BullMQ queue + worker initialized (Redis-backed).");
  } catch (err) {
    logger.warn(`[JobQueue] BullMQ init failed: ${err.message}. Using in-process fallback.`);
    scanQueue  = null;
    scanWorker = null;
  }
}

export async function enqueueJob(jobName, data, fallbackFn) {
  if (scanQueue) {
    const job = await scanQueue.add(jobName, data);
    return job.id;
  }

  const jobId = makeMemoryJobId();
  inMemoryJobs.set(jobId, { id: jobId, name: jobName, data, progress: 0, status: "active", result: null, error: null, createdAt: Date.now() });

  if (fallbackFn) {
    const updateProgress = (pct) => { const j = inMemoryJobs.get(jobId); if (j) j.progress = pct; };
    fallbackFn({ id: jobId, data, updateProgress })
      .then((result) => {
        const j = inMemoryJobs.get(jobId);
        if (j) { j.status = "completed"; j.result = result; j.progress = 100; }
      })
      .catch((err) => {
        const j = inMemoryJobs.get(jobId);
        if (j) { j.status = "failed"; j.error = err.message; }
        logger.error({ event: "memory_job_failed", jobId, error: err.message });
      });
  }
  return jobId;
}

export async function getJobStatus(jobId) {
  if (inMemoryJobs.has(jobId)) {
    const j = inMemoryJobs.get(jobId);
    return { id: j.id, name: j.name, status: j.status, progress: j.progress, result: j.result, error: j.error };
  }
  if (scanQueue) {
    try {
      const job   = await scanQueue.getJob(jobId);
      if (!job) return null;
      const state = await job.getState();
      return { id: job.id, name: job.name, status: state, progress: job.progress ?? 0, result: job.returnvalue ?? null, error: job.failedReason ?? null };
    } catch { return null; }
  }
  return null;
}

export async function closeJobQueue() {
  await scanWorker?.close();
  await scanQueue?.close();
  await scanQueueEvents?.close();
}
