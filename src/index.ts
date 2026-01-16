import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppContext } from './types';
import { requestIdMiddleware } from './middleware/request-id';
import { loggerMiddleware } from './middleware/logger';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import api from './routes';

const app = new Hono<AppContext>();

// CORS middleware - must be first
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key', 'X-Idempotency-Key'],
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

// Start local development server if not in serverless environment
// This allows running the server locally with: npm run dev
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const { serve } = await import('@hono/node-server');
  const port = parseInt(process.env.PORT || '5000', 10);

  console.log(`🚀 Server starting on http://0.0.0.0:${port}`);
  serve({
    fetch: app.fetch,
    port,
    hostname: '0.0.0.0',
  });
}

export default app;
