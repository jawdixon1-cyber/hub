// Handles QuickBooks OAuth callback — exchanges code for tokens and stores them
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const appUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.APP_URL || 'https://lawn-care-hub3.vercel.app';

  try {
    const { code, realmId, error: qbError } = req.query;

    if (qbError) {
      return res.redirect(`${appUrl}/profile?qb=error&msg=${encodeURIComponent(qbError)}`);
    }

    if (!code || !realmId) {
      return res.redirect(`${appUrl}/profile?qb=error&msg=${encodeURIComponent('Missing code or realmId from QuickBooks')}`);
    }

    const clientId = (process.env.QB_CLIENT_ID || '').trim();
    const clientSecret = (process.env.QB_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) {
      return res.redirect(`${appUrl}/profile?qb=error&msg=${encodeURIComponent('QB credentials not configured on server')}`);
    }

    const redirectUri = `${appUrl}/api/qb-callback`;

    // Exchange authorization code for tokens
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Token exchange failed:', err);
      return res.redirect(`${appUrl}/profile?qb=error&msg=${encodeURIComponent('Token exchange failed: ' + err)}`);
    }

    const tokens = await tokenRes.json();

    // Store tokens in Supabase (service role key bypasses RLS)
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      realm_id: realmId,
      expires_at: Date.now() + tokens.expires_in * 1000,
      connected_at: new Date().toISOString(),
    };

    const { error: dbError } = await supabase
      .from('app_state')
      .upsert({ key: 'greenteam-qb-tokens', value: tokenData }, { onConflict: 'key' });

    if (dbError) {
      console.error('Supabase upsert failed:', dbError);
      return res.redirect(`${appUrl}/profile?qb=error&msg=${encodeURIComponent('Failed to save tokens: ' + dbError.message)}`);
    }

    res.redirect(`${appUrl}/profile?qb=connected`);
  } catch (err) {
    console.error('QB callback error:', err);
    res.redirect(`${appUrl}/profile?qb=error&msg=${encodeURIComponent(err.message || 'Unknown error')}`);
  }
}
