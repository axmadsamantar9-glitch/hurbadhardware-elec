// Rate-limit thresholds and configuration
// All values are configurable via environment variables with sensible defaults
// Based on business decisions documented in docs/guidelines/rate-limiting.md

export interface RateLimitConfig {
  threshold: number; // Requests allowed per minute
  windowSeconds: number; // Time window in seconds (typically 60)
}

// Threshold values from business decisions (AC2)
// All configurable via .env with fallback defaults
export const RATE_LIMIT_THRESHOLDS = {
  LOGIN: parseInt(process.env.RATE_LIMIT_LOGIN || "5", 10),
  API: parseInt(process.env.RATE_LIMIT_API || "60", 10),
  CHECKOUT: parseInt(process.env.RATE_LIMIT_CHECKOUT || "10", 10),
  WEBHOOK: parseInt(process.env.RATE_LIMIT_WEBHOOK || "120", 10),
  PUBLIC: parseInt(process.env.RATE_LIMIT_PUBLIC || "30", 10),
  TRACK: parseInt(process.env.RATE_LIMIT_TRACK || "5", 10),
};

// Window is always 60 seconds (1 minute)
export const RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * Get rate-limit configuration for a given category.
 * Category is determined by the calling route based on endpoint type and auth status.
 */
export function getRateLimitConfig(
  category: "login" | "api" | "checkout" | "webhook" | "public" | "track"
): RateLimitConfig {
  const thresholdKey = category.toUpperCase() as keyof typeof RATE_LIMIT_THRESHOLDS;
  return {
    threshold: RATE_LIMIT_THRESHOLDS[thresholdKey],
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
  };
}

/**
 * Validate that configured thresholds are positive integers.
 * Called at startup to catch configuration errors early.
 */
export function validateRateLimitConfig(): void {
  const thresholds = Object.values(RATE_LIMIT_THRESHOLDS);
  for (const threshold of thresholds) {
    if (!Number.isInteger(threshold) || threshold <= 0) {
      throw new Error(`Invalid rate-limit threshold: ${threshold}. Must be positive integer.`);
    }
  }
}
