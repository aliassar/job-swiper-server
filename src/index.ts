import { Hono } from 'hono';
import { AppContext } from './types';
import { requestIdMiddleware } from './middleware/request-id';
import { loggerMiddleware } from './middleware/logger';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import api from './routes';

const app = new Hono<AppContext>();

// Global middleware
app.use('*', requestIdMiddleware);
app.use('*', loggerMiddleware);
app.use('*', rateLimitMiddleware);

// Mount API routes
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
