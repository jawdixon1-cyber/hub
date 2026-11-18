import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';

// Personal Gmail over IMAP/SMTP with an app password (no Google sign-in app needed, never expires).
// Env: PERSONAL_GMAIL_USER, PERSONAL_GMAIL_APP_PASSWORD (16 chars from myaccount.google.com/apppasswords).
// Uses Gmail's IMAP extensions: X-GM-THRID (thread id), X-GM-LABELS (archive = drop the \Inbox label),
// and X-GM-RAW (Gmail search, for Promotions/Social/Updates/Forums).

export function personalAccount() {
  const user = String(process.env.PERSONAL_GMAIL_USER || '').trim().toLowerCase();
  const pass = String(process.env.PERSONAL_GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  return user && pass && !/PUT/i.test(pass) ? { user, pass } : null;
}
export const isPersonal = (account) => personalAccount()?.user === String(account || '').toLowerCase();

async function withClient(fn) {
  const acct = personalAccount();
  if (!acct) throw Object.assign(new Error('Personal Gmail app password is not set on the Hub server.'), { status: 503, setup: true });
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: acct.user, pass: acct.pass }, logger: false });
  try {
    await client.connect();
  } catch (e) {
    throw Object.assign(new Error(/auth|credential|invalid/i.test(e.message || '') ? 'Gmail rejected the app password. Make a new one and paste it in again.' : `Couldn't reach Gmail: ${e.message}`), { status: 502 });
  }
  try { return await fn(client, acct); } finally { await client.logout().catch(() => {}); }
}

async function allMailPath(client) {
  const boxes = await client.list();
  return boxes.find((b) => b.specialUse === '\\All')?.path || '[Gmail]/All Mail';
}

const addrOf = (a) => (a?.address || '').toLowerCase();
const nameOf = (a) => a?.name || a?.address || '';
const fmtAddr = (a) => (a ? (a.name ? `${a.name} <${a.address}>` : a.address) : '');

function stripQuoted(text) {
  const cut = text.search(/\n(On .{5,200}wrote:|-{2,}\s*Original Message|From: .+\nSent: )/i);
  const t = cut > 0 ? text.slice(0, cut) : text;
  return t.split('\n').filter((l) => !/^>/.test(l)).join('\n').trim();
}

// Inbox threads, newest first, in the same shape the Gmail API version returns.
export async function imapInbox() {
  return withClient(async (client, acct) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = (await client.search({ all: true }, { uid: true })) || [];
      const recent = uids.slice(-120); // newest 120 messages in the inbox
      if (!recent.length) return [];
      const catUids = new Set((await client.search({ gmraw: 'category:promotions OR category:social OR category:updates OR category:forums' }, { uid: true }).catch(() => [])) || []);
      const byThread = new Map();
      for await (const m of client.fetch(recent, { uid: true, envelope: true, flags: true, threadId: true, internalDate: true, headers: ['list-unsubscribe'], source: { start: 0, maxLength: 6000 } }, { uid: true })) {
        const tid = String(m.threadId || m.uid);
        let snippet = '';
        try { const p = await simpleParser(m.source); snippet = (p.text || '').replace(/\s+/g, ' ').trim().slice(0, 180); } catch { /* partial message */ }
        const from = m.envelope?.from?.[0];
        const item = {
          uid: m.uid, at: new Date(m.internalDate || m.envelope?.date || Date.now()).toISOString(),
          from, to: m.envelope?.to?.[0], subject: m.envelope?.subject || '(no subject)',
          unread: !m.flags?.has('\\Seen'), cat: catUids.has(m.uid),
          unsubscribe: /list-unsubscribe/i.test(String(m.headers || '')), snippet,
        };
        const t = byThread.get(tid) || { id: tid, msgs: [] };
        t.msgs.push(item);
        byThread.set(tid, t);
      }
      const out = [];
      for (const t of byThread.values()) {
        t.msgs.sort((a, b) => new Date(a.at) - new Date(b.at));
        const last = t.msgs[t.msgs.length - 1];
        const other = t.msgs.map((x) => x.from).find((f) => addrOf(f) !== acct.user) || last.to;
        out.push({
          id: t.id,
          subject: t.msgs[0].subject,
          lastFrom: fmtAddr(last.from),
          fromName: nameOf(last.from),
          contact: nameOf(other),
          snippet: last.snippet,
          at: last.at,
          count: t.msgs.length,
          unread: t.msgs.some((x) => x.unread),
          labels: t.msgs.some((x) => x.cat) ? ['CATEGORY_PROMOTIONS'] : [],
          unsubscribe: t.msgs.some((x) => x.unsubscribe),
        });
      }
      return out.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 75);
    } finally { lock.release(); }
  });
}

// A whole thread (your replies included) from All Mail.
export async function imapThread(threadId) {
  return withClient(async (client, acct) => {
    const lock = await client.getMailboxLock(await allMailPath(client));
    try {
      const uids = (await client.search({ threadId: String(threadId) }, { uid: true })) || [];
      const msgs = [];
      for await (const m of client.fetch(uids.slice(-30), { uid: true, source: true, internalDate: true }, { uid: true })) {
        const p = await simpleParser(m.source);
        const from = p.from?.value?.[0];
        const full = (p.text || (p.html ? p.html.replace(/<[^>]+>/g, ' ') : '')).trim();
        msgs.push({
          id: String(m.uid),
          from: fmtAddr(from), fromName: nameOf(from), mine: addrOf(from) === acct.user,
          to: p.to?.text || '', subject: p.subject || '',
          messageId: p.messageId ? `<${p.messageId.replace(/^<|>$/g, '')}>` : '',
          references: Array.isArray(p.references) ? p.references.join(' ') : (p.references || ''),
          at: new Date(m.internalDate || p.date || Date.now()).toISOString(),
          text: (stripQuoted(full) || full).slice(0, 20000),
          attachments: [],
        });
      }
      msgs.sort((a, b) => new Date(a.at) - new Date(b.at));
      return { id: String(threadId), messages: msgs };
    } finally { lock.release(); }
  });
}

// Archive = remove the \Inbox label from every message in the thread. undo puts it back.
export async function imapArchive(threadIds, undo = false) {
  return withClient(async (client) => {
    const lock = await client.getMailboxLock(await allMailPath(client));
    let failed = 0;
    try {
      for (const tid of threadIds) {
        try {
          const uids = (await client.search({ threadId: String(tid) }, { uid: true })) || [];
          if (!uids.length) continue;
          if (undo) await client.messageFlagsAdd(uids, ['\\Inbox'], { uid: true, useLabels: true });
          else await client.messageFlagsRemove(uids, ['\\Inbox'], { uid: true, useLabels: true });
        } catch { failed++; }
      }
    } finally { lock.release(); }
    return { ok: true, failed };
  });
}

export async function imapSend({ to, subject, inReplyTo, references, content }) {
  const acct = personalAccount();
  if (!acct) throw Object.assign(new Error('Personal Gmail app password is not set on the Hub server.'), { status: 503, setup: true });
  const tx = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: acct.user, pass: acct.pass } });
  const info = await tx.sendMail({
    from: acct.user, to, subject: /^re:/i.test(subject || '') ? subject : `Re: ${subject || ''}`,
    text: content, ...(inReplyTo ? { inReplyTo, references: [references, inReplyTo].filter(Boolean).join(' ') } : {}),
  });
  return { ok: true, id: info.messageId };
}
