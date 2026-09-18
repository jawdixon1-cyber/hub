// Boost — Stripe Connect: create a SetupIntent on a connected account so
// the browser can collect a card and attach it to that account's customer.
//
// Flow per call:
//   1. Client POSTs { client_id }
//   2. Server looks up the Hub `clients` row → finds the org_id
//   3. Server looks up `stripe_connected_accounts` for that org → gets stripe_account_id
//   4. Server creates (or reuses) a Stripe Customer on the connected account
//   5. Server creates a SetupIntent on the connected account, referencing that customer
//   6. Returns { client_secret, stripe_customer_id, stripe_account_id }
// Front-end then calls stripe.confirmCardSetup(client_secret, { payment_method: { card, billing_details } })
// using a Stripe.js instance scoped to the connected account.

import Stripe from 'stripe';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

// Lazy init so env vars are loaded before we instantiate.
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
    const { client_id } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    const supa = getSupabaseAdmin();

    // 1. Find the client + their org
    const { data: client, error: cErr } = await supa
      .from('clients')
      .select('id, org_id, first_name, last_name, company_name, stripe_customer_id, billing_street, billing_city, billing_state, billing_zip')
      .eq('id', client_id)
      .single();
    if (cErr || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // 2. Find the org's connected Stripe account
    const { data: acct, error: aErr } = await supa
      .from('stripe_connected_accounts')
      .select('stripe_account_id')
      .eq('org_id', client.org_id)
      .single();
    if (aErr || !acct?.stripe_account_id) {
      return res.status(400).json({
        error: 'This business has not connected its Stripe account yet.',
        code: 'STRIPE_NOT_CONNECTED',
      });
    }
    const stripeAccount = acct.stripe_account_id;

    // 3. Create or reuse Stripe Customer on the connected account
    let customerId = client.stripe_customer_id;
    if (!customerId) {
      const name = [client.first_name, client.last_name].filter(Boolean).join(' ')
        || client.company_name
        || 'Client';
      const customer = await getStripe().customers.create(
        {
          name,
          metadata: { hub_client_id: client.id },
        },
        { stripeAccount }
      );
      customerId = customer.id;
      await supa.from('clients').update({ stripe_customer_id: customerId }).eq('id', client.id);
    }

    // 4. Create SetupIntent on the connected account.
    // Card-only — clean Jobber-style flow. Bank/ACH can be added later as a
    // separate explicit button if we want.
    const setupIntent = await getStripe().setupIntents.create(
      {
        customer: customerId,
        usage: 'off_session', // charge later without the cardholder present
        payment_method_types: ['card'],
      },
      { stripeAccount }
    );

    return res.status(200).json({
      client_secret: setupIntent.client_secret,
      stripe_customer_id: customerId,
      stripe_account_id: stripeAccount,
    });
  } catch (err) {
    console.error('[stripe-setup-intent]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
