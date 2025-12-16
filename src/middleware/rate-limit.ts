import { Context, Next } from 'hono';
import { RateLimitError } from '../lib/errors';
import { logger } from './logger';

/**
 * Simple in-memory rate limiter
 * 
 * WARNING: This implementation uses in-memory storage which has limitations in serverless environments:
 * - Each serverless function instance maintains its own rate limit state
 * - State is not shared across multiple instances or regions
 * - State is reset when the function instance is terminated
 * - For production use with serverless, consider using a stateless approach or external store like:
 *   - Redis (e.g., Upstash Redis for serverless)
 *   - DynamoDB or similar distributed key-value store
 *   - Edge KV storage (e.g., Cloudflare KV, Vercel KV)
 * 
 * This implementation is suitable for:
 * - Development and testing environments
 * - Single-instance deployments
 * - Basic rate limiting where exact enforcement isn't critical
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_MAX || '100', 10); // requests per window
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10); // default 1 minute

export async function rateLimitMiddleware(c: Context, next: Next) {
  const userId = c.get('auth')?.userId || c.req.header('X-Forwarded-For') || 'anonymous';
  const requestId = c.get('requestId') || 'unknown';
  const now = Date.now();

  const userLimit = rateLimitStore.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitStore.set(userId, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
  } else {
    userLimit.count++;

    if (userLimit.count > RATE_LIMIT) {
      // Log rate limit violation
      logger.warn({
        requestId,
        userId,
        event: 'rate_limit_exceeded',
        count: userLimit.count,
        limit: RATE_LIMIT,
      }, 'Rate limit exceeded');
      
      throw new RateLimitError(`Rate limit exceeded. Try again in ${Math.ceil((userLimit.resetAt - now) / 1000)} seconds`);
    }
  }

  // Clean up old entries periodically
  if (Math.random() < 0.01) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }

  await next();
}
