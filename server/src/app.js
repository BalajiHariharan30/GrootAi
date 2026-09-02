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
 *
 * Security:
 *   - helmet sets sane HTTP security headers (X-Content-Type-Options, CSP, etc.)
 *   - CORS is locked to an explicit whitelist (Vercel + localhost)
 *   - Mutation routes (POST/PATCH/DELETE) require authentication even on guest-enabled paths
 */
import express          from 'express';
import cors             from 'cors';
import helmet           from 'helmet';
import compression      from 'compression';
import cookieParser     from 'cookie-parser';
import dotenv           from 'dotenv';

// Auth
import passportInstance from './config/passport.js';

// Middleware
import { apiLimiter }    from './middleware/rateLimiter.js';
import { authLimiter }   from './middleware/authLimiter.js';
import { errorHandler }  from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requireAuth, requireRole } from './middleware/requireAuth.js';

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
import { getDBStatus }   from './config/db.js';
import { cache }         from './cache/redisClient.js';

dotenv.config();

// ---------------------------------------------------------------------------
const app = express();
// ---------------------------------------------------------------------------

// ── Security Headers (helmet) ──────────────────────────────────────────────
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  }),
);

// ── Gzip Compression (~70% smaller JSON payloads) ─────────────────────────
app.use(compression({ level: 6, threshold: 1024 })); // only compress > 1KB

// ── ETag Support (browser cache validation — 0ms on cache hit) ────────────
app.set('etag', 'strong');

// ── CORS ──────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://grootai.vercel.app',
  'https://grootai-balaji.vercel.app',
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, Render health checks, Postman)
      if (!origin) return cb(null, true);
      // Allow exact matches
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      // Allow any *.vercel.app subdomain (preview deployments)
      if (/^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin)) return cb(null, true);
      // BUG FIX: reject unknown origins instead of silently accepting everything
      logger.warn({ event: 'cors_rejected', origin });
      return cb(new Error(`CORS: origin '${origin}' is not allowed`));
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

// ── Auth Routes (public) — with strict auth rate limiter ───────────────────
app.use('/api/auth',    authLimiter, authRoutes);
app.use('/api/v1/auth', authLimiter, authRoutes);

// ── Protected Domain Routes ───────────────────────────────────────────────
// BUG FIX: guests may read (GET), but all write operations require a valid JWT.
// Each domain router internally guards its own mutation endpoints.
app.use('/api/datasets',       datasetRoutes);
app.use('/api/rules',          ruleRoutes);
app.use('/api/issues',         issueRoutes);
app.use('/api/remediation',    requireAuth(), remediationRoutes);
app.use('/api/eval',           requireAuth({ allowGuest: true }), evalRoutes);

// Versioned aliases — /api/v1/
app.use('/api/v1/datasets',    datasetRoutes);
app.use('/api/v1/rules',       ruleRoutes);
app.use('/api/v1/issues',      issueRoutes);
app.use('/api/v1/remediation', requireAuth(), remediationRoutes);
app.use('/api/v1/eval',        requireAuth({ allowGuest: true }), evalRoutes);

// ── Model Context Protocol ────────────────────────────────────────────────
app.get('/api/mcp/tools', (_req, res) => {
  res.json({ success: true, tools: mcpToolDefinitions });
});

// BUG FIX: MCP /call requires authentication — prevents unauthenticated tool execution
app.post(
  '/api/mcp/call',
  requireAuth(),
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

// ── Health Check (/api/health) ────────────────────────────────────────────
// Used by Render for uptime monitoring — must return 200 to avoid restarts
app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    status:   'ok',
    uptime:   Math.round(process.uptime()),
    db:       getDBStatus() ? 'mongodb' : 'in-memory',
    memoryMb: parseFloat((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
    ts:       new Date().toISOString(),
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────
app.use(errorHandler);

export default app;
