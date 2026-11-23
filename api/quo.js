import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

// Quo (formerly OpenPhone) texts for the Work text step.
//   GET  /api/quo?action=inbox  → threads where the client texted last (waiting on us)
//   POST /api/quo?action=draft  → Claude drafts a reply for one thread
//   POST /api/quo?action=send   → sends a reply (only on Jude's tap); thread stays open in Quo
//   POST /api/quo?action=done   → marks a thread Done in Quo without replying (Hide button)
// Owner-only. Needs QUO_API_KEY (Quo → Settings → API).

const QUO = process.env.QUO_API_BASE || 'https://api.quo.com/v1';
// Open threads (not marked Done in Quo) with activity in this window. Quo marks a
// Done thread as snoozed until year 3026, so "open" = not snoozed into the future.
const LOOKBACK_DAYS = 120;
const MAX_THREADS = 250; // safety cap on threads checked per load

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function quo(path, opts = {}) {
  let r;
  for (let attempt = 0; ; attempt++) {
    r = await fetch(`${QUO}${path}`, {
      ...opts,
      headers: { Authorization: process.env.QUO_API_KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    // Quo allows ~10 requests/sec; back off and retry reads (never retry a send).
    if (r.status !== 429 || opts.method === 'POST' || attempt >= 4) break;
    await wait(600 * (attempt + 1));
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(body?.message || body?.title || `Quo API error ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return body;
}

// Every conversation with activity since `since` (Quo pages at 100).
async function allConversations(since) {
  const out = [];
  let pageToken = null;
  for (let page = 0; page < 10; page++) {
    const b = await quo(`/conversations?maxResults=100&updatedAfter=${encodeURIComponent(since)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    out.push(...(b.data || []));
    if (!b.nextPageToken) break;
    pageToken = b.nextPageToken;
  }
  return out;
}

const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// Quo contacts are synced from Jobber, so they're the best name source.
// Cached for 15 minutes; a contact with a "Jobber ID" field counts as a client.
let contactCache = { at: 0, map: null };
async function quoContactsByPhone() {
  if (contactCache.map && Date.now() - contactCache.at < 15 * 60e3) return contactCache.map;
  const map = {};
  let pageToken = null;
  for (let page = 0; page < 60; page++) {
    const { data, nextPageToken } = await quo(`/contacts?maxResults=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    for (const c of data || []) {
      const f = c.defaultFields || {};
      const name = [f.firstName, f.lastName].filter(Boolean).join(' ') || f.company;
      if (!name) continue;
      const isClient = (c.customFields || []).some((x) => /jobber id/i.test(x.name || '') && x.value);
      for (const p of f.phoneNumbers || []) {
        const k = last10(p?.value);
        if (k.length === 10 && !map[k]) map[k] = { name, isClient };
      }
    }
    if (!nextPageToken) break;
    pageToken = nextPageToken;
  }
  contactCache = { at: Date.now(), map };
  return map;
}

async function clientNamesByPhone(db) {
  const map = {};
  const { data } = await db.from('clients').select('first_name, last_name, company_name, phones').not('phones', 'is', null);
  for (const c of data || []) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name;
    if (!name) continue;
    for (const p of c.phones || []) {
      const k = last10(p?.number);
      if (k.length === 10 && !map[k]) map[k] = name;
    }
  }
  return map;
}

// Run async fn over items, a few at a time (Quo rate-limits bursts).
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n]).catch((e) => ({ error: e.message })); }
  }));
  return out;
}

export async function handleInbox(req, res, db) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString();
  const [{ data: numbers }, convos, names, contacts] = await Promise.all([
    quo('/phone-numbers'),
    allConversations(since),
    clientNamesByPhone(db),
    quoContactsByPhone().catch(() => ({})),
  ]);
  const ourNumbers = new Set((numbers || []).map((n) => last10(n.number)));

  const candidates = convos
    .filter((c) => !c.deletedAt && (c.participants || []).length === 1 && /^\+/.test(c.participants[0]))
    .filter((c) => !c.snoozedUntil || new Date(c.snoozedUntil) < new Date())
    .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt))
    .slice(0, MAX_THREADS);

  const threads = await pool(candidates, 5, async (c) => {
    const phone = c.participants[0];
    const who = `phoneNumberId=${c.phoneNumberId}&participants=${encodeURIComponent(phone)}`;
    const [{ data }, callRes] = await Promise.all([
      quo(`/messages?${who}&maxResults=40`),
      quo(`/calls?${who}&maxResults=10`).catch(() => ({ data: [] })),
    ]);
    const calls = (callRes.data || []).map((k) => ({
      id: k.id, type: 'call', dir: k.direction, status: k.status, duration: k.duration || 0, at: k.createdAt, ai: !!k.aiHandled,
    }));
    const msgs = (data || [])
      .filter((m) => m.text || (m.media || []).length)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((m) => ({ id: m.id, dir: m.direction, text: m.text || '', media: (m.media || []).filter((x) => x?.url).map((x) => ({ url: x.url, type: x.type || '' })), at: m.createdAt }));
    const lastMsg = msgs[msgs.length - 1];
    // What happened last: their text (needs a reply), our text (waiting on them), or a call.
    const textIsLast = lastMsg && Math.abs(new Date(lastMsg.at) - new Date(c.lastActivityAt)) < 2 * 60e3;
    // Calls sort the same way as texts: they reached out last → reply; we did → waiting.
    const lastCall = calls.length ? calls.reduce((a, b) => (new Date(a.at) > new Date(b.at) ? a : b)) : null;
    const viaCall = !textIsLast && !!lastCall;
    const lastDir = viaCall ? lastCall.dir : lastMsg?.dir;
    const kind = lastDir === 'outgoing' ? 'waiting' : 'reply';
    return {
      kind,
      viaCall,
      id: c.id,
      phoneNumberId: c.phoneNumberId,
      phone,
      name: contacts[last10(phone)]?.name || names[last10(phone)] || c.name || null,
      isClient: !!(contacts[last10(phone)]?.isClient || names[last10(phone)]),
      isContact: !!contacts[last10(phone)],
      lastAt: c.lastActivityAt,
      lastMessageId: c.lastActivityId || lastMsg?.id || c.id, // changes on any new text/call
      // Texts and calls in one timeline, oldest first.
      messages: [...msgs, ...calls].sort((a, b) => new Date(a.at) - new Date(b.at)),
    };
  });

  const open = threads.filter((t) => t && !t.error && !ourNumbers.has(last10(t.phone)));
  const failed = threads.filter((t) => t?.error).length;
  await enrichCalls(open);
  await guessNames(open);
  return res.json({ threads: open, failed, lookbackDays: LOOKBACK_DAYS });
}

// Attach Quo's AI summary of the latest real call to call threads and unnamed threads.
async function enrichCalls(threads) {
  const want = threads.filter((t) => t.viaCall || !t.name);
  await pool(want, 4, async (t) => {
    const k = [...t.messages].reverse().find((m) => m.type === 'call' && m.duration > 0);
    if (!k) return;
    const d = await callDetails(k.id);
    t.lastCall = { id: k.id, summary: d.summary, nextSteps: d.nextSteps, voicemail: d.voicemail?.transcript || '' };
  });
}

// Like Quo's caller guesses: for numbers with no contact name, Claude reads the call
// summaries and texts and pulls out the caller's name if they said it. Cached per thread state.
const AI_NAMES = false; // AI name-guessing OFF: it ran on every inbox load (slow + costs money)
const nameCache = new Map();
async function guessNames(threads) {
  const unnamed = threads.filter((t) => !t.name);
  const todo = unnamed.filter((t) => !nameCache.has(`${t.id}:${t.lastMessageId}`));
  if (AI_NAMES && todo.length && process.env.ANTHROPIC_API_KEY) {
    const items = todo.map((t) => ({
      id: t.id,
      callSummary: (t.lastCall?.summary || []).join(' '),
      voicemail: t.lastCall?.voicemail || '',
      theirTexts: t.messages.filter((m) => m.type !== 'call' && m.dir === 'incoming').slice(-5).map((m) => m.text).join(' | '),
    }));
    try {
      const client = new Anthropic();
      const r = await client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: {
          type: 'object', additionalProperties: false, required: ['names'],
          properties: { names: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'name'],
            properties: { id: { type: 'string' }, name: { type: 'string', description: 'Their name, or empty string if unknown' } } } } },
        } } },
        messages: [{ role: 'user', content: `Each item is a phone contact of Jude (owner of Hey Jude's Lawn Care) with no saved name. From the call summary, voicemail, and their texts, give the name of the person on the other end (not Jude, not Jude Wilson). Include the business if it's a company (e.g. "Puneet (Neighborhood Services)"). Empty string if they never said a name.

${JSON.stringify(items)}` }],
      });
      const text = r.content.find((b) => b.type === 'text')?.text;
      const names = text ? JSON.parse(text).names : [];
      for (const t of todo) nameCache.set(`${t.id}:${t.lastMessageId}`, (names.find((n) => n.id === t.id)?.name || '').trim());
    } catch (err) {
      console.error('[quo guessNames]', err.message);
    }
  }
  for (const t of unnamed) {
    const g = nameCache.get(`${t.id}:${t.lastMessageId}`);
    if (g) t.guessedName = g;
  }
}

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['needs_reply', 'draft', 'summary'],
  properties: {
    needs_reply: { type: 'boolean', description: 'False if the last client text needs no answer (e.g. "thanks!", a thumbs up, an auto-reply, spam).' },
    draft: { type: 'string', description: 'The reply text to send. Empty string if needs_reply is false.' },
    summary: { type: 'string', description: 'One short line on what they want, for the inbox list.' },
  },
};

const DRAFT_RULES = `You draft text-message replies for Jude, owner of Hey Jude's Lawn Care in Rock Hill, SC (lawn mowing plans, one-time cleanups, Christmas lights installs). Jude reviews every draft before it sends.

How Jude texts: short, warm, plain, like a real local business owner. One to three sentences. No emojis unless the client used them. No sign-off needed (it's a text thread), and never "Dear".

Rules:
- Say "clients", never "customers".
- Never invent prices, dates, times, or crew details you can't see in the thread. If the reply needs one, put a clear placeholder in brackets, e.g. [day] or [price], so Jude fills it in.
- Never promise things that might not stay true: no "same crew every time", "no commitment", "cancel anytime", guaranteed arrival times.
- Patios, walls, fire pits and other hardscaping: be interested and offer to take a look, but don't promise the work.
- If they're asking for a quote, thank them and say Jude will get them a quote; ask for the address if it isn't in the thread.
- If a past message from Jude already answered it, don't repeat it.
- If they sent photos, use what you can see (e.g. the yard, the roofline, a problem spot) but don't guess measurements or prices from a photo. If the photo is a payment, a receipt, or just a thank-you, a short acknowledgment is enough.`;

export async function handleDraft(req, res) {
  const { messages, name, kind } = req.body || {};
  if (!Array.isArray(messages) || (!messages.length && kind !== 'call')) return res.status(400).json({ error: 'messages required' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the Hub server.' });

  const recent = messages.slice(-20);
  // Pull Quo's AI summaries for the last few calls so drafts know what was said on the phone.
  const callIds = recent.filter((m) => m.type === 'call' && /^AC/.test(m.id || '')).slice(-3).map((m) => m.id);
  const callInfo = Object.fromEntries(await Promise.all(callIds.map(async (id) => [id, await callDetails(id).catch(() => null)])));
  const nMedia = (m) => (Array.isArray(m.media) ? m.media.length : Number(m.media) || 0);
  const transcript = recent.map((m) => {
    const who = m.dir === 'incoming' ? (name || 'Client') : 'Jude';
    const when = new Date(m.at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    if (m.type === 'call') {
      const info = callInfo[m.id];
      const mins = Math.round((m.duration || 0) / 60);
      const head = `[${when}] Phone call, ${m.dir === 'incoming' ? `${name || 'client'} called Jude` : `Jude called ${name || 'client'}`} (${m.duration ? `${mins || '<1'} min` : m.status || 'not answered'})`;
      const parts = [];
      if (info?.summary?.length) parts.push(`Call summary: ${info.summary.join(' ')}`);
      if (info?.nextSteps?.length) parts.push(`Next steps from the call: ${info.nextSteps.join('; ')}`);
      if (info?.voicemail?.transcript) parts.push(`Voicemail: "${info.voicemail.transcript}"`);
      return [head, ...parts].join('\n  ');
    }
    const n = nMedia(m);
    return `[${when}] ${who}: ${m.text}${n ? ` [sent ${n} photo${n > 1 ? 's' : ''}]` : ''}`;
  }).join('\n') || '(no texts yet, only a phone call)';
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' });

  // Let Claude see the client's most recent photos (up to 4 from the last few texts).
  const photos = recent.slice(-6)
    .filter((m) => m.dir === 'incoming' && Array.isArray(m.media))
    .flatMap((m) => m.media)
    .filter((x) => /^https:\/\//.test(x.url || '') && (!x.type || /^image\/(jpeg|png|gif|webp)/.test(x.type)))
    .slice(-4);

  const ask0 = `Today is ${today}. Text thread with ${name || 'a contact (not matched to a client)'}:\n\n${transcript}\n\n__PHOTOS__${kind === 'waiting'
    ? "Jude texted last and hasn't heard back. Draft a short, friendly follow-up nudge (set needs_reply false if a follow-up doesn't make sense)."
    : kind === 'call'
      ? "The most recent contact was a phone call (see the call summary above if there is one). Draft a short text following up on that call, building on what was discussed."
      : "Draft Jude's reply to the last message."}`;
  // Download the photos here (Quo's links block outside fetchers) and hand them to Claude inline.
  const images = (await Promise.all(photos.map(async (x) => {
    try {
      const r = await fetch(x.url);
      const type = (r.headers.get('content-type') || x.type || '').split(';')[0];
      if (!r.ok || !/^image\/(jpeg|png|gif|webp)$/.test(type)) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 4.5 * 1024 * 1024) return null;
      return { type: 'image', source: { type: 'base64', media_type: type, data: buf.toString('base64') } };
    } catch { return null; }
  }))).filter(Boolean);
  const ask = ask0.replace('__PHOTOS__', images.length ? `Their most recent photo${images.length > 1 ? 's are' : ' is'} attached above. ` : '');
  const content = (withPhotos) => withPhotos && images.length
    ? [...images, { type: 'text', text: ask }]
    : ask;

  const client = new Anthropic();
  const create = (withPhotos) => client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
    system: DRAFT_RULES,
    messages: [{ role: 'user', content: content(withPhotos) }],
  });
  try {
    let response;
    try {
      response = await create(true);
    } catch (err) {
      // A photo link Claude can't open shouldn't block the draft; retry without photos.
      if (!(images.length && err instanceof Anthropic.BadRequestError)) throw err;
      console.warn('[quo draft] photos rejected, retrying without:', err.message);
      response = await create(false);
    }
    if (response.stop_reason === 'refusal') return res.status(422).json({ error: 'Claude declined to draft this one. Write it by hand.' });
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) return res.status(502).json({ error: 'No draft came back. Try again.' });
    return res.json(JSON.parse(text));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: 'The Claude API key on the Hub server is invalid.' });
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Too many drafts at once. Try again in a minute.' });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API error ${err.status}: ${err.message}` });
    console.error('[quo draft]', err);
    return res.status(500).json({ error: err.message || 'Draft failed' });
  }
}

// Contact history for specific phone numbers (texts + calls on every Quo line), for Leads:
// POST { phones: [...] } → { results: [{ phone, messages: [{ dir, at, call }] }] }
async function handleContacts(req, res) {
  const phones = [...new Set((req.body?.phones || []).map(String).filter((p) => last10(p).length === 10))].slice(0, 25);
  const { data: numbers } = await quo('/phone-numbers');
  const lines = (numbers || []).map((n) => n.id);
  const e164 = (p) => `+1${last10(p)}`;
  const results = await pool(phones, 3, async (phone) => {
    const per = await Promise.all(lines.map(async (lineId) => {
      const who = `phoneNumberId=${lineId}&participants=${encodeURIComponent(e164(phone))}`;
      const [m, c] = await Promise.all([
        quo(`/messages?${who}&maxResults=40`).catch(() => ({ data: [] })),
        quo(`/calls?${who}&maxResults=20`).catch(() => ({ data: [] })),
      ]);
      return [
        ...(m.data || []).map((x) => ({ dir: x.direction, at: x.createdAt, call: false })),
        ...(c.data || []).map((x) => ({ dir: x.direction, at: x.createdAt, call: true })),
      ];
    }));
    return { phone, messages: per.flat().sort((a, b) => new Date(a.at) - new Date(b.at)) };
  });
  res.json({ results });
}

async function handleSend(req, res) {
  const { phoneNumberId, to, content, markDone } = req.body || {};
  const text = String(content || '').trim();
  if (!/^PN/.test(String(phoneNumberId || ''))) return res.status(400).json({ error: 'Bad phoneNumberId' });
  if (!/^\+\d{10,15}$/.test(String(to || ''))) return res.status(400).json({ error: 'Bad recipient number' });
  if (!text || text.length > 1600) return res.status(400).json({ error: 'Message must be 1–1600 characters' });
  const body = { content: text, from: phoneNumberId, to: [to] };
  if (markDone) body.setInboxStatus = 'done';
  const { data } = await quo('/messages', { method: 'POST', body: JSON.stringify(body) });
  return res.json({ ok: true, id: data?.id, status: data?.status });
}

// Quo's AI summary, next steps, transcript, and voicemail for one call. Missing pieces come back null.
async function callDetails(callId) {
  const opt = (p) => quo(p).then((b) => b.data || null).catch(() => null);
  const [summary, transcript, voicemail] = await Promise.all([
    opt(`/call-summaries/${callId}`),
    opt(`/call-transcripts/${callId}`),
    opt(`/call-voicemails/${callId}`),
  ]);
  return {
    summary: summary?.summary || [],
    nextSteps: summary?.nextSteps || [],
    transcript: (transcript?.dialogue || []).map((d) => ({ jude: !!d.userId, text: d.content, start: d.start })),
    voicemail: voicemail ? { transcript: voicemail.transcript || '', url: voicemail.recordingUrl || null, duration: voicemail.duration || 0 } : null,
  };
}

async function handleCall(req, res) {
  const id = String(req.query?.id || '');
  if (!/^AC[\w-]+$/.test(id)) return res.status(400).json({ error: 'Bad call id' });
  return res.json(await callDetails(id));
}

async function handleDone(req, res) {
  const id = String(req.body?.conversationId || '');
  if (!/^CN[\w-]+$/.test(id)) return res.status(400).json({ error: 'Bad conversationId' });
  await quo(`/conversations/${id}/mark-as-done`, { method: 'POST' });
  return res.json({ ok: true });
}

export default async function handler(req, res) {
  const db = getSupabaseAdmin();
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  if (who?.user?.user_metadata?.role !== 'owner') return res.status(401).json({ error: 'Log in to the Hub as the owner first.' });
  if (!process.env.QUO_API_KEY) {
    return res.status(503).json({ error: 'QUO_API_KEY is not set on the Hub server.', setup: true });
  }

  const action = req.query?.action;
  try {
    if (action === 'inbox' && req.method === 'GET') return await handleInbox(req, res, db);
    if (action === 'draft' && req.method === 'POST') return await handleDraft(req, res);
    if (action === 'send' && req.method === 'POST') return await handleSend(req, res);
    if (action === 'contacts' && req.method === 'POST') return await handleContacts(req, res);
    if (action === 'done' && req.method === 'POST') return await handleDone(req, res);
    if (action === 'call' && req.method === 'GET') return await handleCall(req, res);
    return res.status(400).json({ error: 'action must be inbox (GET), draft, send or done (POST)' });
  } catch (err) {
    console.error(`[quo ${action}]`, err.status || '', err.message);
    const status = err.status === 401 ? 502 : (err.status || 500);
    const msg = err.status === 401 ? 'Quo rejected the API key. Check QUO_API_KEY.' : err.message;
    return res.status(status).json({ error: msg });
  }
}
