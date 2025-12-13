import { Context, Next } from 'hono';
import { RateLimitError } from '../lib/errors';

// Simple in-memory rate limiter
// In production, use Redis or similar
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT = 100; // requests per minute
const WINDOW_MS = 60 * 1000; // 1 minute

export async function rateLimitMiddleware(c: Context, next: Next) {
  const userId = c.get('auth')?.userId || c.req.header('X-Forwarded-For') || 'anonymous';
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
