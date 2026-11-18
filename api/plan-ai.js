import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

// POST /api/plan-ai → Claude organizes one day for Jude (only when he taps "Organize my day").
// It only SUGGESTS: a top 3, a time-blocked plan around his fixed schedule, and moves for
// list items (pull into today, push to can-wait, …). The page applies nothing until Jude taps Apply.

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['top3', 'blocks', 'moves', 'note'],
  properties: {
    top3: { type: 'array', items: { type: 'string' }, description: 'The 3 most important things to get done that day, short.' },
    blocks: {
      type: 'array', description: 'Time-blocked plan for the day, in order, fitting around fixed events.',
      items: { type: 'object', additionalProperties: false, required: ['time', 'what'], properties: {
        time: { type: 'string', description: 'e.g. "7:00–8:00 AM"' }, what: { type: 'string' } } },
    },
    moves: {
      type: 'array', description: 'Suggested moves for existing list items (by id). Only include items worth moving.',
      items: { type: 'object', additionalProperties: false, required: ['id', 'to', 'why'], properties: {
        id: { type: 'string' },
        to: { type: 'string', enum: ['today', 'cantWait', 'canWait', 'implement', 'done'] },
        why: { type: 'string' } } },
    },
    note: { type: 'string', description: 'One or two sentences: anything he should know (overbooked, a conflict, a habit he keeps skipping).' },
  },
};

const RULES = `You plan the day for Jude, owner of Hey Jude's Lawn Care (lawn plans, cleanups, Christmas lights; small crew: Ethan, Braden).
He plans at 5 PM for the next day. Be practical and realistic: fixed events and the crew's Jobber visits are given; don't schedule over his own fixed events.
Pick a top 3 that moves the business or clears something urgent. Pull "can't wait" items into today when there's room; push low-value items to "can wait".
Keep every line short, in his words where possible. Never invent appointments, people or facts.`;

export default async function handler(req, res) {
  const db = getSupabaseAdmin();
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  if (who?.user?.user_metadata?.role !== 'owner') return res.status(401).json({ error: 'Log in to the Hub as the owner first.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { date, events = [], visits = [], today = [], lists = {}, goals = [], habits = [] } = req.body || {};
  const line = (x) => `- [${x.id}] ${x.text}${x.done ? ' (done)' : ''}`;
  const t = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  const crewStops = visits.reduce((m, v) => { for (const c of v.crew?.length ? v.crew : ['Unassigned']) m[c] = (m[c] || 0) + 1; return m; }, {});
  const prompt = `Plan for ${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}.

Fixed calendar events:
${events.map((e) => `- ${e.allDay ? 'All day' : `${t(e.start)}–${t(e.end)}`}: ${e.title} (${e.calendar})`).join('\n') || '- none'}

Crew's Jobber visits: ${Object.entries(crewStops).map(([c, n]) => `${c} ${n}`).join(', ') || 'none'}
${visits.filter((v) => v.crew?.some((c) => /^jude/i.test(c))).map((v) => `- Jude's stop: ${v.allDay ? 'all day' : t(v.start)} ${v.client || v.title}`).join('\n')}

Today's to-dos:
${today.map(line).join('\n') || '- none yet'}

Can't wait:
${(lists.cantWait || []).filter((x) => !x.done).map(line).join('\n') || '- none'}

Implement (ideas/systems to build):
${(lists.implement || []).filter((x) => !x.done).map(line).join('\n') || '- none'}

Can wait:
${(lists.canWait || []).filter((x) => !x.done).map(line).join('\n') || '- none'}

Brain dump (unsorted):
${(lists.brainDump || []).filter((x) => !x.done).map(line).join('\n') || '- none'}

Goals: ${goals.filter((g) => !g.done).map((g) => g.text).join('; ') || 'none'}
Daily habits: ${habits.map((h) => h.name).join('; ') || 'none'}`;

  const client = new Anthropic();
  try {
    const r = await client.beta.messages.create({
      model: 'claude-opus-5-5', max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: RULES,
      messages: [{ role: 'user', content: prompt }],
    });
    if (r.stop_reason === 'refusal') return res.status(422).json({ error: 'Claude declined. Try again.' });
    const text = r.content.find((b) => b.type === 'text')?.text;
    if (!text) return res.status(502).json({ error: 'No plan came back. Try again.' });
    return res.json(JSON.parse(text));
  } catch (err) {
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API error ${err.status}: ${err.message}` });
    return res.status(500).json({ error: err.message || 'Plan failed' });
  }
}
