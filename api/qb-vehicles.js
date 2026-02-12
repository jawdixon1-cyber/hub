// Fetches vehicles from QuickBooks Online mileage tracker
import { createClient } from '@supabase/supabase-js';

const QBO_BASE = 'https://quickbooks.api.intuit.com';

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function refreshTokens(supabase, tokenData) {
  const clientId = (process.env.QB_CLIENT_ID || '').trim();
  const clientSecret = (process.env.QB_CLIENT_SECRET || '').trim();
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

async function tryFetch(accessToken, url) {
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : await res.text() };
  } catch (e) {
    return { ok: false, status: 0, data: e.message };
  }
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabase();
    const tokenData = await getAccessToken(supabase);
    const { access_token, realm_id } = tokenData;

    const vehicles = [];
    const debug = {};

    // Try multiple paths to find mileage tracker vehicles
    const attempts = [
      { key: 'vehicleQuery', url: `${QBO_BASE}/v3/company/${realm_id}/query?query=${encodeURIComponent("SELECT * FROM Vehicle MAXRESULTS 100")}` },
      { key: 'vehicleEndpoint', url: `${QBO_BASE}/v3/company/${realm_id}/vehicle` },
      { key: 'mileageActivity', url: `${QBO_BASE}/v3/company/${realm_id}/query?query=${encodeURIComponent("SELECT * FROM MileageActivity MAXRESULTS 10")}` },
      { key: 'companyVehicles', url: `${QBO_BASE}/v3/company/${realm_id}/companyinfo/${realm_id}` },
    ];

    for (const attempt of attempts) {
      const result = await tryFetch(access_token, attempt.url);
      debug[attempt.key] = { ok: result.ok, status: result.status, snippet: typeof result.data === 'string' ? result.data.slice(0, 300) : JSON.stringify(result.data).slice(0, 500) };

      if (result.ok && result.data?.QueryResponse?.Vehicle) {
        for (const v of result.data.QueryResponse.Vehicle) {
          vehicles.push({ id: `qb-${v.Id}`, name: v.Name, source: 'vehicle-entity' });
        }
        break;
      }
      if (result.ok && result.data?.QueryResponse?.MileageActivity) {
        // Extract unique vehicle names from mileage activities
        const seen = new Set();
        for (const m of result.data.QueryResponse.MileageActivity) {
          const vName = m.Vehicle?.Name || m.VehicleName;
          if (vName && !seen.has(vName)) {
            seen.add(vName);
            vehicles.push({ id: `mileage-${m.Vehicle?.Id || seen.size}`, name: vName, source: 'mileage-activity' });
          }
        }
        if (vehicles.length > 0) break;
      }
    }

    return res.json({ vehicles, debug });
  } catch (err) {
    console.error('QB vehicles error:', err);
    return res.status(500).json({ error: err.message, vehicles: [] });
  }
}
