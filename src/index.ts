import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppContext } from './types/index.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { loggerMiddleware } from './middleware/logger.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { errorHandler } from './middleware/error-handler.js';
import api from './routes/index.js';
import { timerService } from './services/timer.service.js';

const app = new Hono<AppContext>();

// CORS middleware - must be first
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key', 'X-Idempotency-Key', 'Cache-Control'],
  exposeHeaders: ['Content-Disposition'],
  credentials: false, // credentials must be false when origin is '*'
}));

// Global middleware
app.use('*', requestIdMiddleware);
app.use('*', loggerMiddleware);
app.use('*', rateLimitMiddleware);

// Mount API routes
// API v1 for future versioning
app.route('/api/v1', api);
// Keep /api for backward compatibility
app.route('/api', api);

// Root health check
app.get('/', (c) => {
  return c.json({
    success: true,
    data: {
      message: 'Job Swiper API Server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    },
  });
});

// Error handler
app.onError(errorHandler);

// Start the HTTP server unless running as Vercel functions (locally with `npm run dev`, or in the Docker
// container on the server)
if (!process.env.VERCEL) {
  const { serve } = await import('@hono/node-server');
  const port = parseInt(process.env.PORT || '5000', 10);

  console.log(`🚀 Server starting on http://0.0.0.0:${port}`);
  serve({
    fetch: app.fetch,
    port,
    hostname: '0.0.0.0',
  });
}

// Start automatic timer processing if enabled
// Set ENABLE_TIMER_PROCESSING=true for long-running servers; TIMER_INTERVAL_MS sets how often pending timers
// are checked (default 5 s; every check is a database query, so a server with few timers can use 60000).
// For serverless (Vercel, Lambda), use external cron to call POST /api/sync/timers
const timerIntervalMs = Math.max(1000, parseInt(process.env.TIMER_INTERVAL_MS || '5000', 10) || 5000);
if (process.env.ENABLE_TIMER_PROCESSING === 'true' || process.env.NODE_ENV !== 'production') {
  console.log(`⏰ Starting automatic timer processing (every ${timerIntervalMs} ms)...`);
  setInterval(async () => {
    try {
      await timerService.processPendingTimers();
    } catch (error) {
      console.error('Error processing timers:', error);
    }
  }, timerIntervalMs);
}

export default app;

