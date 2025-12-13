import { Context, Next } from 'hono';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  } : undefined,
});

export { logger };

export async function loggerMiddleware(c: Context, next: Next) {
  const startTime = Date.now();
  const requestId = c.get('requestId') || 'unknown';

  logger.info({
    requestId,
    method: c.req.method,
    path: c.req.path,
    msg: 'Request started',
  });

  await next();

  const duration = Date.now() - startTime;

  logger.info({
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
    msg: 'Request completed',
  });
}
