// Pushes a mileage entry to QuickBooks as an Expense
import { createClient } from '@supabase/supabase-js';

const IRS_MILEAGE_RATE = 0.70; // 2026 IRS standard mileage rate
const QBO_BASE = 'https://quickbooks.api.intuit.com'; // production
// const QBO_BASE = 'https://sandbox-quickbooks.api.intuit.com'; // sandbox

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

  // Refresh if expired (with 5 min buffer)
  if (Date.now() > tokenData.expires_at - 300000) {
    tokenData = await refreshTokens(supabase, tokenData);
  }

  return tokenData;
}

async function findExpenseAccount(accessToken, realmId) {
  // Query for expense accounts, prefer one with "auto" or "vehicle" or "mileage" in name
  const query = encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Expense' MAXRESULTS 100");
  const res = await fetch(
    `${QBO_BASE}/v3/company/${realmId}/query?query=${query}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!res.ok) return null;

  const body = await res.json();
  const accounts = body.QueryResponse?.Account || [];

  // Try to find an auto/vehicle/mileage account
  const keywords = ['auto', 'vehicle', 'mileage', 'car', 'truck', 'travel'];
  const match = accounts.find((a) =>
    keywords.some((k) => a.Name.toLowerCase().includes(k))
  );

  return match || accounts[0] || null;
}

async function findBankAccount(accessToken, realmId) {
  const query = encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Bank' MAXRESULTS 10");
  const res = await fetch(
    `${QBO_BASE}/v3/company/${realmId}/query?query=${query}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!res.ok) return null;

  const body = await res.json();
  const accounts = body.QueryResponse?.Account || [];
  return accounts.find((a) => a.Name.toLowerCase().includes('check')) || accounts[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { vehicleName, odometer, date, notes, loggedBy, previousOdometer } = req.body;

  if (!vehicleName || !odometer) {
    return res.status(400).json({ error: 'vehicleName and odometer are required' });
  }

  try {
    const supabase = getSupabase();
    const tokenData = await getAccessToken(supabase);
    const { access_token, realm_id } = tokenData;

    // Find appropriate accounts
    const expenseAccount = await findExpenseAccount(access_token, realm_id);
    const bankAccount = await findBankAccount(access_token, realm_id);

    if (!expenseAccount || !bankAccount) {
      return res.status(400).json({
        error: 'Could not find expense or bank account in QuickBooks. Please ensure you have accounts set up.',
      });
    }

    // Calculate trip miles if we have a previous reading
    const miles = previousOdometer ? odometer - previousOdometer : 0;
    const amount = miles > 0 ? Math.round(miles * IRS_MILEAGE_RATE * 100) / 100 : 0;

    const description = [
      `Vehicle: ${vehicleName}`,
      `Odometer: ${odometer.toLocaleString()}`,
      miles > 0 ? `Miles: ${miles}` : null,
      `Date: ${date}`,
      loggedBy ? `Logged by: ${loggedBy}` : null,
      notes || null,
    ].filter(Boolean).join(' | ');

    const purchase = {
      PaymentType: 'Cash',
      TxnDate: date,
      PrivateNote: `Mileage log — ${vehicleName} — Odometer: ${odometer}`,
      Line: [
        {
          Amount: amount,
          DetailType: 'AccountBasedExpenseLineDetail',
          Description: description,
          AccountBasedExpenseLineDetail: {
            AccountRef: {
              value: expenseAccount.Id,
              name: expenseAccount.Name,
            },
          },
        },
      ],
      AccountRef: {
        value: bankAccount.Id,
        name: bankAccount.Name,
      },
    };

    const qboRes = await fetch(
      `${QBO_BASE}/v3/company/${realm_id}/purchase`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(purchase),
      }
    );

    if (!qboRes.ok) {
      const errBody = await qboRes.text();
      console.error('QBO Purchase create failed:', errBody);
      return res.status(500).json({ error: 'Failed to create expense in QuickBooks', detail: errBody });
    }

    const result = await qboRes.json();
    return res.json({
      success: true,
      purchaseId: result.Purchase?.Id,
      amount,
      miles,
      account: expenseAccount.Name,
    });
  } catch (err) {
    console.error('QB mileage error:', err);
    return res.status(500).json({ error: err.message });
  }
}
