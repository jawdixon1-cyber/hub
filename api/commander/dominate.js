import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(__dirname, '..', '..', '.jobber-tokens.json');

const JOBBER_GRAPHQL_URL = 'https://api.getjobber.com/api/graphql';

/* ── Token helpers (with auto-refresh, same as summary.js) ── */

async function readTokenData() {
  // Prefer Supabase (always up-to-date, works on Vercel)
  try {
    const { getSupabaseAdmin } = await import('../../lib/supabaseAdmin.js');
    const db = getSupabaseAdmin();
    const { data } = await db
      .from('app_tokens')
      .select('value')
      .eq('key', 'jobber')
      .maybeSingle();
    if (data?.value?.access_token) return data.value;
  } catch {}

  // Fallback to local file (dev only)
  try {
    if (existsSync(TOKENS_PATH)) {
      const data = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
      if (data?.access_token) return data;
    }
  } catch {}

  return null;
}

async function saveTokenData(tokenData) {
  try { writeFileSync(TOKENS_PATH, JSON.stringify(tokenData, null, 2)); } catch {}
  try {
    const { getSupabaseAdmin } = await import('../../lib/supabaseAdmin.js');
    const db = getSupabaseAdmin();
    await db.from('app_tokens').upsert({
      key: 'jobber',
      value: tokenData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  } catch {}
}

async function refreshAccessToken(tokenData) {
  const clientId = (process.env.JOBBER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.JOBBER_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret || !tokenData?.refresh_token) return null;

  console.log('[Dominate] Refreshing expired access token...');
  const res = await fetch('https://api.getjobber.com/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokenData.refresh_token,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('[Dominate] Token refresh failed:', res.status, errBody);
    return null;
  }

  const tokens = await res.json();
  console.log('[Dominate] Got new access token, expires_in:', tokens.expires_in);
  const updated = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || tokenData.refresh_token,
    expires_at: Date.now() + (tokens.expires_in || 7200) * 1000,
    connected_at: tokenData.connected_at,
    refreshed_at: new Date().toISOString(),
  };
  await saveTokenData(updated);
  console.log('[Dominate] Token refreshed successfully');
  return updated.access_token;
}

let refreshPromise = null;

async function getToken() {
  const tokenData = await readTokenData();
  if (!tokenData?.access_token) return null;

  if (tokenData.expires_at && Date.now() > tokenData.expires_at - 60000) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken(tokenData).finally(() => { refreshPromise = null; });
    }
    const newToken = await refreshPromise;
    if (newToken) return newToken;
  }

  return tokenData.access_token;
}

async function jobberQuery(query, tokenOverride = null) {
  const token = tokenOverride || await getToken();
  if (!token) throw new Error('No Jobber token');

  const res = await fetch(JOBBER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-JOBBER-GRAPHQL-VERSION': '2025-01-20',
    },
    body: JSON.stringify({ query }),
  });

  if (res.status === 401 && !tokenOverride) {
    console.log('[Dominate] 401 received, forcing token refresh...');
    const tokenData = await readTokenData();
    if (tokenData) {
      refreshPromise = null;
      const newToken = await refreshAccessToken(tokenData);
      if (newToken) {
        console.log('[Dominate] Retrying with fresh token...');
        return jobberQuery(query, newToken);
      }
      console.error('[Dominate] Token refresh returned null');
    } else {
      console.error('[Dominate] No token data found in storage');
    }
    throw new Error('Jobber token expired and refresh failed');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jobber ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

/* ── Fetch recurring clients with addresses ── */

async function fetchRecurringClients() {
  const allNodes = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      jobs(first: 100, filter: { jobType: RECURRING }${after}) {
        nodes {
          id
          jobStatus
          client { id firstName lastName }
          property {
            address { street1 street2 city province postalCode }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    const data = await jobberQuery(query);
    allNodes.push(...(data.jobs?.nodes || []));
    hasNext = data.jobs?.pageInfo?.hasNextPage || false;
    cursor = data.jobs?.pageInfo?.endCursor || null;
  }

  // Dedupe by client ID, only active
  const seen = new Set();
  const clients = [];
  for (const j of allNodes) {
    if (j.jobStatus === 'cancelled' || j.jobStatus === 'archived') continue;
    const cid = j.client?.id;
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    const addr = j.property?.address;
    if (addr?.street1 && addr?.city) {
      clients.push({
        name: `${j.client.firstName} ${j.client.lastName}`,
        street: addr.street1,
        city: addr.city,
        state: addr.province,
        zip: addr.postalCode,
      });
    }
  }
  return clients;
}

/* ── Geocode: Nominatim first, US Census fallback ── */

async function geocodeNominatim(street, city, state, zip) {
  try {
    const q = encodeURIComponent(`${street}, ${city}, ${state} ${zip}`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'User-Agent': 'HeyJudesLawnCareHub/1.0' } }
    );
    const text = await res.text();
    const data = JSON.parse(text);
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {}
  return null;
}

async function geocodeCensus(street, city, state, zip) {
  try {
    const params = new URLSearchParams({
      street, city, state, zip,
      benchmark: 'Public_AR_Current',
      format: 'json',
    });
    const res = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/address?${params}`);
    const text = await res.text();
    const data = JSON.parse(text);
    const match = data.result?.addressMatches?.[0];
    if (match) {
      return { lat: match.coordinates.y, lng: match.coordinates.x };
    }
  } catch {}
  return null;
}

async function geocodeAddress(street, city, state, zip) {
  const result = await geocodeNominatim(street, city, state, zip);
  if (result) return result;
  await new Promise(r => setTimeout(r, 300));
  return geocodeCensus(street, city, state, zip);
}

/* ── Cache ── */

let cachedClients = null;
let cacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 min (geocoding is slow)

/* ── Handler ── */

export default async function handler(req, res) {
  try {
    const { refresh, debug } = req.query;
    if (refresh === '1') {
      cachedClients = null;
      cacheTime = 0;
    }

    // Debug mode: show token status
    if (debug === '1') {
      const tokenData = await readTokenData();
      return res.json({
        hasToken: !!tokenData?.access_token,
        hasRefresh: !!tokenData?.refresh_token,
        expiresAt: tokenData?.expires_at ? new Date(tokenData.expires_at).toISOString() : null,
        now: new Date().toISOString(),
        expired: tokenData?.expires_at ? Date.now() > tokenData.expires_at : null,
        hasClientId: !!(process.env.JOBBER_CLIENT_ID || '').trim(),
        hasClientSecret: !!(process.env.JOBBER_CLIENT_SECRET || '').trim(),
      });
    }

    if (cachedClients && Date.now() - cacheTime < CACHE_TTL) {
      return res.json({ clients: cachedClients });
    }

    const clients = await fetchRecurringClients();

    // Geocode all (with 1s delay between requests for Nominatim)
    const geocoded = [];
    for (const c of clients) {
      const coords = await geocodeAddress(c.street, c.city, c.state, c.zip);
      if (coords) {
        geocoded.push({ ...c, lat: coords.lat, lng: coords.lng });
      } else {
        geocoded.push({ ...c, lat: null, lng: null });
      }
      // Nominatim rate limit
      await new Promise(r => setTimeout(r, 1100));
    }

    cachedClients = geocoded;
    cacheTime = Date.now();

    return res.json({ clients: geocoded });
  } catch (err) {
    console.error('[Dominate] Error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack?.split('\n').slice(0, 3) });
  }
}
