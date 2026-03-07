// Initiates Jobber OAuth 2.0 flow
export default function handler(req, res) {
  try {
    const clientId = (process.env.JOBBER_CLIENT_ID || '').trim();
    if (!clientId) return res.status(500).json({ error: 'JOBBER_CLIENT_ID not configured' });

    const redirectUri = `${process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.APP_URL || 'http://localhost:3001'}/api/jobber-callback`;

    const scope = 'read_clients read_quotes read_jobs';
    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);

    const authUrl =
      `https://api.getjobber.com/api/oauth/authorize` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${state}`;

    res.redirect(authUrl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
