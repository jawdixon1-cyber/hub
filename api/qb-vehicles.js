// Fetches vehicles from QuickBooks Online
import { createClient } from '@supabase/supabase-js';

const QBO_BASE = 'https://quickbooks.api.intuit.com';

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function refreshTokens(supabase, tokenData) {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenData.refresh_token,
    }),
  });

  if (!res.ok) throw new Error('Token refresh failed');

  const tokens = await res.json();
  const updated = {
    ...tokenData,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };

  await supabase
    .from('app_state')
    .upsert({ key: 'greenteam-qb-tokens', value: updated }, { onConflict: 'key' });

  return updated;
}

async function getAccessToken(supabase) {
  const { data } = await supabase
    .from('app_state')
    .select('value')
    .eq('key', 'greenteam-qb-tokens')
    .single();

  if (!data?.value?.access_token) throw new Error('QuickBooks not connected');

  let tokenData = data.value;
  if (Date.now() > tokenData.expires_at - 300000) {
    tokenData = await refreshTokens(supabase, tokenData);
  }

  return tokenData;
}

async function queryQBO(accessToken, realmId, query) {
  const res = await fetch(
    `${QBO_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );
  if (!res.ok) return [];
  const body = await res.json();
  return body.QueryResponse;
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabase();
    const tokenData = await getAccessToken(supabase);
    const { access_token, realm_id } = tokenData;

    const vehicles = [];

    // Strategy 1: Look for Fixed Asset accounts (vehicles are often tracked here)
    const assetResult = await queryQBO(access_token, realm_id,
      "SELECT * FROM Account WHERE AccountType = 'Fixed Asset' MAXRESULTS 50"
    );
    const assetAccounts = assetResult?.Account || [];
    const vehicleKeywords = ['vehicle', 'truck', 'car', 'van', 'trailer', 'f-150', 'f150', 'silverado', 'chevy', 'ford', 'toyota', 'dodge', 'ram', 'auto'];
    for (const acct of assetAccounts) {
      const nameLower = acct.Name.toLowerCase();
      if (vehicleKeywords.some((k) => nameLower.includes(k))) {
        vehicles.push({ id: `asset-${acct.Id}`, name: acct.Name, source: 'asset' });
      }
    }

    // Strategy 2: If no asset matches, check all fixed assets (they might just be named by plate/VIN)
    if (vehicles.length === 0 && assetAccounts.length > 0) {
      for (const acct of assetAccounts) {
        vehicles.push({ id: `asset-${acct.Id}`, name: acct.Name, source: 'asset' });
      }
    }

    // Strategy 3: Look for Items of type Service or Other that might be vehicles
    if (vehicles.length === 0) {
      const itemResult = await queryQBO(access_token, realm_id,
        "SELECT * FROM Item MAXRESULTS 100"
      );
      const items = itemResult?.Item || [];
      for (const item of items) {
        const nameLower = item.Name.toLowerCase();
        if (vehicleKeywords.some((k) => nameLower.includes(k))) {
          vehicles.push({ id: `item-${item.Id}`, name: item.Name, source: 'item' });
        }
      }
    }

    return res.json({ vehicles });
  } catch (err) {
    console.error('QB vehicles error:', err);
    return res.status(500).json({ error: err.message, vehicles: [] });
  }
}
