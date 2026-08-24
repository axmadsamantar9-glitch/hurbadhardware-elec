/**
 * Validates and sanitizes callback URLs to prevent open redirects.
 * Only allows relative URLs starting with '/' and rejects URLs with '://' patterns.
 *
 * @param url - The URL to validate (can be null)
 * @returns A validated relative URL or '/'
 *
 * Security rules:
 * - Reject absolute URLs (e.g., https://attacker.com)
 * - Reject URLs with protocol markers (e.g., /https://attacker.com)
 * - Allow relative paths (e.g., /account, /auth/signin)
 * - Default to '/' if URL is null or invalid
 */
export function validateCallbackUrl(url: string | null): string {
  if (!url) return "/";
  // Reject absolute URLs and protocol-based redirects (e.g., https://attacker.com)
  if (!url.startsWith("/") || url.includes("://")) {
    return "/";
  }
  return url;
}
