// Delete a payment method row + detach the card from the connected Stripe
// account. Service-role so the UI doesn't need RLS policies wired up.
import Stripe from 'stripe';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

let _stripe = null;
function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  _stripe = new Stripe(key, { apiVersion: '2024-06-20' });
  return _stripe;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { payment_method_row_id } = req.body || {};
    if (!payment_method_row_id) return res.status(400).json({ error: 'payment_method_row_id required' });
    const supa = getSupabaseAdmin();

    // Look up the row + its client + the org's connected account
    const { data: row } = await supa
      .from('payment_methods')
      .select('id, client_id, stripe_payment_method_id, clients ( org_id )')
      .eq('id', payment_method_row_id)
      .single();
    if (!row) return res.status(404).json({ error: 'Not found' });

    const { data: acct } = await supa
      .from('stripe_connected_accounts')
      .select('stripe_account_id')
      .eq('org_id', row.clients.org_id)
      .single();

    // Detach on Stripe — fire-and-forget. Don't fail the delete if Stripe rejects.
    if (acct?.stripe_account_id && row.stripe_payment_method_id) {
      try {
        await getStripe().paymentMethods.detach(
          row.stripe_payment_method_id,
          undefined,
          { stripeAccount: acct.stripe_account_id }
        );
      } catch (e) {
        console.warn('[stripe-delete-card] detach failed:', e.message);
      }
    }

    const { error } = await supa.from('payment_methods').delete().eq('id', payment_method_row_id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
