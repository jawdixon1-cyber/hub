// Initiates QuickBooks OAuth 2.0 flow
export default function handler(req, res) {
  try {
    const clientId = (process.env.QB_CLIENT_ID || '').trim();
    if (!clientId) return res.status(500).json({ error: 'QB_CLIENT_ID not configured' });

    const redirectUri = `${process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.APP_URL || 'https://lawn-care-hub3.vercel.app'}/api/qb-callback`;

    const scope = 'com.intuit.quickbooks.accounting';
    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);

    const authUrl =
      `https://appcenter.intuit.com/connect/oauth2` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&state=${state}`;

    res.redirect(authUrl);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}
