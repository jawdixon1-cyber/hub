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
  // Save to local file (dev)
  try {
    writeFileSync(TOKENS_PATH, JSON.stringify(tokenData, null, 2));
  } catch {}

  // Save to Supabase (production/Vercel)
  try {
    const db = getSupabaseAdmin();
    await db.from('app_tokens').upsert({
      key: 'jobber',
      value: tokenData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  } catch (err) {
    console.error('[Jobber] Failed to save token to Supabase:', err.message);
  }
}

async function refreshAccessToken(tokenData) {
  const clientId = (process.env.JOBBER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.JOBBER_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret || !tokenData?.refresh_token) return null;

  console.log('[Jobber] Refreshing expired access token...');
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
    const err = await res.text();
    console.error('[Jobber] Token refresh failed:', err);
    return null;
  }

  const tokens = await res.json();
  const updated = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || tokenData.refresh_token,
    expires_at: Date.now() + (tokens.expires_in || 7200) * 1000,
    connected_at: tokenData.connected_at,
    refreshed_at: new Date().toISOString(),
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

export async function jobberQuery(query, variables = {}, retried = false) {
  const token = await getJobberToken();
  if (!token) throw new Error('Missing JOBBER_API_TOKEN. Connect Jobber at /api/jobber-auth');

  const res = await fetch(JOBBER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-JOBBER-GRAPHQL-VERSION': '2025-01-20',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 401 && !retried) {
    // Token rejected — force refresh and retry once
    console.log('[Jobber] 401 received, forcing token refresh...');
    const tokenData = await readTokenData();
    if (tokenData) {
      tokenData.expires_at = 0; // Force expiry
      refreshPromise = null;
      const newToken = await refreshAccessToken(tokenData);
      if (newToken) return jobberQuery(query, variables, true);
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jobber API ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Jobber GraphQL: ${json.errors[0].message}`);
  }
  return json.data;
}
