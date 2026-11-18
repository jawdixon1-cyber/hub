import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

// iMessage for the Personal step. Mac only: reads ~/Library/Messages/chat.db (read-only) and
// sends through the Messages app with AppleScript. Needs Full Disk Access for the app running
// the Hub server (Terminal), and the first send asks to let Terminal control Messages.
//   GET  /api/imessage?action=inbox  → 1:1 chats from the last 14 days, same shape as /api/quo
//   POST /api/imessage?action=draft  → Claude draft in Jude's personal voice (only on tap)
//   POST /api/imessage?action=send   → { chatGuid, content } sent via Messages (only on tap)
//   POST /api/imessage?action=done   → no-op (iMessage has no "done"; the Hub hides it locally)

const HOME = os.homedir();
const CHAT_DB = path.join(HOME, 'Library/Messages/chat.db');
const LOOKBACK_DAYS = 14;
const APPLE_EPOCH = 978307200000; // 2001-01-01 in ms

// Dates come out of SQL already as seconds since 2001 (see SECS); nanosecond values are too big for JS numbers.
const appleToIso = (secs) => new Date(APPLE_EPOCH + (Number(secs) || 0) * 1000).toISOString();
const SECS = (col) => `(CASE WHEN ${col} > 100000000000 THEN ${col} / 1000000000.0 ELSE ${col} * 1.0 END)`;
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

async function openDb(file) {
  const { DatabaseSync } = await import('node:sqlite');
  try { return new DatabaseSync(file, { readOnly: true }); } catch (e) {
    throw Object.assign(new Error('The Hub can\'t read Messages yet. Give Terminal Full Disk Access (System Settings → Privacy & Security → Full Disk Access), then restart the Hub server.'), { status: 503, setup: true, cause: e });
  }
}

// Newer macOS stores message text in attributedBody (an archived NSAttributedString) instead of `text`.
function textFromAttributed(buf) {
  if (!buf) return '';
  const b = Buffer.from(buf);
  const i = b.indexOf('NSString');
  if (i < 0) return '';
  let p = i + 'NSString'.length + 5;
  let len = b[p]; p += 1;
  if (len === 0x81) { len = b.readUInt16LE(p); p += 2; } else if (len === 0x82) { len = b.readUInt32LE(p); p += 4; }
  return b.slice(p, p + len).toString('utf8');
}

// Contact names from the Contacts app's databases (also needs Full Disk Access).
let nameCache = { at: 0, map: null };
async function contactNames() {
  if (nameCache.map && Date.now() - nameCache.at < 10 * 60e3) return nameCache.map;
  const map = {};
  const root = path.join(HOME, 'Library/Application Support/AddressBook');
  const files = [path.join(root, 'AddressBook-v22.abcddb')];
  try { for (const s of fs.readdirSync(path.join(root, 'Sources'))) files.push(path.join(root, 'Sources', s, 'AddressBook-v22.abcddb')); } catch { /* none */ }
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    try {
      const db = await openDb(f);
      const people = db.prepare('SELECT Z_PK id, ZFIRSTNAME f, ZLASTNAME l, ZORGANIZATION o FROM ZABCDRECORD').all();
      const byId = Object.fromEntries(people.map((r) => [r.id, [r.f, r.l].filter(Boolean).join(' ') || r.o || '']));
      for (const r of db.prepare('SELECT ZOWNER o, ZFULLNUMBER n FROM ZABCDPHONENUMBER').all()) { const k = last10(r.n); if (k.length === 10 && byId[r.o] && !map[k]) map[k] = byId[r.o]; }
      for (const r of db.prepare('SELECT ZOWNER o, ZADDRESS a FROM ZABCDEMAILADDRESS').all()) { const k = String(r.a || '').toLowerCase(); if (k && byId[r.o] && !map[k]) map[k] = byId[r.o]; }
      db.close();
    } catch { /* skip unreadable source */ }
  }
  nameCache = { at: Date.now(), map };
  return map;
}

async function handleInbox(req, res) {
  const db = await openDb(CHAT_DB);
  try {
    const since = (Date.now() - LOOKBACK_DAYS * 864e5 - APPLE_EPOCH) / 1000; // seconds since 2001
    const chats = db.prepare(`
      SELECT c.ROWID id, c.guid, c.chat_identifier ident, c.display_name dname, MAX(${SECS('m.date')}) last
      FROM chat c JOIN chat_message_join j ON j.chat_id = c.ROWID JOIN message m ON m.ROWID = j.message_id
      WHERE ${SECS('m.date')} > ? AND c.style = 45
      GROUP BY c.ROWID ORDER BY last DESC LIMIT 60`).all(since);
    const names = await contactNames();
    const msgQ = db.prepare(`
      SELECT m.ROWID id, m.text, m.attributedBody body, m.is_from_me mine, ${SECS('m.date')} date, m.cache_has_attachments att
      FROM message m JOIN chat_message_join j ON j.message_id = m.ROWID
      WHERE j.chat_id = ? AND (m.associated_message_type IS NULL OR m.associated_message_type = 0) AND m.item_type = 0
      ORDER BY m.date DESC LIMIT 30`);
    const threads = [];
    for (const c of chats) {
      const rows = msgQ.all(c.id).reverse();
      const messages = rows.map((r) => ({
        id: `im-${r.id}`, dir: r.mine ? 'outgoing' : 'incoming',
        text: (r.text || textFromAttributed(r.body) || '').replace(/￼/g, '').trim(),
        media: r.att ? [{ url: '', type: 'attachment' }] : [], at: appleToIso(r.date),
      })).filter((m) => m.text || m.media.length);
      const last = messages[messages.length - 1];
      if (!last) continue;
      const key = /@/.test(c.ident) ? String(c.ident).toLowerCase() : last10(c.ident);
      threads.push({
        kind: last.dir === 'incoming' ? 'reply' : 'waiting',
        id: c.guid, chatGuid: c.guid, phone: c.ident,
        name: c.dname || names[key] || null, isClient: false, isContact: !!names[key],
        lastAt: last.at, lastMessageId: last.id, messages,
      });
    }
    return res.json({ threads, failed: 0, source: 'imessage' });
  } finally { db.close(); }
}

const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['needs_reply', 'draft', 'summary'],
  properties: {
    needs_reply: { type: 'boolean', description: 'False if the last text needs no answer (a reaction, "ok", "thanks", a link with no question).' },
    draft: { type: 'string', description: 'The reply text. Empty string if needs_reply is false.' },
    summary: { type: 'string', description: 'One short line on what they said or want.' },
  },
};
const RULES = `You draft personal text replies for Jude (friends and family, from his own phone). Jude reviews every draft before it sends.
Match how Jude already texts in this thread: casual, short, natural. One or two sentences. Use emojis only if Jude does in this thread.
Never invent plans, times, or facts that aren't in the thread; if the reply needs one, put a placeholder in [brackets].`;

async function handleDraft(req, res) {
  const { messages, name, kind } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages required' });
  const transcript = messages.slice(-25).map((m) => `${m.dir === 'incoming' ? (name || 'Them') : 'Jude'}: ${m.text || '[attachment]'}`).join('\n');
  const ask = kind === 'waiting' ? "Jude texted last and hasn't heard back. Draft a short, natural follow-up (needs_reply false if a follow-up would be weird)." : "Draft Jude's reply to the last message.";
  const client = new Anthropic();
  try {
    const r = await client.beta.messages.create({
      model: 'claude-opus-5-5', max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
      system: RULES,
      messages: [{ role: 'user', content: `Text thread with ${name || 'a contact'}:\n\n${transcript}\n\n${ask}` }],
    });
    if (r.stop_reason === 'refusal') return res.status(422).json({ error: 'Claude declined to draft this one. Write it by hand.' });
    const text = r.content.find((b) => b.type === 'text')?.text;
    if (!text) return res.status(502).json({ error: 'No draft came back. Try again.' });
    return res.json(JSON.parse(text));
  } catch (err) {
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API error ${err.status}: ${err.message}` });
    return res.status(500).json({ error: err.message || 'Draft failed' });
  }
}

// Send through the Messages app. The chat GUID works for both iMessage and SMS chats.
// Text and GUID are passed as arguments, never pasted into the script.
const SEND_SCRIPT = `on run argv
  set chatGuid to item 1 of argv
  set msg to item 2 of argv
  tell application "Messages" to send msg to chat id chatGuid
end run`;
function handleSend(req, res) {
  const { chatGuid, content } = req.body || {};
  const text = String(content || '').trim();
  if (!/^(iMessage|SMS|RCS|any);[-+];[^\s]+$/.test(String(chatGuid || ''))) return res.status(400).json({ error: 'Bad chat' });
  if (!text) return res.status(400).json({ error: 'Message is empty' });
  execFile('osascript', ['-e', SEND_SCRIPT, chatGuid, text], { timeout: 20000 }, (err, _out, stderr) => {
    if (err) return res.status(502).json({ error: /not allowed|-1743/i.test(String(stderr)) ? 'Allow Terminal to control Messages (System Settings → Privacy & Security → Automation), then try again.' : `Messages couldn't send: ${String(stderr || err.message).trim()}` });
    return res.json({ ok: true });
  });
}

export default async function handler(req, res) {
  const db = getSupabaseAdmin();
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  if (who?.user?.user_metadata?.role !== 'owner') return res.status(401).json({ error: 'Log in to the Hub as the owner first.' });
  if (process.platform !== 'darwin') return res.status(503).json({ error: 'iMessage only works on the Hub running on your Mac.', setup: true });
  const action = req.query?.action;
  try {
    if (action === 'inbox' && req.method === 'GET') return await handleInbox(req, res);
    if (action === 'draft' && req.method === 'POST') return await handleDraft(req, res);
    if (action === 'send' && req.method === 'POST') return handleSend(req, res);
    if (action === 'done' && req.method === 'POST') return res.json({ ok: true, local: true });
    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[imessage]', err.message);
    return res.status(err.status || 500).json({ error: err.message, setup: !!err.setup });
  }
}
