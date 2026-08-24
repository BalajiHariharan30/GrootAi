/**
 * @module server
 * @description HTTP + Socket.io server bootstrap.
 *
 * Responsibilities:
 *  • Creates the HTTP server around the Express app
 *  • Attaches Socket.io for real-time scan progress and issue alerts
 *  • Connects to MongoDB (falls back gracefully to in-memory)
 *  • Registers SIGTERM / SIGINT handlers for graceful shutdown
 *    (critical for Render.com and Kubernetes rolling deploys)
 */
import http                  from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app                   from './app.js';
import { connectDB }         from './config/db.js';
import logger                from './config/logger.js';

const PORT        = Number(process.env.PORT)        || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN          ||
                    process.env.FRONTEND_URL          ||
                    'http://localhost:5173';

const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────────────────────
const io = new SocketIOServer(server, {
  cors: {
    origin:  CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Prefer WebSocket; fall back to long-polling
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  logger.debug({ event: 'socket_connect', socketId: socket.id });

  socket.on('subscribe_dataset', (datasetId) => {
    socket.join(`dataset_${datasetId}`);
    logger.debug({ event: 'socket_subscribe', socketId: socket.id, datasetId });
  });

  socket.on('disconnect', (reason) => {
    logger.debug({ event: 'socket_disconnect', socketId: socket.id, reason });
  });
});

// ── Emitter Helpers (imported by route handlers) ──────────────────────────

/** Broadcasts scan progress to all clients subscribed to a dataset room. */
export const emitScanProgress = (datasetId, data) => {
  io.to(`dataset_${datasetId}`).emit('scan:progress', { datasetId, ...data });
};

/** Broadcasts a critical issue alert to all clients subscribed to a dataset room. */
export const emitIssueAlert = (datasetId, issue) => {
  io.to(`dataset_${datasetId}`).emit('issue:alert', { datasetId, ...issue });
};

// ── Bootstrap ─────────────────────────────────────────────────────────────

async function start() {
  await connectDB();

  server.listen(PORT, () => {
    logger.info({
      event:   'server_start',
      port:    PORT,
      mode:    process.env.NODE_ENV ?? 'development',
      version: process.env.npm_package_version ?? '1.0.0',
    });
    // Human-readable console summary for local dev
    if (process.env.NODE_ENV !== 'production') {
      /* eslint-disable no-console */
      console.log(`\n  ╔══════════════════════════════════════════════╗`);
      console.log(`  ║     GrootAi  ·  Port ${PORT}                     ║`);
      console.log(`  ║  Health  → http://localhost:${PORT}/api/health   ║`);
      console.log(`  ║  Auth    → http://localhost:${PORT}/api/auth/google║`);
      console.log(`  ║  MCP     → http://localhost:${PORT}/api/mcp/tools ║`);
      console.log(`  ╚══════════════════════════════════════════════╝\n`);
      /* eslint-enable no-console */
    }
  });
}

// ── Graceful Shutdown ─────────────────────────────────────────────────────
/**
 * Drains in-flight requests before exiting. Critical for:
 *  • Render.com rolling deploys (sends SIGTERM)
 *  • Docker/Kubernetes pod eviction
 *  • Dev server restarts (SIGINT from Ctrl+C)
 *
 * Allows up to 10 seconds for existing connections to finish, then forces exit.
 */
function shutdown(signal) {
  logger.info({ event: 'shutdown_initiated', signal });

  const forceExitTimer = setTimeout(() => {
    logger.error({ event: 'shutdown_timeout', message: 'Force exiting after 10s' });
    process.exit(1);
  }, 10_000);

  // Don't block the event loop
  forceExitTimer.unref?.();

  // Stop accepting new connections; wait for existing ones to finish
  server.close(() => {
    logger.info({ event: 'shutdown_complete', signal });
    process.exit(0);
  });

  // Disconnect all Socket.io clients gracefully
  io.close(() => {
    logger.debug({ event: 'socket_server_closed' });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch unhandled rejections so the process doesn't crash silently
process.on('unhandledRejection', (reason) => {
  logger.error({ event: 'unhandled_rejection', reason: String(reason) });
});

start();
