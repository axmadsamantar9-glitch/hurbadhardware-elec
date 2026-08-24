import { logger } from "@/lib/logger";
import { getRateLimitConfig, RATE_LIMIT_WINDOW_SECONDS } from "@/lib/config/rate-limits";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitCheckResult {
  allowed: boolean;
  retryAfter?: number;
}

/**
 * In-memory rate-limit store using token bucket algorithm.
 * Each key (e.g., "auth:192.168.1.1:user@example.com") maintains a bucket.
 *
 * Implementation: Token Bucket Algorithm
 * - Each bucket has a maximum capacity (threshold)
 * - Tokens regenerate at threshold/minute rate
 * - Each request consumes 1 token
 * - If bucket is empty, request is rejected (429)
 *
 * Note: This is in-memory and suitable for single-instance deployments.
 * For multi-instance deployments, use Vercel Edge Config or a distributed cache.
 */
class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private readonly cleanupIntervalMs = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Periodically clean up old buckets to prevent unbounded memory growth
    setInterval(() => this.cleanup(), this.cleanupIntervalMs);
  }

  /**
   * Check if a request is allowed under the rate limit.
   * Returns { allowed: true } if request is allowed.
   * Returns { allowed: false, retryAfter: N } if request is rejected (caller should return HTTP 429).
   */
  check(key: string, threshold: number): RateLimitCheckResult {
    const now = Date.now();
    const bucket = this.buckets.get(key) || { tokens: threshold, lastRefill: now };

    // Refill tokens based on elapsed time
    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = (threshold / RATE_LIMIT_WINDOW_SECONDS) * elapsedSeconds;
    bucket.tokens = Math.min(threshold, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if request is allowed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.buckets.set(key, bucket);
      return { allowed: true };
    }

    // Request denied; calculate Retry-After
    // Time until next token is available: 1 / (threshold/60) = 60/threshold seconds
    const timePerToken = RATE_LIMIT_WINDOW_SECONDS / threshold;
    const retryAfter = Math.ceil(timePerToken - elapsedSeconds);

    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  /**
   * Clean up buckets that haven't been used recently.
   * Removes entries not accessed in the last 10 minutes to free memory.
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAgaMs = 10 * 60 * 1000; // 10 minutes

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > maxAgaMs) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Reset all buckets (for testing).
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Get bucket state (for testing/monitoring).
   */
  getState(key: string): TokenBucket | undefined {
    return this.buckets.get(key);
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

/**
 * Create a rate-limit middleware response (HTTP 429).
 * Called when a request exceeds the rate limit.
 */
export function createRateLimitResponse(retryAfter: number) {
  return new Response(
    JSON.stringify({
      error: {
        message: "Rate limit exceeded",
        code: "rate_limit_exceeded",
        retryAfter,
      },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfter.toString(),
      },
    }
  );
}

/**
 * Helper to extract client IP from request headers.
 * Handles X-Forwarded-For (from reverse proxies) and direct connection.
 */
export function getClientIP(request: Request): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    // X-Forwarded-For can be comma-separated; take the first (client) IP
    return xForwardedFor.split(",")[0].trim();
  }
  // Fall back to direct connection IP (may not be available in all environments)
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Log rate-limit trigger event.
 * Includes context for monitoring and alerting.
 */
export function logRateLimitTrigger(
  key: string,
  category: string,
  threshold: number,
  correlationId?: string
): void {
  logger.info("rate_limit_triggered", {
    rateLimitKey: key,
    rateLimitCategory: category,
    threshold,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    correlationId,
  });
}
