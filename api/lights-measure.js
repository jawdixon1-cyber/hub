import Anthropic from '@anthropic-ai/sdk';

// Reads Jude's Christmas-lights measure photos. For each side of the house he
// sends a plain photo and a marked-up copy (lines drawn on the roofline with
// the feet written beside them). Claude reads every marked line, its feet, and
// sorts it into easy / medium / hard by Hey Jude's rules.

export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

const RULES = `Difficulty rules (Hey Jude's):
- easy: 1st-story roofline / eaves (worked from a ladder on the ground).
- medium: 2nd-story roofline / eaves (tall ladder from the ground).
- hard: dormers; any 2nd-story line that sits above a lower roof section that sticks out (a bump-out, porch roof or garage roof) so the crew has to work from the lower roof; anything 3rd story or higher; steep or walk-on-roof work.
If unsure between two levels, pick the harder one and say why in "reason".`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lines', 'notes'],
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['angle', 'label', 'feet', 'level', 'reason', 'possible_duplicate'],
        properties: {
          angle: { type: 'integer', description: '1-based number of the side/angle the line was read from' },
          label: { type: 'string', description: 'Short name, e.g. "Front gutter left of porch"' },
          feet: { type: 'number', description: 'Feet written on the marked-up photo for this line' },
          level: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          reason: { type: 'string', description: 'One short sentence on why this level' },
          possible_duplicate: { type: 'boolean', description: 'True if this same stretch of roofline was already counted from another angle' },
        },
      },
    },
    notes: { type: 'string', description: 'Anything unreadable or uncertain. Empty string if none.' },
  },
};

const MEDIA = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/;

function imageBlock(dataUrl) {
  const m = MEDIA.exec(dataUrl || '');
  if (!m) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the Hub server.' });
  }

  if (req.body?.mode === 'estimate') return estimateFromPhoto(req, res);

  const angles = Array.isArray(req.body?.angles) ? req.body.angles : [];
  const content = [];
  angles.forEach((a, i) => {
    const plain = imageBlock(a.plain);
    const marked = imageBlock(a.marked);
    if (!marked) return;
    content.push({ type: 'text', text: `Angle ${i + 1}${plain ? ': plain photo, then marked-up photo' : ': marked-up photo'}` });
    if (plain) content.push(plain);
    content.push(marked);
  });
  if (!content.length) return res.status(400).json({ error: 'Add at least one marked-up photo.' });

  content.push({
    type: 'text',
    text: `These are measure photos of one house for a Christmas lights roofline quote. On each marked-up photo, every line drawn on the roofline has its length in feet written next to it. Use the plain photo to see what the roof looks like under the markings.

List every marked line once: which angle it's on, a short name, the feet written for it, and its difficulty level.

${RULES}

Only report feet that are written on the photo; never estimate a length. If a number is hard to read, give your best reading and mention it in "notes". If two angles show the same stretch of roof, list it on both but set possible_duplicate true on the second one.`,
  });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'Claude declined to read these photos. Try again or enter the feet by hand.' });
    }
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) return res.status(502).json({ error: 'No answer came back. Try again.' });
    return res.status(200).json(JSON.parse(text));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: 'The Claude API key on the Hub server is invalid.' });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'Too many requests right now. Wait a minute and try again.' });
    }
    if (err instanceof Anthropic.APIError) {
      return res.status(502).json({ error: `Claude API error ${err.status}: ${err.message}` });
    }
    return res.status(500).json({ error: err.message || 'Something went wrong reading the photos.' });
  }
}

// ── Price-range estimate from ONE plain house photo (no markings) ──
// Used by the Lights Estimate page: Claude eyeballs the rooflines a standard
// install would light, guesses feet from things of known size, and rates each.
const EST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lines', 'notes', 'confidence'],
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'feet', 'level', 'reason', 'points'],
        properties: {
          label: { type: 'string', description: 'Short name, e.g. "Front 1st-story gutter"' },
          points: {
            type: 'array',
            description: 'Where this run is on the photo: 2 or more points traced along the roof edge, start to end (add a point at each corner). x = 0 (left edge) to 1000 (right edge), y = 0 (top) to 1000 (bottom).',
            items: { type: 'object', additionalProperties: false, required: ['x', 'y'], properties: { x: { type: 'integer' }, y: { type: 'integer' } } },
          },
          feet: { type: 'number', description: 'Estimated length in feet, whole number' },
          level: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          reason: { type: 'string', description: 'One short sentence on why this level' },
        },
      },
    },
    notes: { type: 'string', description: 'What you could not see (e.g. sides/back hidden) or are unsure about. Empty string if none.' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
};

async function estimateFromPhoto(req, res) {
  const photo = imageBlock(req.body?.photo);
  if (!photo) return res.status(400).json({ error: 'Add a house photo.' });
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: EST_SCHEMA } },
      messages: [{ role: 'user', content: [photo, { type: 'text', text: `This is a photo of a house a client wants Christmas lights on. Give a rough estimate for a price range (not a final quote).

${req.body?.ridgeOnly ? `List ONLY the top ridge line(s) of the roof that are VISIBLE in this photo: the peak running across the very top of each roof section (main ridge, plus any garage or wing ridges). Do NOT list eaves, gutters, gable rakes or dormers. Ridge work is walked on the roof, so rate every ridge run hard.` : `List the roofline runs a standard Hey Jude's install would light that are VISIBLE in this photo: front gutter lines / eaves and gable (rake) edges, dormers, and porch rooflines. Never ridge caps. Don't light trees, bushes or windows.`}

Estimate each run's length in feet using things of known size: a 1-car garage door is about 9 ft wide and a 2-car door 16 ft, a front door about 3 ft wide and 7 ft tall, a story is about 9-10 ft, a car about 15 ft long. Round to whole feet.

${RULES}

Light the full standard roofline even if the photo has dots or lines drawn on it (ignore any markings). The photo has a magenta grid drawn on it: lines every 100 units, numbered along the top (x) and left (y) edges, 0 at the top-left and 1000 at the right/bottom edge. The grid is only for measuring; it is not part of the house. For each run, give "points" in that grid, traced exactly on the roof edge where the bulbs would sit (the gutter line or the edge of the shingles), never in the sky or trees above the roof. Use the grid lines and their numbers to read each point's x and y carefully, and add a point at every corner or peak. Only list what you can see in this photo; mention hidden sides in "notes". Never mention prices. Set confidence low if the photo is far away, blurry, at a sharp angle or partly blocked.` }] }],
    });
    if (response.stop_reason === 'refusal') return res.status(422).json({ error: 'Claude declined to read this photo. Try another photo.' });
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) return res.status(502).json({ error: 'No answer came back. Try again.' });
    return res.status(200).json(JSON.parse(text));
  } catch (err) {
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API error ${err.status}: ${err.message}` });
    return res.status(500).json({ error: err.message || 'Something went wrong reading the photo.' });
  }
}
