import { env } from '../config/env.js';
import { fetchJson, withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

// Nominatim usage policy: max 1 request/second, identifying User-Agent, cache results.
const MIN_INTERVAL_MS = 1100;
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

// Small in-memory LRU cache (per container instance).
const CACHE_MAX = 500;
const cache = new Map();
function cacheGet(key) {
  if (!cache.has(key)) return undefined;
  const v = cache.get(key);
  cache.delete(key);
  cache.set(key, v);
  return v;
}
function cacheSet(key, v) {
  cache.set(key, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/**
 * Geocodes a free-form street address.
 * Returns { status: 'ok'|'not_found', latitude, longitude, formatted_address, neighborhood }.
 * Throws on unrecoverable network/API failure.
 */
export async function geocodeAddress(address, { deadline } = {}) {
  const key = String(address).trim().toLowerCase();
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  const url = `${env.nominatim.baseUrl}/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(address)}`;
  const results = await withRetry(
    async () => {
      await throttle();
      return fetchJson(url, {
        timeoutMs: env.nominatim.timeoutMs,
        headers: { 'User-Agent': env.nominatim.userAgent, Accept: 'application/json', 'Accept-Language': 'en' },
      });
    },
    { retries: 2, baseMs: 600, label: 'Nominatim geocode', deadline }
  );

  if (!Array.isArray(results) || results.length === 0) {
    const miss = { status: 'not_found' };
    cacheSet(key, miss);
    return miss;
  }

  const r = results[0];
  const a = r.address || {};
  const out = {
    status: 'ok',
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
    formatted_address: r.display_name,
    neighborhood: {
      suburb: a.suburb || a.neighbourhood || a.quarter || a.city_district,
      city: a.city || a.town || a.village || a.hamlet || a.municipality,
      county: a.county,
      state: a.state,
      postcode: a.postcode,
      country: a.country,
      place_rank: r.place_rank,
    },
  };
  cacheSet(key, out);
  logger.debug('Geocoded address', { address, lat: out.latitude, lon: out.longitude });
  return out;
}

export const geocoderInfo = () => ({ provider: 'OpenStreetMap Nominatim', baseUrl: env.nominatim.baseUrl, cacheSize: cache.size });
