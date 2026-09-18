// Mark a saved card as the default for a client. We also tell Stripe so future
// off-session charges use this card by default on the connected account.
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

    // Look up the row, the client, and the connected Stripe account
    const { data: row } = await supa
      .from('payment_methods')
      .select('id, client_id, stripe_payment_method_id, clients ( org_id, stripe_customer_id )')
      .eq('id', payment_method_row_id)
      .single();
    if (!row) return res.status(404).json({ error: 'Not found' });

    const { data: acct } = await supa
      .from('stripe_connected_accounts')
      .select('stripe_account_id')
      .eq('org_id', row.clients.org_id)
      .single();

    // Tell Stripe that this PM is the customer's default for future invoices/charges.
    if (acct?.stripe_account_id && row.clients.stripe_customer_id) {
      try {
        await getStripe().customers.update(
          row.clients.stripe_customer_id,
          { invoice_settings: { default_payment_method: row.stripe_payment_method_id } },
          { stripeAccount: acct.stripe_account_id }
        );
      } catch (e) {
        console.warn('[set-default-card] Stripe update failed:', e.message);
      }
    }

    // Demote every other card for this client, promote this one.
    await supa
      .from('payment_methods')
      .update({ is_default: false })
      .eq('client_id', row.client_id);
    const { error } = await supa
      .from('payment_methods')
      .update({ is_default: true })
      .eq('id', payment_method_row_id);
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
