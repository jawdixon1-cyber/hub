// Lights price-range estimates: one house photo → rough feet → a −10% / +15% range + mockups,
// shared with the client at /estimate/:token (no login).
// le-meta:<id> = small row (client, phone, address, lines, range, token) · le-img:<id>:<photo|warm|multi> = { src }
import { supabase } from './supabase';

const PRICES_KEY = 'lights-quoter-prices-v2'; // same $/ft the Lights Quoter uses
const DEFAULT_PRICES = { easy: '6', medium: '8', hard: '10', minimum: '600' };
// Default $/ft for estimates (Jude 2026-11-23); the $600 minimum still comes from the Lights Quoter.
export const EST_RATES = { easy: '7', medium: '9', hard: '10' };
export const LOW = 0.9;
export const HIGH = 1.1;

export function prices() {
  try { return { ...DEFAULT_PRICES, ...JSON.parse(localStorage.getItem(PRICES_KEY) || '{}') }; } catch { return DEFAULT_PRICES; }
}
// Exact to the cent: $1,192.47 reads like a real number; $1,200 or $1,199.99 reads like a sales price.
const round25 = (n) => Math.round(n * 100) / 100;
// rates = this estimate's own $/ft (edited on the page); falls back to the Lights Quoter's prices.
export function priceOf(lines, rates) {
  const p = { ...prices(), ...EST_RATES, ...(rates || {}) };
  const feet = { easy: 0, medium: 0, hard: 0 };
  for (const l of lines || []) if (feet[l.level] != null) feet[l.level] += Number(l.feet) || 0;
  const raw = feet.easy * Number(p.easy) + feet.medium * Number(p.medium) + feet.hard * Number(p.hard);
  const min = Number(p.minimum) || 0;
  const est = Math.max(min, raw);
  return { feet, total: feet.easy + feet.medium + feet.hard, est, low: Math.max(min, round25(est * LOW)), high: Math.max(min, round25(est * HIGH)) };
}

// Photos are shrunk to JPEG before saving (big rows time out).
export function toJpeg(src, max = 1600, q = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}
export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

function newToken() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function upsert(rows, orgId) {
  const { error } = await supabase.from('app_state').upsert(rows.map((r) => ({ ...r, ...(orgId ? { org_id: orgId } : {}) })), { onConflict: 'key' });
  if (error) throw error;
}

export async function listEstimates() {
  const [{ data, error }, { data: yes }, { data: views }] = await Promise.all([
    supabase.from('app_state').select('key, value').like('key', 'le-meta:%'),
    supabase.from('app_state').select('key, value').like('key', 'le-yes:%'),
    supabase.from('app_state').select('key, value').like('key', 'le-views:%'),
  ]);
  const seen = Object.fromEntries((views || []).map((r) => [r.key.slice(9), r.value]));
  if (error) throw error;
  const said = Object.fromEntries((yes || []).map((r) => [r.key.slice(7), r.value]));
  return (data || []).map((r) => ({ ...r.value, id: r.key.slice(8), said: said[r.key.slice(8)]?.declined ? null : (said[r.key.slice(8)] || null), declined: !!said[r.key.slice(8)]?.declined, views: seen[r.key.slice(8)] || null }))
    .filter((e) => !e.off).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getEstimateImages(id) {
  const { data } = await supabase.from('app_state').select('key, value').like('key', `le-img:${id}:%`);
  return Object.fromEntries((data || []).map((r) => [r.key.split(':').pop(), r.value?.src || '']));
}

// Saves the estimate (and any new pictures); returns the saved meta with its token.
export async function saveEstimate(est, imgs, orgId) {
  const id = est.id || `le-${Date.now()}`;
  const has = { ...(est.has || {}) };
  const imgRows = [];
  for (const k of ['photo', 'warm', 'multi', 'x1', 'x2', 'x3']) {
    if (imgs[k] === undefined) continue;
    has[k] = !!imgs[k];
    imgRows.push({ key: `le-img:${id}:${k}`, value: { src: imgs[k] || '' } });
  }
  const meta = {
    ...est, id, has, token: est.token || newToken(), createdAt: est.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...(imgRows.length ? { imgStamp: Date.now() } : {}),
  };
  delete meta.said;
  delete meta.views;
  delete meta.declined;
  await Promise.all(imgRows.map((r) => upsert([r], orgId))); // one picture per request, all at once
  await upsert([{ key: `le-meta:${id}`, value: meta }], orgId);
  return meta;
}

// Mark one open as "that was me" (or back to theirs). Counts are recomputed from the list.
export async function toggleMyView(id, at, orgId) {
  const { data } = await supabase.from('app_state').select('value').eq('key', `le-views:${id}`).maybeSingle();
  const v = data?.value; if (!v?.list) return null;
  const list = v.list.map((x) => (x.at === at ? { ...x, me: x.me ? undefined : true } : x));
  const theirs = list.filter((x) => !x.me);
  const value = { ...v, list, count: theirs.length, mine: list.length - theirs.length, first: theirs[0]?.at || null, last: theirs.at(-1)?.at || null };
  await upsert([{ key: `le-views:${id}`, value }], orgId);
  return value;
}
export const removeEstimate = (e, orgId) => upsert([{ key: `le-meta:${e.id}`, value: { ...e, said: undefined, views: undefined, off: true } }], orgId);
export const estimateUrl = (token) => `https://hub.heyjudeslawncare.com/estimate/${token}`;

// Copy of the photo with a labeled 0–1000 grid on it, so Claude can place each run's points
// accurately (it's only sent to Claude, never saved or shown).
export function withGrid(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const fs = Math.max(12, Math.round(Math.min(c.width, c.height) / 45));
      g.font = `bold ${fs}px sans-serif`;
      for (let k = 1; k < 10; k++) {
        const x = (c.width * k) / 10; const y = (c.height * k) / 10;
        g.strokeStyle = k === 5 ? 'rgba(255,0,255,.75)' : 'rgba(255,0,255,.45)';
        g.lineWidth = Math.max(1, fs / 10);
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke();
        const label = String(k * 100);
        for (const [tx, ty] of [[x + 3, fs + 2], [3, y - 4]]) {
          g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(label, tx, ty);
          g.fillStyle = '#fff'; g.fillText(label, tx, ty);
        }
      }
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}
