// List payment methods for a client. Uses service-role to bypass RLS so the
// UI works regardless of how the new tables' RLS policies are set up.
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { client_id } = req.query;
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    const supa = getSupabaseAdmin();
    const { data, error } = await supa
      .from('payment_methods')
      .select('*')
      .eq('client_id', client_id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ methods: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
