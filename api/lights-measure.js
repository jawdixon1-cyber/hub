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
