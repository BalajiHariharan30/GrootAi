/**
 * @module app
 * @description Express application factory — sets up middleware, mounts all
 * domain routers, and registers the global error handler.
 *
 * Architecture note: the HTTP server and Socket.io are created in `server.js`
 * so that this file stays pure and testable without starting a network port.
 *
 * Auth note: Passport.js is initialized here in stateless mode (no sessions).
 * All protected routes use `requireAuth()` JWT middleware instead of
 * Passport sessions to keep the server horizontally scalable.
 */
import express          from 'express';
import cors             from 'cors';
import cookieParser     from 'cookie-parser';
import dotenv           from 'dotenv';

// Auth
import passportInstance from './config/passport.js';

// Middleware
import { apiLimiter }    from './middleware/rateLimiter.js';
import { errorHandler }  from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requireAuth }   from './middleware/requireAuth.js';

// Domain routers
import authRoutes        from './routes/auth.routes.js';
import datasetRoutes     from './routes/datasets.routes.js';
import ruleRoutes        from './routes/rules.routes.js';
import issueRoutes       from './routes/issues.routes.js';
import remediationRoutes from './routes/remediation.routes.js';
import evalRoutes        from './routes/eval.routes.js';

// MCP
import { mcpToolDefinitions, handleMCPToolCall } from './mcp/server.js';

// Config
import { asyncHandler }  from './middleware/asyncHandler.js';
import logger            from './config/logger.js';

dotenv.config();

// ---------------------------------------------------------------------------
const app = express();
// ---------------------------------------------------------------------------

// ── Security & Parsing ────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      const allowed = [
        'http://localhost:5173',
        'http://localhost:3000',
        process.env.CORS_ORIGIN,
        process.env.FRONTEND_URL,
        process.env.CLIENT_URL,
      ].filter(Boolean);
      // Allow requests with no origin (mobile apps, curl, Render health checks)
      if (!origin || allowed.some(o => origin.startsWith(o))) return cb(null, true);
      // Allow any vercel.app subdomain
      if (/\.vercel\.app$/.test(origin)) return cb(null, true);
      return cb(null, true); // Open for now — lock down after confirming Vercel URL
    },
    methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials:    true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());            // Parse httpOnly auth cookie

// ── Passport (stateless — no session store) ───────────────────────────────
app.use(passportInstance.initialize());

// ── Request Logging ───────────────────────────────────────────────────────
app.use(requestLogger);

// ── Rate Limiting ─────────────────────────────────────────────────────────
app.use('/api/', apiLimiter);

import { getDBStatus } from './config/db.js';
import { cache }       from './cache/redisClient.js';

// ── Health (public) ───────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const isMongo = getDBStatus();
  const isRedis = cache.isRedisConnected;
  res.json({
    status:      'healthy',
    platform:    'GrootAi',
    version:     process.env.npm_package_version ?? '1.0.0',
    apiVersion:  'v1',
    env:         process.env.NODE_ENV ?? 'development',
    storageMode: isMongo ? 'mongodb' : 'in-memory',
    cacheMode:   isRedis ? 'redis' : 'in-memory',
    isDemoMode:  !isMongo,
    timestamp:   new Date().toISOString(),
  });
});
// Versioned alias
app.get('/api/v1/health', (_req, res) => res.redirect(307, '/api/health'));

// ── Auth Routes (public) ───────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/v1/auth', authRoutes);

// ── Protected Domain Routes ───────────────────────────────────────────────
// Both /api/ (legacy) and /api/v1/ (current) are supported for compatibility
app.use('/api/datasets',       requireAuth({ allowGuest: true }), datasetRoutes);
app.use('/api/rules',          requireAuth({ allowGuest: true }), ruleRoutes);
app.use('/api/issues',         requireAuth({ allowGuest: true }), issueRoutes);
app.use('/api/remediation',    requireAuth({ allowGuest: true }), remediationRoutes);
app.use('/api/eval',           requireAuth({ allowGuest: true }), evalRoutes);

// Versioned aliases — /api/v1/
app.use('/api/v1/datasets',    requireAuth({ allowGuest: true }), datasetRoutes);
app.use('/api/v1/rules',       requireAuth({ allowGuest: true }), ruleRoutes);
app.use('/api/v1/issues',      requireAuth({ allowGuest: true }), issueRoutes);
app.use('/api/v1/remediation', requireAuth({ allowGuest: true }), remediationRoutes);
app.use('/api/v1/eval',        requireAuth({ allowGuest: true }), evalRoutes);

// ── Model Context Protocol ────────────────────────────────────────────────
app.get('/api/mcp/tools', (_req, res) => {
  res.json({ success: true, tools: mcpToolDefinitions });
});

app.post(
  '/api/mcp/call',
  asyncHandler(async (req, res) => {
    const { toolName, args = {} } = req.body;

    if (!toolName || typeof toolName !== 'string') {
      return res.status(400).json({
        success: false,
        error:   '`toolName` is required and must be a string.',
      });
    }

    logger.info({ event: 'mcp_call', toolName, args });
    const result = await handleMCPToolCall(toolName, args);
    res.json({ success: true, result });
  }),
);

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────
app.use(errorHandler);

export default app;
