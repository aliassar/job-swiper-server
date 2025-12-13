import { Context } from 'hono';
import { AppError } from '../lib/errors';
import { formatResponse } from '../lib/utils';

export async function errorHandler(err: Error, c: Context) {
  console.error('Error:', err);

  const requestId = c.get('requestId') || 'unknown';

  if (err instanceof AppError) {
    const statusCode = err.statusCode >= 100 && err.statusCode < 600 ? err.statusCode : 500;
    return c.json(
      formatResponse(false, null, {
        code: err.code,
        message: err.message,
        details: err.details,
      }, requestId),
      statusCode as any
    );
  }

  // Unknown error
  return c.json(
    formatResponse(false, null, {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    }, requestId),
    500 as any
  );
}
