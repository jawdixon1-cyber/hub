// After Stripe.js confirms the SetupIntent on the connected account, the
// browser POSTs the resulting payment_method_id here so we can persist its
// display metadata (brand, last4, expiry) for the Hub UI.

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
    const { client_id, payment_method_id } = req.body || {};
    if (!client_id || !payment_method_id) {
      return res.status(400).json({ error: 'client_id and payment_method_id required' });
    }

    const supa = getSupabaseAdmin();

    // Look up org → connected account so we fetch from the right Stripe account.
    const { data: client } = await supa
      .from('clients')
      .select('id, org_id')
      .eq('id', client_id)
      .single();
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const { data: acct } = await supa
      .from('stripe_connected_accounts')
      .select('stripe_account_id')
      .eq('org_id', client.org_id)
      .single();
    if (!acct?.stripe_account_id) return res.status(400).json({ error: 'Stripe not connected' });

    // Fetch the payment method from the connected account.
    // The 2nd arg is `params` (filtering/expand options); per-request options
    // like `stripeAccount` go in the 3rd arg.
    const pm = await getStripe().paymentMethods.retrieve(
      payment_method_id,
      {},
      { stripeAccount: acct.stripe_account_id }
    );

    // Persist display metadata. Promote to default if this is the only one.
    const { count } = await supa
      .from('payment_methods')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id);
    const isDefault = (count || 0) === 0;

    // Upsert — Stripe sometimes confirms a SetupIntent twice (one from
    // client.confirmCardSetup, one from a retry); we don't want the second
    // write to fail with a duplicate-key error.
    const { data: row, error } = await supa
      .from('payment_methods')
      .upsert({
        client_id: client.id,
        stripe_payment_method_id: pm.id,
        brand: pm.card?.brand || null,
        last4: pm.card?.last4 || null,
        exp_month: pm.card?.exp_month || null,
        exp_year: pm.card?.exp_year || null,
        is_default: isDefault,
      }, { onConflict: 'stripe_payment_method_id' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, payment_method: row });
  } catch (err) {
    console.error('[stripe-save-card]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
