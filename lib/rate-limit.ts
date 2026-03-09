import { NextResponse } from 'next/server';

// Per-user write rate limiter: 20 writes per minute.
// Comfortable for a human (peak ~5–10/min); meaningful throttle for a runaway agent.
// In-memory — resets on server restart. Fine for a self-hosted team tool.
// Use the authenticated username as the key so rate limits apply per person,
// not per IP (agents may share IPs via Tailscale, proxies, etc.).

const limits = new Map<string, { count: number; resetAt: number }>();

const WRITE_MAX        = 20;
const WRITE_WINDOW_MS  = 60 * 1000;

export function checkWriteRateLimit(identifier: string): boolean {
  const now   = Date.now();
  const entry = limits.get(identifier);

  if (!entry || now > entry.resetAt) {
    limits.set(identifier, { count: 1, resetAt: now + WRITE_WINDOW_MS });
    return true;
  }
  if (entry.count >= WRITE_MAX) return false;
  entry.count++;
  return true;
}

export const rateLimitResponse = () =>
  NextResponse.json({ error: 'Rate limit exceeded — slow down' }, { status: 429 });
