/**
 * @module jobs.routes
 * @description Lightweight polling endpoint for async job status.
 *   GET /api/jobs/:jobId/status
 */
import express       from "express";
import { getJobStatus } from "../jobs/jobQueue.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = express.Router();

router.get(
  "/:jobId/status",
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const job = await getJobStatus(jobId);
    if (!job) return res.status(404).json({ success: false, error: "Job not found" });
    res.json({ success: true, data: job });
  }),
);

export default router;
