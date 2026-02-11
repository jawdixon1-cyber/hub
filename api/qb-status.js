// Returns QuickBooks connection status
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
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
    return res.json({ connected: false });
  }

  return res.json({
    connected: true,
    connectedAt: data.value.connected_at,
    realmId: data.value.realm_id,
  });
}
