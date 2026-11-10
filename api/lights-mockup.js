// AI Christmas-lights mockup. The browser sends the house photo with Jude's
// roofline lines painted on it in magenta; an image-editing model turns it into
// a night photo with C9 bulbs exactly on those lines and nowhere else.
// (Claude reads photos but doesn't generate images, so this uses OpenAI's
// image edit endpoint with the key the receipt scanner already uses.)

import { NIGHT_PROMPT, buildPrompt } from '../src/lib/lightsPrompt.js';

export const config = { api: { bodyParser: { sizeLimit: '12mb' } }, maxDuration: 180 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the Hub server.' });

  const { image, design, custom, mode } = req.body || {};
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(image || '');
  if (!m) return res.status(400).json({ error: 'Send the guide photo as a data URL.' });

  const form = new FormData();
  form.append('model', process.env.OPENAI_IMAGE_MODEL || 'chatgpt-image-latest');
  form.append('prompt', mode === 'night' ? NIGHT_PROMPT : buildPrompt(design, custom));
  form.append('image', new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }), `house.${m[1].split('/')[1]}`);
  form.append('size', 'auto');
  form.append('quality', process.env.OPENAI_IMAGE_QUALITY || 'medium');
  form.append('input_fidelity', 'high');
  form.append('n', '1');

  try {
    const r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = body?.error?.message || `OpenAI error ${r.status}`;
      return res.status(502).json({ error: msg });
    }
    const b64 = body?.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: 'No image came back. Try again.' });
    return res.status(200).json({ image: `data:image/png;base64,${b64}` });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Mockup failed.' });
  }
}
