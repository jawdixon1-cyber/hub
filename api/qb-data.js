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

async function refreshIfNeeded(supabase, tokens) {
  // Refresh if token expires within 5 minutes
  if (tokens.expires_at > Date.now() + 5 * 60 * 1000) return tokens;

  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!res.ok) throw new Error('Token refresh failed');

  const newTokens = await res.json();
  const updated = {
    ...tokens,
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token,
    expires_at: Date.now() + newTokens.expires_in * 1000,
  };

  await supabase.from('app_state').upsert({ key: 'qb-tokens', value: updated }, { onConflict: 'key' });
  return updated;
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
    if (qbError || !code) return res.redirect(`${appBase}/finance?qb=error&msg=${encodeURIComponent(qbError || 'No code')}`);
    const clientId = (process.env.QB_CLIENT_ID || '').trim();
    const clientSecret = (process.env.QB_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) return res.redirect(`${appBase}/finance?qb=error&msg=QB+credentials+not+configured`);
    const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.APP_URL || 'http://localhost:3001';
    const redirectUri = process.env.QB_REDIRECT_URI || `${baseUrl}/api/qb-data?action=callback`;
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    });
    if (!tokenRes.ok) return res.redirect(`${appBase}/finance?qb=error&msg=Token+exchange+failed`);
    const t = await tokenRes.json();
    await supabase.from('app_state').upsert({ key: 'qb-tokens', value: { access_token: t.access_token, refresh_token: t.refresh_token, realm_id: realmId, expires_at: Date.now() + t.expires_in * 1000, refresh_expires_at: Date.now() + (t.x_refresh_token_expires_in || 8726400) * 1000 } }, { onConflict: 'key' });
    return res.redirect(`${appBase}/finance?qb=success`);
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
  } catch {
    return res.status(401).json({ error: 'Token refresh failed — reconnect QuickBooks' });
  }

  try {
    if (action === 'profit-and-loss') {
      const startDate = req.query.startDate || startOfYear();
      const endDate = req.query.endDate || today();
      const data = await qbFetch(tokens, `reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&minorversion=65`);
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
