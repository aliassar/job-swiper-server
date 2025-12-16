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
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
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

export default app;
