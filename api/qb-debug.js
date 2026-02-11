// Debug: shows what's in your QBO account
import { createClient } from '@supabase/supabase-js';

const QBO_BASE = 'https://quickbooks.api.intuit.com';

export default async function handler(req, res) {
  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data } = await supabase
      .from('app_state')
      .select('value')
      .eq('key', 'greenteam-qb-tokens')
      .single();

    if (!data?.value?.access_token) {
      return res.json({ error: 'Not connected' });
    }

    const { access_token, realm_id } = data.value;

    async function query(q) {
      const r = await fetch(
        `${QBO_BASE}/v3/company/${realm_id}/query?query=${encodeURIComponent(q)}`,
        { headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' } }
      );
      if (!r.ok) return { error: r.status, body: await r.text() };
      return await r.json();
    }

    const [companyInfo, fixedAssets, allAccounts, items] = await Promise.all([
      fetch(`${QBO_BASE}/v3/company/${realm_id}/companyinfo/${realm_id}`, {
        headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' },
      }).then(r => r.json()).catch(e => ({ error: e.message })),
      query("SELECT * FROM Account WHERE AccountType = 'Fixed Asset' MAXRESULTS 50"),
      query("SELECT Name, AccountType, AccountSubType FROM Account MAXRESULTS 200"),
      query("SELECT * FROM Item MAXRESULTS 50"),
    ]);

    return res.json({
      company: companyInfo?.CompanyInfo?.CompanyName || companyInfo,
      realmId: realm_id,
      fixedAssets: fixedAssets?.QueryResponse?.Account?.map(a => a.Name) || [],
      allAccountTypes: [...new Set((allAccounts?.QueryResponse?.Account || []).map(a => `${a.AccountType}: ${a.Name}`))],
      items: (items?.QueryResponse?.Item || []).map(i => ({ name: i.Name, type: i.Type })),
    });
  } catch (err) {
    return res.json({ error: err.message });
  }
}
