import { Context, Next } from 'hono';
import { AppContext } from '../types';
import { AuthorizationError } from '../lib/errors';
import { authService } from '../services/auth.service';
import { logger } from './logger';

/**
 * Admin authentication middleware
 * Checks for either:
 * 1. ADMIN_API_KEY in X-Admin-Key header
 * 2. Valid JWT token with admin role (future enhancement)
 */
export async function adminAuthMiddleware(c: Context<AppContext>, next: Next) {
  const adminApiKey = process.env.ADMIN_API_KEY;
  const requestId = c.get('requestId') || 'unknown';
  
  // Check for admin API key in header
  const providedKey = c.req.header('X-Admin-Key');
  
  if (providedKey && adminApiKey && providedKey === adminApiKey) {
    logger.info({
      requestId,
      event: 'admin_access_granted',
      method: 'api_key',
    }, 'Admin access granted via API key');
    
    await next();
    return;
  }
  
  // Check for JWT token with admin role
  const authHeader = c.req.header('Authorization');
  
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    
    if (token) {
      try {
        const user = authService.verifyToken(token);
        
        // For now, we don't have admin role in the database schema
        // This is a placeholder for future enhancement
        // In the future, add an 'isAdmin' or 'role' field to the users table
        
        // If user is authenticated, they can access admin routes
        // This should be enhanced with proper role checking
        c.set('auth', {
          userId: user.id,
          sessionToken: token,
        });
        
        logger.info({
          requestId,
          userId: user.id,
          event: 'admin_access_granted',
          method: 'jwt',
        }, 'Admin access granted via JWT');
        
        await next();
        return;
      } catch (error) {
        // Invalid token - fall through to error
        logger.warn({
          requestId,
          event: 'admin_access_failed',
          method: 'jwt',
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Admin access failed - invalid JWT token');
      }
    }
  }
  
  // Log failed admin access attempt
  logger.warn({
    requestId,
    event: 'admin_access_denied',
    ip: c.req.header('X-Forwarded-For') || 'unknown',
  }, 'Admin access denied - no valid credentials provided');
  
  throw new AuthorizationError('Admin access required. Provide X-Admin-Key header or valid admin token.');
}
