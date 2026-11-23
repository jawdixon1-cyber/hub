import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { personalAccount, isPersonal, imapInbox, imapThread, imapArchive, imapTrash, imapLabels, imapTag, imapSend } from '../lib/gmailImap.js';

// Gmail for the Work email step (owner only).
//   GET  /api/gmail?action=accounts            → connected inboxes
//   GET  /api/gmail?action=connect&returnTo=/… → Google sign-in URL for one more inbox
//   GET  /api/gmail-callback                   → Google sends the user back here
//   GET  /api/gmail?action=inbox&account=…     → inbox threads, sorted into reply / archive / fyi
//   GET  /api/gmail?action=thread&account=…&id=… → full thread text
//   POST /api/gmail?action=archive|unarchive   → { account, ids: [] }
//   POST /api/gmail?action=draft               → Claude reply draft (only when Jude taps the button)
//   POST /api/gmail?action=send                → reply in the thread (only on Jude's tap)
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_TOKEN_KEY (64 hex chars; encrypts stored tokens).

// Gmail + read-only Calendar (the Plan page reads the work calendar through this same sign-in).
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.readonly';
const ACCT = 'gmail-acct:';
const STATE = 'gmail-oauth-state:';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

/* ── token encryption (tokens live in app_state, so never store them in plain text) ── */
function key() {
  const k = process.env.GMAIL_TOKEN_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(k)) throw Object.assign(new Error('GMAIL_TOKEN_KEY is missing on the Hub server.'), { status: 503, setup: true });
  return Buffer.from(k, 'hex');
}
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob) {
  const [iv, tag, enc] = String(blob).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

/* ── OAuth ── */
// The callback address must match one registered in Google Cloud exactly. Locally the
// Vite proxy rewrites Host to :3001, so take the page's own origin from Referer, allowlisted.
const ORIGINS = ['http://localhost:5173', 'https://hub.heyjudeslawncare.com'];
function siteOrigin(req) {
  try {
    const o = new URL(req.headers.referer || '').origin;
    if (ORIGINS.includes(o)) return o;
  } catch { /* fall through */ }
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const o = `${proto}://${host}`;
  return ORIGINS.includes(o) ? o : ORIGINS[1];
}
const redirectFor = (origin) => `${origin}/api/gmail-callback`;

async function googleToken(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const b = await r.json();
  if (!r.ok) throw Object.assign(new Error(b.error_description || b.error || 'Google sign-in failed'), { status: 502 });
  return b;
}

const tokenCache = new Map(); // account → { token, exp }
export async function accessToken(db, account) {
  const hit = tokenCache.get(account);
  if (hit && hit.exp > Date.now() + 60e3) return hit.token;
  const { data } = await db.from('app_state').select('value').eq('key', ACCT + account).maybeSingle();
  if (!data?.value?.refresh) throw Object.assign(new Error(`${account} isn't connected. Connect it again.`), { status: 401, reconnect: true });
  let t;
  try {
    t = await googleToken({ grant_type: 'refresh_token', refresh_token: decrypt(data.value.refresh) });
  } catch (e) {
    throw Object.assign(new Error(`Google sign-in for ${account} expired. Connect it again.`), { status: 401, reconnect: true, cause: e });
  }
  tokenCache.set(account, { token: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 });
  return t.access_token;
}

async function gmail(db, account, path, opts = {}) {
  const token = await accessToken(db, account);
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${GMAIL}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    if (r.status === 429 && attempt < 3) { await new Promise((ok) => setTimeout(ok, 700 * (attempt + 1))); continue; }
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(b.error?.message || `Gmail error ${r.status}`), { status: r.status === 401 ? 401 : 502 });
    return b;
  }
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n]).catch((e) => ({ error: e.message })); }
  }));
  return out;
}

/* ── message parsing ── */
const header = (msg, name) => (msg.payload?.headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
const b64 = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const addr = (s) => (String(s).match(/<([^>]+)>/)?.[1] || String(s)).trim().toLowerCase();
const nameOf = (s) => String(s).replace(/<[^>]+>/, '').replace(/"/g, '').trim() || addr(s);

function htmlToText(html) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();
}
function bodyText(payload) {
  let plain = '', html = '';
  const walk = (p) => {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body?.data && !plain) plain = b64(p.body.data);
    else if (p.mimeType === 'text/html' && p.body?.data && !html) html = b64(p.body.data);
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return (plain || htmlToText(html)).trim();
}
// Drop the quoted earlier emails ("On Mon, X wrote:" and "> " lines) so each message shows only what's new.
function stripQuoted(text) {
  const cut = text.search(/\n(On .{5,200}wrote:|-{2,}\s*Original Message|From: .+\nSent: )/i);
  const t = cut > 0 ? text.slice(0, cut) : text;
  return t.split('\n').filter((l) => !/^>/.test(l)).join('\n').trim();
}

/* ── triage (no AI: Gmail's own categories and headers) ── */
const NOREPLY = /(no-?reply|do-?not-?reply|notifications?@|mailer-daemon|alerts?@|news(letter)?@|updates?@|info@.*(mail|send)|bounce)/i;
// Bills, invoices, failed payments, tax forms: never bulk-archived. (Plain receipts and order emails don't count.)
const MONEY = /\b(invoice|bill(ing)? (is )?(ready|due|available)|your bill|payment (due|failed|declined|reminder|overdue)|past due|overdue|amount due|balance due|statement (is )?(ready|available)|autopay|card (was )?declined|1099|w-?9|tax (form|notice|return)|action required)\b/i;
function bucket(t, me) {
  if (addr(t.lastFrom) === me) return 'waiting';
  if (MONEY.test(`${t.subject} ${t.snippet}`)) return 'money';
  const labels = t.labels;
  if (labels.some((l) => /^CATEGORY_(PROMOTIONS|SOCIAL|UPDATES|FORUMS)$/.test(l))) return 'archive';
  if (t.unsubscribe || NOREPLY.test(addr(t.lastFrom))) return 'archive';
  return 'reply';
}

/* ── Jude's own Gmail labels ("1 Jude", "2 Waiting", "3 Returns", "4 Newsletters"): match by word ── */
const TAGS = [['jude', /\bjude\b/i], ['waiting', /waiting/i], ['returns', /return/i], ['receipts', /^\W*\d*\s*receipts?$/i], ['newsletters', /newsletter/i]];
const pickTags = (names) => TAGS.map(([key, re]) => ({ key, name: names.find((n) => re.test(n)) })).filter((x) => x.name);
const RETURNS = /\breturns?\b|\brma\b|return label|refund/i;
// Free rule-based suggestion (no AI): which of your labels this email probably belongs in.
function suggestTag(row, b) {
  if (RETURNS.test(`${row.subject} ${row.snippet}`)) return 'returns';
  if (b === 'waiting') return 'waiting';
  if (b === 'money') return 'receipts';
  if (b === 'archive') return 'newsletters';
  if (b === 'reply') return 'jude';
  return null;
}
const withTags = (row, b, tags, has) => {
  const key = suggestTag(row, b);
  return { tags: has, suggest: tags.find((x) => x.key === key)?.name || null };
};

/* ── handlers ── */
async function handleAccounts(req, res, db) {
  const { data } = await db.from('app_state').select('key, value').like('key', `${ACCT}%`);
  const accounts = (data || []).map((r) => ({ email: r.key.slice(ACCT.length), kind: 'oauth', connectedAt: r.value?.at }));
  const personal = personalAccount();
  if (personal) accounts.push({ email: personal.user, kind: 'imap', personal: true });
  res.json({ accounts, personalSetup: !personal });
}

async function handleConnect(req, res, db, user) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set on the Hub server.', setup: true });
  }
  key(); // make sure tokens can be stored before sending Jude to Google
  const state = crypto.randomBytes(24).toString('hex');
  const returnTo = String(req.query?.returnTo || '/');
  const origin = siteOrigin(req);
  // app_state rows need an org_id: use the owner's org (carried through to the callback).
  const { data: mem } = await db.from('org_members').select('org_id').eq('user_id', user.id).limit(1).maybeSingle();
  if (!mem?.org_id) return res.status(500).json({ error: "Couldn't find your Hub organization." });
  const { error: stErr } = await db.from('app_state').upsert({ key: STATE + state, org_id: mem.org_id, value: { at: Date.now(), origin, orgId: mem.org_id, returnTo: returnTo.startsWith('/') ? returnTo : '/' } }, { onConflict: 'key' });
  if (stErr) return res.status(500).json({ error: `Couldn't start sign-in: ${stErr.message}` });
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectFor(origin),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent select_account',
    state,
  });
  res.json({ url });
}

async function handleCallback(req, res, db) {
  const { code, state, error } = req.query || {};
  const { data: st } = state ? await db.from('app_state').select('value').eq('key', STATE + state).maybeSingle() : { data: null };
  if (state) await db.from('app_state').delete().eq('key', STATE + state);
  const origin = ORIGINS.includes(st?.value?.origin) ? st.value.origin : '';
  const back = (msg) => res.redirect(302, `${origin}${st?.value?.returnTo || '/'}${msg ? `?gmail=${encodeURIComponent(msg)}` : ''}`);
  if (!st?.value || Date.now() - st.value.at > 15 * 60e3) return back('Sign-in link expired. Try Connect again.');
  if (error || !code) return back(error === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in failed.');
  try {
    const t = await googleToken({ grant_type: 'authorization_code', code, redirect_uri: redirectFor(origin || ORIGINS[1]) });
    if (!t.refresh_token) return back('Google did not return a long-term sign-in. Remove the Hub app at myaccount.google.com/permissions and connect again.');
    const profile = await fetch(`${GMAIL}/profile`, { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json());
    const email = String(profile.emailAddress || '').toLowerCase();
    if (!email) return back('Could not read the Gmail address.');
    const { error: saveErr } = await db.from('app_state').upsert({ key: ACCT + email, org_id: st.value.orgId, value: { refresh: encrypt(t.refresh_token), at: new Date().toISOString() } }, { onConflict: 'key' });
    if (saveErr) return back(`Couldn't save the connection: ${saveErr.message}`);
    tokenCache.set(email, { token: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 });
    return back('');
  } catch (e) {
    console.error('[gmail callback]', e.message);
    return back(e.message);
  }
}

export async function handleInbox(req, res, db) {
  const account = String(req.query?.account || '').toLowerCase();
  const [{ threads = [] }, { labels: allLabels = [] }] = await Promise.all([
    gmail(db, account, '/threads?labelIds=INBOX&maxResults=75'),
    gmail(db, account, '/labels').catch(() => ({ labels: [] })),
  ]);
  const userLabels = allLabels.filter((l) => l.type === 'user');
  const tags = pickTags(userLabels.map((l) => l.name));
  const nameById = Object.fromEntries(userLabels.map((l) => [l.id, l.name]));
  const meta = await pool(threads, 8, (th) => gmail(db, account,
    `/threads/${th.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe`));
  const out = [];
  for (const t of meta) {
    if (!t?.messages?.length) continue;
    const inInbox = t.messages.filter((m) => (m.labelIds || []).includes('INBOX'));
    const last = t.messages[t.messages.length - 1];
    const firstIn = inInbox[0] || last;
    const labels = [...new Set(t.messages.flatMap((m) => m.labelIds || []))];
    const row = {
      id: t.id,
      subject: header(firstIn, 'Subject') || '(no subject)',
      lastFrom: header(last, 'From'),
      fromName: nameOf(header(last, 'From')),
      // the other person (first sender that isn't us)
      contact: nameOf(t.messages.map((m) => header(m, 'From')).find((f) => addr(f) !== account) || header(last, 'To')),
      snippet: (last.snippet || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
      at: new Date(Number(last.internalDate)).toISOString(),
      count: t.messages.length,
      unread: labels.includes('UNREAD'),
      labels,
      unsubscribe: t.messages.some((m) => !!header(m, 'List-Unsubscribe')),
    };
    row.bucket = bucket(row, account);
    Object.assign(row, withTags(row, row.bucket, tags, labels.map((id) => nameById[id]).filter((n) => tags.some((x) => x.name === n))));
    delete row.labels;
    out.push(row);
  }
  out.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ threads: out, tags: tags.map((x) => x.name), failed: meta.filter((m) => m?.error).length });
}

// Add or remove one of your labels on threads: { account, ids, name, remove }.
async function handleTag(req, res, db) {
  const { account, ids, name, remove } = req.body || {};
  const list = (Array.isArray(ids) ? ids : []).filter((x) => /^[0-9a-f]+$/i.test(x)).slice(0, 200);
  if (!list.length || !name) return res.status(400).json({ error: 'ids and name required' });
  const acct = String(account).toLowerCase();
  const { labels = [] } = await gmail(db, acct, '/labels');
  const label = labels.find((l) => l.name === name);
  if (!label) return res.status(404).json({ error: `No Gmail label named "${name}"` });
  const body = JSON.stringify(remove ? { removeLabelIds: [label.id] } : { addLabelIds: [label.id] });
  const r = await pool(list, 6, (id) => gmail(db, acct, `/threads/${id}/modify`, { method: 'POST', body }));
  res.json({ ok: true, failed: r.filter((x) => x?.error).length });
}

async function handleThread(req, res, db) {
  const account = String(req.query?.account || '').toLowerCase();
  const id = String(req.query?.id || '');
  if (!/^[0-9a-f]+$/i.test(id)) return res.status(400).json({ error: 'Bad thread id' });
  const t = await gmail(db, account, `/threads/${id}?format=full`);
  res.json({
    id: t.id,
    messages: (t.messages || []).map((m) => {
      const full = bodyText(m.payload);
      return {
        id: m.id,
        from: header(m, 'From'),
        fromName: nameOf(header(m, 'From')),
        mine: addr(header(m, 'From')) === account,
        to: header(m, 'To'),
        subject: header(m, 'Subject'),
        messageId: header(m, 'Message-ID') || header(m, 'Message-Id'),
        references: header(m, 'References'),
        at: new Date(Number(m.internalDate)).toISOString(),
        text: stripQuoted(full).slice(0, 20000) || full.slice(0, 20000),
        attachments: [],
      };
    }),
  });
}

async function handleArchive(req, res, db, undo) {
  const { account, ids } = req.body || {};
  const list = (Array.isArray(ids) ? ids : []).filter((x) => /^[0-9a-f]+$/i.test(x)).slice(0, 200);
  if (!list.length) return res.status(400).json({ error: 'ids required' });
  const body = JSON.stringify(undo ? { addLabelIds: ['INBOX'] } : { removeLabelIds: ['INBOX'] });
  const r = await pool(list, 6, (id) => gmail(db, String(account).toLowerCase(), `/threads/${id}/modify`, { method: 'POST', body }));
  res.json({ ok: true, failed: r.filter((x) => x?.error).length });
}

// Trash = Gmail's Trash (emptied after 30 days); untrash puts it back.
async function handleTrash(req, res, db, undo) {
  const { account, ids } = req.body || {};
  const list = (Array.isArray(ids) ? ids : []).filter((x) => /^[0-9a-f]+$/i.test(x)).slice(0, 200);
  if (!list.length) return res.status(400).json({ error: 'ids required' });
  const r = await pool(list, 6, (id) => gmail(db, String(account).toLowerCase(), `/threads/${id}/${undo ? 'untrash' : 'trash'}`, { method: 'POST' }));
  res.json({ ok: true, failed: r.filter((x) => x?.error).length });
}

const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['needs_reply', 'draft'],
  properties: {
    needs_reply: { type: 'boolean', description: 'False if the last email needs no answer (receipt, notification, "thanks", newsletter).' },
    draft: { type: 'string', description: 'The reply body only (no subject line). Empty string if needs_reply is false.' },
  },
};
const DRAFT_RULES = `You draft email replies for Jude, owner of Hey Jude's Lawn Care in Rock Hill, SC (lawn mowing plans, one-time cleanups, Christmas lights installs). Jude reviews every draft before it sends.

How Jude emails: friendly, plain, short. Start with "Hi <first name>," on its own line. A few short sentences or short paragraphs. End with:
Thanks,
Jude

Rules:
- Say "clients", never "customers".
- Never invent prices, dates, times, or details that aren't in the thread. If the reply needs one, put a placeholder in brackets, e.g. [day] or [price], so Jude fills it in.
- Never promise things that might not stay true: no "same crew every time", "no commitment", "cancel anytime", guaranteed arrival times.
- Patios, walls, fire pits and other hardscaping: be interested and offer to take a look, but don't promise the work.
- Vendors, suppliers, and sales pitches: be polite and brief.`;

async function handleDraft(req, res) {
  const { messages, account } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages required' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the Hub server.' });
  const thread = messages.slice(-6).map((m) => {
    const when = new Date(m.at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `--- ${m.mine ? 'Jude' : m.fromName} <${m.mine ? account : (m.from.match(/<([^>]+)>/)?.[1] || m.from)}>, ${when}\nSubject: ${m.subject}\n\n${String(m.text || '').slice(0, 4000)}`;
  }).join('\n\n');
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' });
  const lastMine = messages[messages.length - 1]?.mine;
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
      system: DRAFT_RULES,
      messages: [{ role: 'user', content: `Today is ${today}. Email thread (oldest first):\n\n${thread}\n\n${lastMine ? "Jude sent the last email and hasn't heard back. Draft a short, friendly follow-up." : "Draft Jude's reply to the last email."}` }],
    });
    if (response.stop_reason === 'refusal') return res.status(422).json({ error: 'Claude declined to draft this one. Write it by hand.' });
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) return res.status(502).json({ error: 'No draft came back. Try again.' });
    return res.json(JSON.parse(text));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: 'The Claude API key on the Hub server is invalid.' });
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Too many drafts at once. Try again in a minute.' });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API error ${err.status}: ${err.message}` });
    console.error('[gmail draft]', err);
    return res.status(500).json({ error: err.message || 'Draft failed' });
  }
}

// RFC 2047 encode a header value if it has non-ASCII characters.
const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

async function handleSend(req, res, db) {
  const { account, threadId, to, subject, inReplyTo, references, content } = req.body || {};
  const acct = String(account || '').toLowerCase();
  const text = String(content || '').trim();
  if (!/^[0-9a-f]+$/i.test(String(threadId || ''))) return res.status(400).json({ error: 'Bad threadId' });
  if (!text) return res.status(400).json({ error: 'Message is empty' });
  if (!to || /[\r\n]/.test(to + subject + inReplyTo + references)) return res.status(400).json({ error: 'Bad headers' });
  const subj = /^re:/i.test(subject || '') ? subject : `Re: ${subject || ''}`;
  const lines = [
    `From: ${acct}`,
    `To: ${to}`,
    `Subject: ${encHeader(subj)}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    inReplyTo ? `References: ${[references, inReplyTo].filter(Boolean).join(' ')}` : null,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n'),
  ].filter((l) => l !== null).join('\r\n');
  const raw = Buffer.from(lines, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sent = await gmail(db, acct, '/messages/send', { method: 'POST', body: JSON.stringify({ raw, threadId }) });
  res.json({ ok: true, id: sent.id });
}

export default async function handler(req, res) {
  const db = getSupabaseAdmin();
  const isCallback = String(req.originalUrl || req.url || '').startsWith('/api/gmail-callback') || req.query?.action === 'callback';
  try {
    if (isCallback) return await handleCallback(req, res, db);

    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const { data: who } = token ? await db.auth.getUser(token) : { data: null };
    if (who?.user?.user_metadata?.role !== 'owner') return res.status(401).json({ error: 'Log in to the Hub as the owner first.' });

    const action = req.query?.action;
    const account = String(req.query?.account || req.body?.account || '').toLowerCase();
    if (['inbox', 'thread', 'archive', 'unarchive', 'trash', 'untrash', 'tag', 'send'].includes(action) && !/^[^@\s]+@[^@\s]+$/.test(account)) {
      return res.status(400).json({ error: 'account required' });
    }
    if (action === 'accounts' && req.method === 'GET') return await handleAccounts(req, res, db);
    if (action === 'connect' && req.method === 'GET') return await handleConnect(req, res, db, who.user);
    if (isPersonal(account)) {
      if (action === 'inbox' && req.method === 'GET') {
        const [rows, names] = await Promise.all([imapInbox(), imapLabels().catch(() => [])]);
        const tags = pickTags(names);
        const threads = rows.map((t) => { const b = bucket(t, account); const { labels, gl = [], ...rest } = t; return { ...rest, bucket: b, ...withTags(t, b, tags, gl.filter((n) => tags.some((x) => x.name === n))) }; });
        return res.json({ threads, tags: tags.map((x) => x.name), failed: 0 });
      }
      if (action === 'thread' && req.method === 'GET') return res.json(await imapThread(String(req.query?.id || '')));
      if ((action === 'archive' || action === 'unarchive') && req.method === 'POST') return res.json(await imapArchive((req.body?.ids || []).map(String).slice(0, 200), action === 'unarchive'));
      if (action === 'tag' && req.method === 'POST') return res.json(await imapTag((req.body?.ids || []).map(String).slice(0, 200), String(req.body?.name || ''), !!req.body?.remove));
      if ((action === 'trash' || action === 'untrash') && req.method === 'POST') return res.json(await imapTrash((req.body?.ids || []).map(String).slice(0, 200), action === 'untrash'));
      if (action === 'send' && req.method === 'POST') {
        const { to, subject, inReplyTo, references, content } = req.body || {};
        if (!to || !String(content || '').trim() || /[\r\n]/.test(`${to}${subject}${inReplyTo}${references}`)) return res.status(400).json({ error: 'Bad message' });
        return res.json(await imapSend({ to, subject, inReplyTo, references, content: String(content).trim() }));
      }
    }
    if (action === 'inbox' && req.method === 'GET') return await handleInbox(req, res, db);
    if (action === 'thread' && req.method === 'GET') return await handleThread(req, res, db);
    if (action === 'archive' && req.method === 'POST') return await handleArchive(req, res, db, false);
    if (action === 'unarchive' && req.method === 'POST') return await handleArchive(req, res, db, true);
    if (action === 'tag' && req.method === 'POST') return await handleTag(req, res, db);
    if ((action === 'trash' || action === 'untrash') && req.method === 'POST') return await handleTrash(req, res, db, action === 'untrash');
    if (action === 'draft' && req.method === 'POST') return await handleDraft(req, res);
    if (action === 'send' && req.method === 'POST') return await handleSend(req, res, db);
    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error(`[gmail ${req.query?.action || 'callback'}]`, err.message);
    return res.status(err.status || 500).json({ error: err.message, setup: !!err.setup, reconnect: !!err.reconnect });
  }
}
