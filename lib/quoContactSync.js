// Jobber client -> Quo contact. Creates the contact only if Quo doesn't already have
// that phone number (or that Jobber ID). Never edits or deletes existing Quo contacts.
// Same fields the earlier contacts used: name, phone, email, Jobber ID, service address.
import { jobberQuery } from './jobberClient.js';

const QUO = process.env.QUO_API_BASE || 'https://api.quo.com/v1';
const F = { // Quo custom field keys (GET /contact-custom-fields)
  jobberId: '6ad683abf5d65831428a6c68',
  street1: '6ad68352f5d65831428a6c5c',
  street2: '6ad6835bf5d65831428a6c5e',
  city: '6ad68366f5d65831428a6c60',
  state: '6ad6836ef5d65831428a6c62',
  zip: '6ad68390f5d65831428a6c64',
};
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const numericId = (gid) => { try { return Buffer.from(gid, 'base64').toString().split('/').pop(); } catch { return ''; } };

async function quo(path, init = {}, tries = 0) {
  const r = await fetch(`${QUO}${path}`, { ...init, headers: { Authorization: process.env.QUO_API_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 429 && tries < 4) { await new Promise((ok) => setTimeout(ok, 1500 * (tries + 1))); return quo(path, init, tries + 1); }
  if (!r.ok) throw new Error(`Quo ${r.status}: ${j.message || JSON.stringify(j).slice(0, 200)}`);
  return j;
}

// Phones + Jobber IDs already in Quo (cached 2 min so a burst of webhooks doesn't re-page everything).
let known = { at: 0, phones: null, ids: null };
async function quoKnown(fresh = false) {
  if (!fresh && known.phones && Date.now() - known.at < 120e3) return known;
  const phones = new Set(); const ids = new Set();
  let tok = null;
  for (let p = 0; p < 100; p++) {
    const j = await quo(`/contacts?maxResults=50${tok ? `&pageToken=${encodeURIComponent(tok)}` : ''}`);
    for (const c of j.data || []) {
      for (const ph of c.defaultFields?.phoneNumbers || []) if (last10(ph.value).length === 10) phones.add(last10(ph.value));
      const jid = (c.customFields || []).find((x) => x.key === F.jobberId)?.value;
      if (jid) ids.add(String(jid));
    }
    if (!j.nextPageToken) break;
    tok = j.nextPageToken;
  }
  known = { at: Date.now(), phones, ids };
  return known;
}

const CLIENT_Q = `query($id: EncodedId!) { client(id: $id) {
  id firstName lastName companyName isCompany isArchived
  phones { number primary } emails { address primary }
  properties { address { street1 street2 city province postalCode } }
} }`;

export async function syncJobberClientToQuo(clientId, phoneHint = '', fresh = false) {
  if (!process.env.QUO_API_KEY) return { skipped: 'no QUO_API_KEY' };
  // Cheap check first: phone already in Quo -> no Jobber call needed.
  if (last10(phoneHint).length === 10 && (await quoKnown()).phones.has(last10(phoneHint))) return { skipped: 'already in Quo' };
  const c = (await jobberQuery(CLIENT_Q, { id: clientId }))?.client;
  if (!c) return { skipped: 'client not found' };
  if (c.isArchived) return { skipped: 'archived in Jobber' }; // archiving fires CLIENT_UPDATE — don't re-add people we let go
  const phones = (c.phones || []).sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0)).map((p) => last10(p.number)).filter((p) => p.length === 10);
  if (!phones.length) return { skipped: 'no phone' };
  const jid = numericId(c.id);
  const k = await quoKnown(fresh);
  if (k.ids.has(jid) || phones.some((p) => k.phones.has(p))) return { skipped: 'already in Quo' };

  const a = c.properties?.[0]?.address || {};
  const custom = [[F.jobberId, jid], [F.street1, a.street1], [F.street2, a.street2], [F.city, a.city], [F.state, a.province], [F.zip, a.postalCode]]
    .filter(([, v]) => v).map(([key, value]) => ({ key, value: String(value) }));
  const emails = (c.emails || []).sort((x, y) => (y.primary ? 1 : 0) - (x.primary ? 1 : 0)).map((e) => e.address).filter(Boolean);
  const body = {
    defaultFields: {
      firstName: c.firstName || (c.isCompany ? c.companyName : '') || null,
      lastName: c.lastName || null,
      company: c.companyName || null,
      phoneNumbers: phones.map((p, i) => ({ name: i ? 'Other' : 'Phone', value: `+1${p}` })),
      emails: emails.slice(0, 2).map((e, i) => ({ name: i ? 'Other' : 'Email', value: e })),
    },
    customFields: custom,
  };
  const made = await quo('/contacts', { method: 'POST', body: JSON.stringify(body) });
  phones.forEach((p) => k.phones.add(p)); k.ids.add(jid);
  return { created: made?.data?.id || true, name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.companyName };
}

export async function syncJobberRequestToQuo(requestId) {
  const r = (await jobberQuery(`query($id: EncodedId!) { request(id: $id) { client { id } } }`, { id: requestId }))?.request;
  if (!r?.client?.id) return { skipped: 'request has no client' };
  return syncJobberClientToQuo(r.client.id);
}
