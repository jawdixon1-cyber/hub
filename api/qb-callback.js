import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  try {
    const { code, realmId, error: qbError } = req.query;

    // Build app base URL for redirects
    const appBase = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.APP_URL || 'http://localhost:5173';

    if (qbError || !code) {
      return res.redirect(`${appBase}/finance?qb=error&msg=${encodeURIComponent(qbError || 'No authorization code')}`);
    }

    const clientId = (process.env.QB_CLIENT_ID || '').trim();
    const clientSecret = (process.env.QB_CLIENT_SECRET || '').trim();

    // Build redirect URI the same way as qb-auth.js
    const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.APP_URL || 'http://localhost:3001';
    const redirectUri = process.env.QB_REDIRECT_URI || `${baseUrl}/api/qb-callback`;

    if (!clientId || !clientSecret) {
      return res.redirect(`${appBase}/finance?qb=error&msg=QB+credentials+not+configured`);
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('QB token exchange failed:', errText);
      return res.redirect(`${appBase}/finance?qb=error&msg=Token+exchange+failed`);
    }

    const tokens = await tokenRes.json();

    // Store tokens in Supabase
    const supabase = getSupabaseAdmin();

    await supabase.from('app_state').upsert({
      key: 'qb-tokens',
      value: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        realm_id: realmId,
        expires_at: Date.now() + tokens.expires_in * 1000,
        refresh_expires_at: Date.now() + (tokens.x_refresh_token_expires_in || 8726400) * 1000,
      },
    }, { onConflict: 'key' });

    return res.redirect(`${appBase}/finance?qb=success`);
  } catch (err) {
    console.error('QB callback error:', err);
    const appBase = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : '';
    return res.redirect(`${appBase}/finance?qb=error&msg=${encodeURIComponent(err.message)}`);
  }
}
