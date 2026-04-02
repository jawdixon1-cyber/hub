import { jobberQuery, jobberStatus, JobberDisconnectedError } from './jobberClient.js';

// Single global cache — all endpoints read from here
const cache = {
  status: null,
  summary: null,      // commander summary data
  labor: {},           // keyed by "start|end"
  ytdRevenue: null,
  crewStatus: null,
  lastFetch: 0,
  fetching: false,
  error: null,
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MIN_FETCH_INTERVAL = 30 * 1000; // don't re-fetch within 30s

// Background fetch interval
let bgInterval = null;

export function getCache() { return cache; }

export function getCachedLabor(start, end) {
  return cache.labor[`${start}|${end}`] || null;
}

export function setCachedLabor(start, end, data) {
  cache.labor[`${start}|${end}`] = { data, time: Date.now() };
}

export function isCacheStale() {
  return Date.now() - cache.lastFetch > CACHE_TTL;
}

export function isCacheFetching() {
  return cache.fetching;
}

// Bust cache — next request will refetch
export function bustCache() {
  cache.lastFetch = 0;
  cache.summary = null;
  cache.ytdRevenue = null;
  cache.crewStatus = null;
  cache.labor = {};
}

// Start background refresh
export function startBackgroundRefresh() {
  if (bgInterval) return;
  // Initial fetch after 2s (let server boot)
  setTimeout(() => refreshCache(), 2000);
  // Then every 5 minutes
  bgInterval = setInterval(() => refreshCache(), CACHE_TTL);
  console.log('[JobberCache] Background refresh started (every 5m)');
}

// Core refresh — fetches everything sequentially (no parallel = no throttle)
async function refreshCache() {
  if (cache.fetching) return;
  if (Date.now() - cache.lastFetch < MIN_FETCH_INTERVAL) return;

  cache.fetching = true;
  cache.error = null;

  try {
    const status = await jobberStatus();
    cache.status = status;
    if (!status.connected) {
      cache.fetching = false;
      return;
    }

    console.log('[JobberCache] Refreshing...');
    const startTime = Date.now();

    // We don't fetch summary/labor here — those are fetched on-demand
    // and cached per endpoint. This just validates the connection
    // and primes the token.

    cache.lastFetch = Date.now();
    console.log(`[JobberCache] Ready (${Date.now() - startTime}ms)`);
  } catch (err) {
    console.error('[JobberCache] Refresh error:', err.message);
    cache.error = err.message;
  } finally {
    cache.fetching = false;
  }
}

export { refreshCache };
