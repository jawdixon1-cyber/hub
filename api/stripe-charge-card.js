// Charge a client's saved card off-session on the connected Stripe account.
// Used by the "Charge card" button on a client page.
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
    const { client_id, amount_cents, payment_method_row_id, description } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    const amt = Number(amount_cents);
    if (!Number.isFinite(amt) || amt < 50) {
      return res.status(400).json({ error: 'amount_cents must be at least 50 (Stripe minimum)' });
    }

    const supa = getSupabaseAdmin();

    // Client → org → connected account → customer
    const { data: client } = await supa
      .from('clients')
      .select('id, org_id, stripe_customer_id, name')
      .eq('id', client_id)
      .single();
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.stripe_customer_id) return res.status(400).json({ error: 'No Stripe customer for this client' });

    const { data: acct } = await supa
      .from('stripe_connected_accounts')
      .select('stripe_account_id')
      .eq('org_id', client.org_id)
      .single();
    if (!acct?.stripe_account_id) return res.status(400).json({ error: 'Stripe not connected for this org' });

    // Pick the card: explicit row → that one, else the default, else newest
    let pmRow;
    if (payment_method_row_id) {
      const { data } = await supa
        .from('payment_methods')
        .select('*')
        .eq('id', payment_method_row_id)
        .eq('client_id', client.id)
        .single();
      pmRow = data;
    } else {
      const { data } = await supa
        .from('payment_methods')
        .select('*')
        .eq('client_id', client.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);
      pmRow = data?.[0];
    }
    if (!pmRow) return res.status(400).json({ error: 'No saved card for this client' });

    // Off-session PaymentIntent on the connected account.
    const intent = await getStripe().paymentIntents.create(
      {
        amount: Math.round(amt),
        currency: 'usd',
        customer: client.stripe_customer_id,
        payment_method: pmRow.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: description || `Hub charge — ${client.name || client.id}`,
      },
      { stripeAccount: acct.stripe_account_id }
    );

    return res.status(200).json({
      ok: true,
      payment_intent_id: intent.id,
      status: intent.status,
      amount: intent.amount,
    });
  } catch (err) {
    // Stripe gives us a structured error for off-session declines.
    const code = err?.code || err?.raw?.code;
    const decline = err?.decline_code || err?.raw?.decline_code;
    console.error('[stripe-charge-card]', err.message, code, decline);
    return res.status(400).json({ error: err.message, code, decline_code: decline });
  }
}
