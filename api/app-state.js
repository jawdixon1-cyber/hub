// Server-side proxy for app_state — bypasses RLS using service role key
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  try {
    const db = getSupabaseAdmin();
    const { key } = req.query;

    if (!key) return res.status(400).json({ error: 'key param required' });

    if (req.method === 'GET') {
      const { data, error } = await db
        .from('app_state')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ value: data?.value ?? null });
    }

    if (req.method === 'PUT') {
      const { value } = req.body;
      const { error } = await db
        .from('app_state')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
