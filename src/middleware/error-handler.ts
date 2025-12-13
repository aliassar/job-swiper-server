import { Context } from 'hono';
import { AppError } from '../lib/errors';
import { formatResponse } from '../lib/utils';

export async function errorHandler(err: Error, c: Context) {
  console.error('Error:', err);

  const requestId = c.get('requestId') || 'unknown';

  if (err instanceof AppError) {
    // Map status codes to valid Hono status codes
    let status: 400 | 401 | 403 | 404 | 429 | 500 | 502 = 500;
    if (err.statusCode === 400) status = 400;
    else if (err.statusCode === 401) status = 401;
    else if (err.statusCode === 403) status = 403;
    else if (err.statusCode === 404) status = 404;
    else if (err.statusCode === 429) status = 429;
    else if (err.statusCode === 502) status = 502;

    return c.json(
      formatResponse(false, null, {
        code: err.code,
        message: err.message,
        details: err.details,
      }, requestId),
      status
    );
  }

  // Unknown error
  return c.json(
    formatResponse(false, null, {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    }, requestId),
    500
  );
}
