import { Context, Next } from 'hono';
import { AppContext } from '../types';
import { AuthenticationError } from '../lib/errors';

// Simple mock authentication middleware
// In production, this should validate NextAuth session tokens
export async function authMiddleware(c: Context<AppContext>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    throw new AuthenticationError('Missing authorization header');
  }

  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    throw new AuthenticationError('Invalid authorization header format');
  }

  // TODO: Validate token with NextAuth
  // For now, we'll extract a mock user ID from the token
  // In production, decode and validate the JWT token
  const userId = token || 'user_mock';

  c.set('auth', {
    userId,
    sessionToken: token,
  });

  await next();
}
