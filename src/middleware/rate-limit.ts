// Middleware de rate limiting simple

import type { Context, Next } from 'hono';
import type { Bindings, Variables } from '../core/types';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/search': { windowMs: 60000, maxRequests: 60 },
  '/api/rag': { windowMs: 60000, maxRequests: 10 },
  '/api/summarize': { windowMs: 60000, maxRequests: 20 },
  '/api/documents': { windowMs: 60000, maxRequests: 100 },
};

export function rateLimiter() {
  return async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
    const path = c.req.path;
    const config = Object.entries(RATE_LIMITS).find(([p]) =>
      path.startsWith(p)
    )?.[1];

    if (!config) {
      return next();
    }

    // Use client IP for rate limiting key
    const clientIP =
      c.req.header('CF-Connecting-IP') ??
      c.req.header('X-Forwarded-For')?.split(',')[0] ??
      'unknown';

    const key = `ratelimit:${path}:${clientIP}`;

    try {
      const stored = await c.env.KV.get(key, 'json') as {
        count: number;
        resetAt: number;
      } | null;

      const now = Date.now();

      if (stored && stored.resetAt > now) {
        if (stored.count >= config.maxRequests) {
          return c.json(
            {
              success: false,
              error: {
                code: 'RATE_LIMITED',
                message: 'Too many requests. Please wait before trying again.',
                details: {
                  retryAfter: Math.ceil((stored.resetAt - now) / 1000),
                },
              },
            },
            429
          );
        }

        // Increment count
        await c.env.KV.put(
          key,
          JSON.stringify({
            count: stored.count + 1,
            resetAt: stored.resetAt,
          }),
          { expirationTtl: Math.ceil(config.windowMs / 1000) }
        );
      } else {
        // Start new window
        await c.env.KV.put(
          key,
          JSON.stringify({
            count: 1,
            resetAt: now + config.windowMs,
          }),
          { expirationTtl: Math.ceil(config.windowMs / 1000) }
        );
      }
    } catch (error) {
      // If KV fails, allow the request
      console.error('Rate limit error:', error);
    }

    return next();
  };
}
