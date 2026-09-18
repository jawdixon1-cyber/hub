// ─── Live Google review count ───
//
// The website is served by Go High Level as static HTML, so it cannot fetch
// Google itself without shipping an API key in the page source. This endpoint
// is the proxy: the key stays here, the browser only ever sees a number.
//
// Same shape as the hiring page's call into /api/messaging — GHL serves the
// page, the browser talks to hub.heyjudeslawncare.com. The only difference is
// that this is cross-origin and read-only, so it needs CORS and no auth.
//
//   GET /api/reviews  ->  { rating: 4.9, count: 166, cachedAt: "...", stale: false }
//
// The page always renders a real number baked in at build time and only
// replaces it if this call succeeds. A failure here is invisible to visitors.

const PLACE_ID = process.env.GOOGLE_PLACE_ID;
const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Places Details is billed per call. Cache hard — a review count that is six
// hours stale is indistinguishable from live, and this keeps the bill at cents.
const TTL_MS = 6 * 60 * 60 * 1000;

// Warm across invocations on the same instance. Vercel reuses these often
// enough that most requests never touch Google.
let cache = globalThis.__reviewCache || (globalThis.__reviewCache = { data: null, at: 0 });

const ALLOWED = new Set([
  'https://heyjudeslawncare.com',
  'https://www.heyjudeslawncare.com',
  'http://localhost:5173',
]);

async function fetchFromGoogle() {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', PLACE_ID);
  url.searchParams.set('fields', 'rating,user_ratings_total');
  url.searchParams.set('key', API_KEY);

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`places http ${res.status}`);
  const body = await res.json();
  if (body.status !== 'OK') {
    throw new Error(`places status ${body.status}: ${body.error_message || 'no detail'}`);
  }
  return {
    rating: body.result?.rating ?? null,
    count: body.result?.user_ratings_total ?? null,
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  if (!PLACE_ID || !API_KEY) {
    return res.status(503).json({
      error: 'not configured',
      hint: 'Set GOOGLE_PLACE_ID and GOOGLE_PLACES_API_KEY in the Vercel project.',
    });
  }

  const fresh = Date.now() - cache.at < TTL_MS;
  if (cache.data && fresh) {
    // Let the CDN hold it too, so most hits never reach this function.
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json({ ...cache.data, cachedAt: new Date(cache.at).toISOString(), stale: false });
  }

  try {
    const data = await fetchFromGoogle();
    cache = globalThis.__reviewCache = { data, at: Date.now() };
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json({ ...data, cachedAt: new Date(cache.at).toISOString(), stale: false });
  } catch (err) {
    // Serving a stale number beats serving an error — the page would rather
    // keep yesterday's count than fall back to whatever was hard-coded.
    if (cache.data) {
      return res.status(200).json({
        ...cache.data,
        cachedAt: new Date(cache.at).toISOString(),
        stale: true,
      });
    }
    console.error('[reviews]', err);
    return res.status(502).json({ error: 'upstream failed' });
  }
}
