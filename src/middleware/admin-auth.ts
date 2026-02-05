import { Context, Next } from 'hono';
import { AppContext } from '../types/index.js';
import { AuthorizationError } from '../lib/errors.js';
import { logger } from './logger.js';
import { timingSafeEqual } from 'crypto';

/**
 * Admin authentication middleware
 * Checks for ADMIN_API_KEY in X-Admin-Key header
 */
export async function adminAuthMiddleware(c: Context<AppContext>, next: Next) {
  const adminApiKey = process.env.ADMIN_API_KEY;
  const requestId = c.get('requestId') || 'unknown';
  
  // Validate that ADMIN_API_KEY is configured
  if (!adminApiKey) {
    logger.error({
      requestId,
      event: 'admin_access_misconfigured',
    }, 'ADMIN_API_KEY environment variable is not configured');
    
    throw new AuthorizationError('Admin access is not properly configured');
  }
  
  // Check for admin API key in header
  const providedKey = c.req.header('X-Admin-Key');
  
  if (!providedKey) {
    logger.warn({
      requestId,
      event: 'admin_access_denied',
      reason: 'missing_key',
      ip: c.req.header('X-Forwarded-For') || 'unknown',
    }, 'Admin access denied - no API key provided');
    
    throw new AuthorizationError('Admin access required. Provide X-Admin-Key header.');
  }
  
  // Use timing-safe comparison to prevent timing attacks
  const providedBuffer = Buffer.from(providedKey);
  const adminBuffer = Buffer.from(adminApiKey);
  
  if (
    providedBuffer.length === adminBuffer.length &&
    timingSafeEqual(providedBuffer, adminBuffer)
  ) {
    logger.info({
      requestId,
      event: 'admin_access_granted',
      method: 'api_key',
    }, 'Admin access granted via API key');
    
    await next();
    return;
  }
  
  // Log failed admin access attempt
  logger.warn({
    requestId,
    event: 'admin_access_denied',
    reason: 'invalid_key',
    ip: c.req.header('X-Forwarded-For') || 'unknown',
  }, 'Admin access denied - invalid API key provided');
  
  throw new AuthorizationError('Invalid admin credentials');
}
