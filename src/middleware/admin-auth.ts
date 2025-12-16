import { Context, Next } from 'hono';
import { AppContext } from '../types';
import { AuthorizationError } from '../lib/errors';
import { logger } from './logger';
import { timingSafeEqual } from 'crypto';

/**
 * Admin authentication middleware
 * Checks for ADMIN_API_KEY in X-Admin-Key header
 */
export async function adminAuthMiddleware(c: Context<AppContext>, next: Next) {
  const adminApiKey = process.env.ADMIN_API_KEY;
  const requestId = c.get('requestId') || 'unknown';
  
  // Check for admin API key in header
  const providedKey = c.req.header('X-Admin-Key');
  
  if (providedKey && adminApiKey) {
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
  }
  
  // Log failed admin access attempt
  logger.warn({
    requestId,
    event: 'admin_access_denied',
    ip: c.req.header('X-Forwarded-For') || 'unknown',
  }, 'Admin access denied - no valid credentials provided');
  
  throw new AuthorizationError('Admin access required. Provide X-Admin-Key header.');
}
