// Handles Jobber OAuth callback - exchanges code for tokens and stores them
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(__dirname, '..', '.jobber-tokens.json');

export default async function handler(req, res) {
  const appUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.APP_URL || 'http://localhost:5173';

  try {
    const { code, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`${appUrl}/commander?jobber=error&msg=${encodeURIComponent(oauthError)}`);
    }

    if (!code) {
      return res.redirect(`${appUrl}/commander?jobber=error&msg=${encodeURIComponent('Missing authorization code')}`);
    }

    const clientId = (process.env.JOBBER_CLIENT_ID || '').trim();
    const clientSecret = (process.env.JOBBER_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) {
      return res.redirect(`${appUrl}/commander?jobber=error&msg=${encodeURIComponent('Jobber credentials not configured on server')}`);
    }

    const redirectUri = `${process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.APP_URL || 'http://localhost:3001'}/api/jobber-callback`;

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://api.getjobber.com/api/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[Jobber OAuth] Token exchange failed:', err);
      return res.redirect(`${appUrl}/commander?jobber=error&msg=${encodeURIComponent('Token exchange failed: ' + err)}`);
    }

    const tokens = await tokenRes.json();

    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in || 7200) * 1000,
      connected_at: new Date().toISOString(),
    };

    // Save to local file (dev)
    try {
      writeFileSync(TOKENS_PATH, JSON.stringify(tokenData, null, 2));
      console.log('[Jobber OAuth] Tokens saved to', TOKENS_PATH);
    } catch {}

    // Save to Supabase (production/Vercel)
    try {
      const db = getSupabaseAdmin();
      await db.from('app_tokens').upsert({
        key: 'jobber',
        value: tokenData,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      console.log('[Jobber OAuth] Tokens saved to Supabase');
    } catch (err) {
      console.error('[Jobber OAuth] Failed to save to Supabase:', err.message);
    }

    // Set in process env so sync can use it immediately
    process.env.JOBBER_API_TOKEN = tokens.access_token;

    console.log('[Jobber OAuth] Connected successfully');
    res.redirect(`${appUrl}/commander?jobber=connected`);
  } catch (err) {
    console.error('[Jobber OAuth] Error:', err);
    res.redirect(`${appUrl}/commander?jobber=error&msg=${encodeURIComponent(err.message || 'Unknown error')}`);
  }
}
