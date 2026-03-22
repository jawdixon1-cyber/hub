export default function handler(req, res) {
  try {
    const clientId = (process.env.QB_CLIENT_ID || '').trim();
    if (!clientId) return res.status(500).json({ error: 'QB_CLIENT_ID not configured' });

    const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.APP_URL || 'http://localhost:3001';

    const redirectUri = process.env.QB_REDIRECT_URI || `${baseUrl}/api/qb-callback`;
    const scope = 'com.intuit.quickbooks.accounting';

    const authUrl =
      `https://appcenter.intuit.com/connect/oauth2?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=lawn-care-hub`;

    res.redirect(authUrl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
