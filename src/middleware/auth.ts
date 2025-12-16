import { Context, Next } from 'hono';
import { AppContext } from '../types';
import { AuthenticationError } from '../lib/errors';
import { authService } from '../services/auth.service';
import { logger } from './logger';

// Authentication middleware with JWT support
export async function authMiddleware(c: Context<AppContext>, next: Next) {
  const authHeader = c.req.header('Authorization');
  const requestId = c.get('requestId') || 'unknown';

  if (!authHeader) {
    logger.warn({
      requestId,
      event: 'auth_failed',
      reason: 'missing_header',
    }, 'Authentication failed - missing authorization header');
    
    throw new AuthenticationError('Missing authorization header');
  }

  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    logger.warn({
      requestId,
      event: 'auth_failed',
      reason: 'invalid_format',
    }, 'Authentication failed - invalid header format');
    
    throw new AuthenticationError('Invalid authorization header format');
  }

  try {
    // Verify and decode JWT token
    const user = authService.verifyToken(token);

    c.set('auth', {
      userId: user.id,
      sessionToken: token,
    });

    await next();
  } catch (error) {
    logger.warn({
      requestId,
      event: 'auth_failed',
      reason: 'invalid_token',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Authentication failed - invalid or expired token');
    
    throw new AuthenticationError('Invalid or expired token');
  }
}
