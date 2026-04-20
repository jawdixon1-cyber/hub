import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getSupabaseAdmin } from './supabaseAdmin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(__dirname, '..', '.jobber-tokens.json');

const JOBBER_GRAPHQL_URL = 'https://api.getjobber.com/api/graphql';


// ── Token Management (file + Supabase fallback) ──

async function readTokenData() {
  // Prefer Supabase (always up-to-date, works on Vercel)
  try {
    const db = getSupabaseAdmin();
    const { data } = await db
      .from('app_tokens')
      .select('value, org_id')
      .eq('key', 'jobber')
      .maybeSingle();
    if (data?.value?.access_token) {
      // Stash org_id so saveTokenData can include it
      data.value._org_id = data.org_id;
      return data.value;
    }
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
  // Save to local file (dev)
  try {
    writeFileSync(TOKENS_PATH, JSON.stringify(tokenData, null, 2));
  } catch {}

  // Save to Supabase (production/Vercel)
  try {
    const db = getSupabaseAdmin();
    const payload = {
      key: 'jobber',
      value: tokenData,
      updated_at: new Date().toISOString(),
    };
    if (tokenData._org_id) payload.org_id = tokenData._org_id;
    await db.from('app_tokens').upsert(payload, { onConflict: 'key' });
  } catch (err) {
    console.error('[Jobber] Failed to save token to Supabase:', err.message);
  }
}

async function refreshAccessToken(tokenData) {
  const clientId = (process.env.JOBBER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.JOBBER_CLIENT_SECRET || '').trim();
  const reason = !clientId ? 'JOBBER_CLIENT_ID not set' : !clientSecret ? 'JOBBER_CLIENT_SECRET not set' : !tokenData?.refresh_token ? 'no refresh_token stored' : null;
  if (reason) {
    console.error('[Jobber] Cannot refresh:', reason);
    await saveTokenData({ ...(tokenData || {}), last_refresh_error: reason, last_refresh_attempt: new Date().toISOString() });
    return null;
  }

  console.log('[Jobber] Refreshing access token...');
  let res;
  try {
    res = await fetch('https://api.getjobber.com/api/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenData.refresh_token,
      }),
    });
  } catch (err) {
    const msg = `Network error: ${err.message}`;
    console.error('[Jobber] Token refresh network failure:', err);
    await saveTokenData({ ...tokenData, last_refresh_error: msg, last_refresh_attempt: new Date().toISOString() });
    return null;
  }

  if (!res.ok) {
    const body = await res.text();
    const msg = `HTTP ${res.status}: ${body.slice(0, 300)}`;
    console.error('[Jobber] Token refresh failed:', msg);
    await saveTokenData({ ...tokenData, last_refresh_error: msg, last_refresh_attempt: new Date().toISOString() });
    return null;
  }

  const tokens = await res.json();
  const updated = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || tokenData.refresh_token,
    expires_at: Date.now() + (tokens.expires_in || 7200) * 1000,
    connected_at: tokenData.connected_at,
    refreshed_at: new Date().toISOString(),
    last_refresh_attempt: new Date().toISOString(),
    last_refresh_error: null,
    _org_id: tokenData._org_id,
  };

  await saveTokenData(updated);
  process.env.JOBBER_API_TOKEN = updated.access_token;
  console.log('[Jobber] Token refreshed successfully');
  return updated.access_token;
}

let refreshPromise = null;

async function getJobberToken() {
  const tokenData = await readTokenData();
  if (!tokenData?.access_token) return null;

  // Check if expired (with 60s buffer)
  if (tokenData.expires_at && Date.now() > tokenData.expires_at - 60000) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken(tokenData).finally(() => { refreshPromise = null; });
    }
    const newToken = await refreshPromise;
    if (newToken) return newToken;
  }

  process.env.JOBBER_API_TOKEN = tokenData.access_token;
  return tokenData.access_token;
}

// Custom error for disconnected/expired Jobber tokens
export class JobberDisconnectedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JobberDisconnectedError';
    this.code = 'JOBBER_DISCONNECTED';
  }
}

export async function jobberStatus() {
  const tokenData = await readTokenData();
  if (!tokenData?.access_token) return { connected: false };
  return {
    connected: true,
    connected_at: tokenData.connected_at || null,
    refreshed_at: tokenData.refreshed_at || null,
    expires_at: tokenData.expires_at || null,
    has_refresh_token: !!tokenData.refresh_token,
    last_refresh_error: tokenData.last_refresh_error || null,
    last_refresh_attempt: tokenData.last_refresh_attempt || null,
    has_client_id: !!(process.env.JOBBER_CLIENT_ID || '').trim(),
    has_client_secret: !!(process.env.JOBBER_CLIENT_SECRET || '').trim(),
  };
}

// Exposed for manual refresh from UI — returns the new status after the attempt
export async function forceRefresh() {
  const tokenData = await readTokenData();
  if (!tokenData?.access_token) return { ok: false, error: 'Not connected — nothing to refresh.' };
  if (!tokenData.refresh_token) return { ok: false, error: 'Connected but no refresh_token stored. Full reconnect required.' };
  refreshPromise = null;
  const newToken = await refreshAccessToken({ ...tokenData, expires_at: 0 });
  const updated = await readTokenData();
  if (newToken) return { ok: true, status: await jobberStatus() };
  return { ok: false, error: updated?.last_refresh_error || 'Refresh failed (see server logs)', status: await jobberStatus() };
}

export async function jobberQuery(query, variables = {}, retryCount = 0) {
  const token = await getJobberToken();
  if (!token) throw new JobberDisconnectedError('Jobber is not connected. Reconnect in Settings.');

  const res = await fetch(JOBBER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-JOBBER-GRAPHQL-VERSION': '2025-01-20',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 401 && retryCount === 0) {
    // Token rejected — force refresh and retry once
    console.log('[Jobber] 401 received, forcing token refresh...');
    const tokenData = await readTokenData();
    if (tokenData) {
      tokenData.expires_at = 0; // Force expiry
      refreshPromise = null;
      const newToken = await refreshAccessToken(tokenData);
      if (newToken) return jobberQuery(query, variables, 1);
    }
    throw new JobberDisconnectedError('Jobber session expired. Reconnect in Settings.');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jobber API ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    const msg = json.errors[0].message;
    // Auto-retry throttle errors with a delay (up to 2 retries)
    // Don't retry throttle — fail fast, let the frontend handle it
    throw new Error(`Jobber GraphQL: ${msg}`);
  }
  return json.data;
}
