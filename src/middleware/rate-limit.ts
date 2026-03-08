import { Context, Next } from 'hono';
import { RateLimitError } from '../lib/errors.js';
import { logger } from './logger.js';

/**
 * Per-endpoint rate limiter with category-based limits
 * 
 * Each route category has its own rate limit, tracked separately per user.
 * A global per-user limit also applies across all endpoints.
 * 
 * WARNING: In-memory storage — not shared across serverless instances.
 * For production, consider Redis/Upstash.
 */

// --- Configuration ---

interface CategoryConfig {
  limit: number;     // max requests per window
  windowMs: number;  // window duration in ms
}

// Global limit (across all endpoints combined)
const GLOBAL_LIMIT: CategoryConfig = {
  limit: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
};

// Per-category limits (stricter for expensive or sensitive operations)
const CATEGORY_LIMITS: Record<string, CategoryConfig> = {
  auth: { limit: 15, windowMs: 60_000 },          // login/register: 15/min
  applications: { limit: 120, windowMs: 60_000 },  // applications list/filter: 120/min
  jobs: { limit: 120, windowMs: 60_000 },           // job feed: 120/min
  webhooks: { limit: 60, windowMs: 60_000 },        // webhooks: 60/min
  export: { limit: 10, windowMs: 60_000 },          // CSV/PDF exports: 10/min
  bulk: { limit: 20, windowMs: 60_000 },            // bulk actions: 20/min
};

// Map path prefixes to categories
function getCategory(path: string): string | null {
  if (path.includes('/auth/')) return 'auth';
  if (path.includes('/bulk/')) return 'bulk';
  if (path.includes('/export')) return 'export';
  if (path.includes('/applications')) return 'applications';
  if (path.includes('/jobs')) return 'jobs';
  if (path.includes('/webhooks')) return 'webhooks';
  return null; // no specific category — only global limit applies
}

// --- Storage ---

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// key format: "userId" for global, "userId:category" for per-category
const rateLimitStore = new Map<string, RateLimitEntry>();

function checkLimit(key: string, config: CategoryConfig, now: number): { allowed: boolean; retryAfterSec: number } {
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  entry.count++;

  if (entry.count > config.limit) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }

  return { allowed: true, retryAfterSec: 0 };
}

// --- Middleware ---

export async function rateLimitMiddleware(c: Context, next: Next) {
  const userId = c.get('auth')?.userId || c.req.header('X-Forwarded-For') || 'anonymous';
  const requestId = c.get('requestId') || 'unknown';
  const path = c.req.path;
  const now = Date.now();

  // 1. Check per-category limit first (stricter)
  const category = getCategory(path);
  if (category && CATEGORY_LIMITS[category]) {
    const categoryKey = `${userId}:${category}`;
    const result = checkLimit(categoryKey, CATEGORY_LIMITS[category], now);

    if (!result.allowed) {
      logger.warn({
        requestId, userId, category, path,
        event: 'category_rate_limit_exceeded',
        limit: CATEGORY_LIMITS[category].limit,
      }, `Rate limit exceeded for category: ${category}`);

      throw new RateLimitError(`Too many ${category} requests. Try again in ${result.retryAfterSec} seconds`);
    }
  }

  // 2. Check global limit
  const globalResult = checkLimit(userId, GLOBAL_LIMIT, now);
  if (!globalResult.allowed) {
    logger.warn({
      requestId, userId, path,
      event: 'global_rate_limit_exceeded',
      limit: GLOBAL_LIMIT.limit,
    }, 'Global rate limit exceeded');

    throw new RateLimitError(`Rate limit exceeded. Try again in ${globalResult.retryAfterSec} seconds`);
  }

  // Clean up old entries periodically (~1% of requests)
  if (Math.random() < 0.01) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }

  await next();
}
