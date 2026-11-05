import { logger } from './logger.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Errors worth retrying: rate limits, server errors, timeouts, network failures. */
export function isRetryable(err) {
  if (!err) return false;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  if (typeof err.status === 'number') return err.status === 429 || err.status === 408 || err.status >= 500;
  return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(err.code || err.cause?.code);
}

/**
 * Retry with exponential backoff + full jitter.
 * Honors a Retry-After value attached to the error (seconds) when present.
 */
export async function withRetry(fn, { retries = 3, baseMs = 300, maxMs = 4000, label = 'operation', deadline } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isRetryable(err)) throw err;
      let delay = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      delay = Math.round(delay / 2 + Math.random() * (delay / 2));
      if (err.retryAfter) delay = Math.min(maxMs, err.retryAfter * 1000);
      if (deadline && Date.now() + delay > deadline) throw err;
      logger.warn(`${label} failed, retrying`, { attempt, delayMs: delay, error: err.message, status: err.status });
      await sleep(delay);
    }
  }
}

/** fetch with a hard timeout; throws HttpError for non-2xx responses. */
export async function fetchJson(url, { timeoutMs = 5000, ...opts } = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = (body && (body.error?.message || body.errors?.[0]?.message || body.message)) || `HTTP ${res.status}`;
    const err = new HttpError(res.status, msg, body);
    const ra = parseInt(res.headers.get('retry-after'), 10);
    if (Number.isFinite(ra)) err.retryAfter = ra;
    throw err;
  }
  return body;
}
