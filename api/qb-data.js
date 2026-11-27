import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

function getSupabase() {
  return getSupabaseAdmin();
}

async function getTokens(supabase) {
  const { data } = await supabase
    .from('app_state')
    .select('value')
    .eq('key', 'qb-tokens')
    .single();
  return data?.value || null;
}

// In-memory single-flight lock — dedupe concurrent refresh attempts within a single process.
// Without this, parallel API calls (e.g. dashboard fires 3 at once) race to refresh; the first
// rotates the refresh_token at QB, and the others send the now-dead token and get invalid_grant.
let refreshInFlight = null;

async function refreshIfNeeded(supabase, tokens) {
  // Refresh if token expires within 5 minutes
  if (tokens.expires_at > Date.now() + 5 * 60 * 1000) return tokens;

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const clientId = (process.env.QB_CLIENT_ID || '').trim();
    const clientSecret = (process.env.QB_CLIENT_SECRET || '').trim();

    const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[qb-refresh] failed status=${res.status} body=${body}`);
      throw new Error(`QB refresh failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const newTokens = await res.json();
    const updated = {
      ...tokens,
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      expires_at: Date.now() + newTokens.expires_in * 1000,
      refresh_expires_at: Date.now() + (newTokens.x_refresh_token_expires_in || 8726400) * 1000,
    };

    const { error: saveErr } = await supabase.from('app_state').update({ value: updated, updated_at: new Date().toISOString() }).eq('key', 'qb-tokens');
    if (saveErr) console.error('[qb] could not save refreshed tokens:', saveErr.message);
    console.log(`[qb-refresh] ok, next expires in ${newTokens.expires_in}s, refresh window ${newTokens.x_refresh_token_expires_in}s`);
    return updated;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function qbFetch(tokens, endpoint) {
  const baseUrl = process.env.QB_SANDBOX === 'true'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';

  const url = `${baseUrl}/v3/company/${tokens.realm_id}/${endpoint}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`QB API error ${res.status}: ${errText}`);
  }

  return res.json();
}

// Date helpers
function startOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}
function today() {
  return new Date().toISOString().split('T')[0];
}
function startOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default async function handler(req, res) {
  try {
  const supabase = getSupabase();
  const action = req.query.action || req.body?.action;

  // OAuth: redirect to QuickBooks authorize
  if (action === 'auth') {
    const clientId = (process.env.QB_CLIENT_ID || '').trim();
    if (!clientId) return res.status(500).json({ error: 'QB_CLIENT_ID not configured' });
    const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.APP_URL || 'http://localhost:3001';
    const redirectUri = process.env.QB_REDIRECT_URI || `${baseUrl}/api/qb-data?action=callback`;
    const scope = 'com.intuit.quickbooks.accounting';
    return res.redirect(`https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=lawn-care-hub`);
  }

  // OAuth callback
  if (action === 'callback') {
    const { code, realmId, error: qbError } = req.query;
    const appBase = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.APP_URL || 'http://localhost:5173';
    if (qbError || !code) return res.redirect(`${appBase}/connections?qb=error&msg=${encodeURIComponent(qbError || 'No code')}`);
    const clientId = (process.env.QB_CLIENT_ID || '').trim();
    const clientSecret = (process.env.QB_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) return res.redirect(`${appBase}/connections?qb=error&msg=QB+credentials+not+configured`);
    const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.APP_URL || 'http://localhost:3001';
    const redirectUri = process.env.QB_REDIRECT_URI || `${baseUrl}/api/qb-data?action=callback`;
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    });
    if (!tokenRes.ok) return res.redirect(`${appBase}/connections?qb=error&msg=${encodeURIComponent('Token exchange failed: ' + (await tokenRes.text()).slice(0, 200))}`);
    const t = await tokenRes.json();
    const value = { access_token: t.access_token, refresh_token: t.refresh_token, realm_id: realmId, expires_at: Date.now() + t.expires_in * 1000, refresh_expires_at: Date.now() + (t.x_refresh_token_expires_in || 8726400) * 1000 };
    // app_state.org_id is NOT NULL, so update the existing row (or insert with a known org_id) — a bare upsert failed silently.
    const { data: existing } = await supabase.from('app_state').select('key').eq('key', 'qb-tokens').maybeSingle();
    let saveErr;
    if (existing) {
      ({ error: saveErr } = await supabase.from('app_state').update({ value, updated_at: new Date().toISOString() }).eq('key', 'qb-tokens'));
    } else {
      const { data: any } = await supabase.from('app_state').select('org_id').not('org_id', 'is', null).limit(1).maybeSingle();
      ({ error: saveErr } = await supabase.from('app_state').insert({ key: 'qb-tokens', value, org_id: any?.org_id }));
    }
    if (saveErr) return res.redirect(`${appBase}/connections?qb=error&msg=${encodeURIComponent('Could not save login: ' + saveErr.message)}`);
    return res.redirect(`${appBase}/connections?qb=success`);
  }

  // Status check
  if (action === 'status') {
    const tokens = await getTokens(supabase);
    return res.json({
      connected: !!tokens?.access_token,
      realm_id: tokens?.realm_id || null,
    });
  }

  // All other actions require valid tokens
  let tokens = await getTokens(supabase);
  if (!tokens?.access_token) {
    return res.status(401).json({ error: 'QuickBooks not connected' });
  }

  try {
    tokens = await refreshIfNeeded(supabase, tokens);
  } catch (err) {
    return res.status(401).json({ error: 'Token refresh failed — reconnect QuickBooks', detail: err.message });
  }

  try {
    if (action === 'profit-and-loss') {
      const startDate = req.query.startDate || startOfYear();
      const endDate = req.query.endDate || today();
      const by = req.query.by === 'Month' ? '&summarize_column_by=Month' : '';
      const data = await qbFetch(tokens, `reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}${by}&minorversion=65`);
      return res.json(data);
    }

    if (action === 'balance-sheet') {
      const asOf = req.query.asOf || today();
      const data = await qbFetch(tokens, `reports/BalanceSheet?date_macro=This Fiscal Year-to-date&minorversion=65`);
      return res.json(data);
    }

    if (action === 'invoices') {
      const startDate = req.query.startDate || startOfMonth();
      const query = `SELECT * FROM Invoice WHERE TxnDate >= '${startDate}' ORDER BY TxnDate DESC MAXRESULTS 100`;
      const data = await qbFetch(tokens, `query?query=${encodeURIComponent(query)}&minorversion=65`);
      return res.json(data);
    }

    if (action === 'expenses') {
      const startDate = req.query.startDate || startOfMonth();
      const query = `SELECT * FROM Purchase WHERE TxnDate >= '${startDate}' ORDER BY TxnDate DESC MAXRESULTS 100`;
      const data = await qbFetch(tokens, `query?query=${encodeURIComponent(query)}&minorversion=65`);
      return res.json(data);
    }

    if (action === 'accounts') {
      const query = `SELECT * FROM Account WHERE Active = true MAXRESULTS 200`;
      const data = await qbFetch(tokens, `query?query=${encodeURIComponent(query)}&minorversion=65`);
      return res.json(data);
    }

    if (action === 'company-info') {
      const data = await qbFetch(tokens, `companyinfo/${tokens.realm_id}?minorversion=65`);
      return res.json(data);
    }

    if (action === 'dashboard') {
      // Fetch P&L YTD + current month invoices + expenses in parallel
      const [pnl, monthInvoices, monthExpenses] = await Promise.all([
        qbFetch(tokens, `reports/ProfitAndLoss?start_date=${startOfYear()}&end_date=${today()}&minorversion=65`),
        qbFetch(tokens, `query?query=${encodeURIComponent(`SELECT * FROM Invoice WHERE TxnDate >= '${startOfMonth()}' ORDER BY TxnDate DESC MAXRESULTS 100`)}&minorversion=65`),
        qbFetch(tokens, `query?query=${encodeURIComponent(`SELECT * FROM Purchase WHERE TxnDate >= '${startOfMonth()}' ORDER BY TxnDate DESC MAXRESULTS 100`)}&minorversion=65`),
      ]);
      return res.json({ pnl, monthInvoices, monthExpenses });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('QB data error:', err);
    return res.status(500).json({ error: err.message });
  }
  } catch (outerErr) {
    console.error('QB data outer error:', outerErr);
    return res.status(500).json({ error: outerErr.message });
  }
}
