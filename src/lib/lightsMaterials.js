// Christmas lights supplies + what each quote needs. Pack-size ordering and
// bulb-pattern splitting are adapted from the "Light Install Tracker" app.
//
// New install, C9s 12" apart → 1 bulb, 1 clip and 1 ft of socket wire per foot
// of roofline (wire ft = bulb count). Strands = mini-light strands.

const n = (v) => Number(v) || 0;

// Starter list with real pack sizes (from Light Install Tracker).
export const STARTER_SUPPLIES = [
  ['wire-white', 'White Socket Wire', 'ft', [['spool', 1000]], 0.3],
  ['wire-black', 'Black Socket Wire', 'ft', [['spool', 1000]], 0.3],
  ['c9-warm', 'Warm White C9', 'ea', [['box', 500]], 0.35],
  ['c9-cool', 'Cool White C9', 'ea', [['box', 500]], 0.35],
  ['c9-red', 'Red C9', 'ea', [['box', 500]], 0.35],
  ['c9-green', 'Green C9', 'ea', [['box', 500]], 0.35],
  ['c9-multi', 'Multicolor C9', 'ea', [['box', 500]], 0.35],
  ['clip-white', 'White Gutter Clips', 'ea', [['case', 800], ['pack', 100]], 0.08],
  ['clip-black', 'Black Gutter Clips', 'ea', [['case', 800], ['pack', 100]], 0.08],
  ['clip-ridge', 'Ridge Clips', 'ea', [['case', 500], ['pack', 25]], 0.1],
  ['clip-shingle', 'Shingle Tab Black', 'ea', [['case', 1000], ['pack', 100]], 0.06],
  ['clip-magnet', 'Magnet Clip', 'ea', [['pack', 100]], 0.25],
  ['stake', 'Ground stake 7.5"', 'ea', [['case', 500], ['pack', 25]], 0.2],
  ['zip-black', 'Black Zip Wire', 'ft', [['spool', 500], ['spool', 250]], 0.2],
  ['zip-white', 'White Zip Wire', 'ft', [['spool', 500], ['spool', 250]], 0.2],
  ['mini-warm', 'Warm White Mini Strands', 'strands', [['case', 24]], 6],
  ['mini-multi', 'Multicolor Mini Strands', 'strands', [['case', 24]], 6],
  ['plug-male', 'Male Plugs', 'ea', [['pack', 50]], 0.5],
  ['plug-female', 'Female Plugs', 'ea', [['pack', 50]], 0.5],
  ['timer', 'Timer', 'ea', [['4-pack', 4], ['single', 1]], 12],
  ['cord', 'Extension Cord', 'ea', [], 15],
].map(([id, name, unit, packs, cost], i) => ({
  id, name, unit, cost, onHand: 0, lowAt: 0, used: 0, sort: i,
  packs: packs.map(([pname, size]) => ({ name: pname, size })),
}));

// What kind of thing an item is, from its name.
// Clip is checked before bulb: "C9 Flex Clip" / "C9 O Clips" are clips, not bulbs.
const KIND_RE = { wire: /socket\s*wire/i, clip: /clip|shingle tab/i, bulb: /\bc[79]\b|bulb/i, mini: /mini/i, timer: /timer/i };
export const kindOf = (it) => Object.keys(KIND_RE).find((k) => KIND_RE[k].test(it?.name || '')) || 'other';

// Bulb patterns for each light style: repeat these in order.
export const STYLE_LABEL = { warm: 'Warm white', cool: 'Cool white', redwhite: 'Red & white', redgreen: 'Red & green', multi: 'Multicolor' };
const STYLE_PATTERN = {
  warm: [[/warm/i, 1]],
  cool: [[/cool/i, 1]],
  redwhite: [[/\bred\b/i, 1], [/warm/i, 1]],
  redgreen: [[/\bred\b/i, 1], [/green/i, 1]],
  multi: [[/multi/i, 1]],
};

// Split a bulb count across a repeating pattern: 7 bulbs of red,white → 4 red, 3 white.
export function splitPattern(total, seq) {
  const L = seq.reduce((t, s) => t + s.n, 0);
  const out = {};
  total = Math.round(total);
  if (!L || total <= 0) return out;
  const full = Math.floor(total / L);
  let rem = total - full * L;
  for (const s of seq) {
    const extra = Math.min(s.n, rem);
    rem -= extra;
    out[s.id] = (out[s.id] || 0) + full * s.n + extra;
  }
  return out;
}

const findItem = (items, re, kind) => items.find((it) => (!kind || kindOf(it) === kind) && re.test(it.name));

// Materials a saved lights quote needs, keyed by supply item id.
// q.style (light style), q.wire ('white'|'black'), q.returning (lights already in storage).
export function quoteMaterials(q, items) {
  const out = {};
  const add = (it, qty) => { if (it && qty > 0) out[it.id] = (out[it.id] || 0) + Math.ceil(qty); };
  const ft = n(q?.feet?.easy) + n(q?.feet?.medium) + n(q?.feet?.hard);
  if (ft > 0 && !q?.returning) {
    const pattern = (STYLE_PATTERN[q?.style] || STYLE_PATTERN.warm)
      .map(([re, cnt]) => ({ it: findItem(items, re, 'bulb'), n: cnt }))
      .filter((p) => p.it);
    Object.entries(splitPattern(ft, pattern.map((p) => ({ id: p.it.id, n: p.n })))).forEach(([id, qty]) => { out[id] = (out[id] || 0) + qty; });
    const allInOne = items.find((it) => kindOf(it) === 'clip' && /all.?(purpose|in.?one)/i.test(it.name)) || items.find((it) => kindOf(it) === 'clip');
    // Per line (from Mark up): each line's wire color + mount → its socket wire and clips.
    // gutter → flex clip, gutter guard → flex clip (slid under the shingle), shingle → shingle tab, metal → magnet clip;
    // clips in the line's wire color when that color is stocked.
    const runs = (q?.runs || []).filter((r) => n(r.ft) > 0);
    const runSum = runs.reduce((t, r) => t + n(r.ft), 0);
    if (runSum > 0) {
      const k = ft / runSum; // keep wire ft = clips = bulbs
      const acc = {};
      const put = (it, qty) => { if (it) acc[it.id] = (acc[it.id] || 0) + qty; };
      const clips = items.filter((it) => kindOf(it) === 'clip');
      const colorRe = (c) => (c === 'black' ? /black/i : /white/i);
      const pick = (re, c) => clips.find((it) => re.test(it.name) && colorRe(c).test(it.name)) || clips.find((it) => re.test(it.name));
      runs.forEach((r) => {
        const c = r.wire === 'black' ? 'black' : 'white';
        put(findItem(items, colorRe(c), 'wire') || items.find((it) => kindOf(it) === 'wire'), n(r.ft) * k);
        // Clips can differ from the wire (black wire on a white gutter → white clips).
        const cc = (r.clip || r.wire) === 'black' ? 'black' : 'white';
        const clip = r.mount === 'magnet' ? pick(/magnet/i, cc)
          : r.mount === 'shingle' ? pick(/shingle tab/i, cc)
          : pick(/flex/i, cc); // gutter + gutter guard
        put(clip || allInOne, n(r.ft) * k);
      });
      Object.entries(acc).forEach(([id, qty]) => add({ id }, qty));
    } else {
    // 12" spacing socket wire: 1 ft of wire = 1 socket = 1 bulb, so wire ft = bulb count
    add(findItem(items, q?.wire === 'black' ? /black/i : /white/i, 'wire') || items.find((it) => kindOf(it) === 'wire'), ft);
    // Clips: gutter lines → flex clips, shingle lines → shingle tabs (wire color).
    // No line tags (older quotes) → all-in-one clips for everything.
    const mountSum = q?.mountFt ? n(q.mountFt.gutter) + n(q.mountFt.shingle) + n(q.mountFt.magnet) : 0;
    if (mountSum > 0) {
      const scale = ft / mountSum; // keep clips = bulbs
      // Metal roofs → magnet clips.
      if (n(q.mountFt.magnet) > 0) add(items.find((it) => kindOf(it) === 'clip' && /magnet/i.test(it.name)) || allInOne, n(q.mountFt.magnet) * scale);
      add(items.find((it) => kindOf(it) === 'clip' && /flex/i.test(it.name)) || allInOne, n(q.mountFt.gutter) * scale);
      const tabColor = q?.wire === 'black' ? /black/i : /white/i;
      add(items.find((it) => kindOf(it) === 'clip' && /shingle tab/i.test(it.name) && tabColor.test(it.name))
        || items.find((it) => kindOf(it) === 'clip' && /shingle tab/i.test(it.name)) || allInOne, n(q.mountFt.shingle) * scale);
    } else {
      add(allInOne, ft);
    }
    }
    // Peaks marked on the photos → one O clip each.
    // O clips in the clip color used most (by feet); falls back to any O clip, then flex.
    if (n(q?.peaks) > 0) {
      const ftBy = { white: 0, black: 0 };
      (q?.runs || []).forEach((r) => { ftBy[(r.clip || r.wire) === 'black' ? 'black' : 'white'] += n(r.ft); });
      const pc = (q?.runs || []).length ? (ftBy.black > ftBy.white ? 'black' : 'white') : (q?.wire === 'black' ? 'black' : 'white');
      const oClips = items.filter((it) => kindOf(it) === 'clip' && /\bo\s*clips?\b/i.test(it.name));
      add(oClips.find((it) => (pc === 'black' ? /black/i : /white/i).test(it.name)) || oClips[0] || items.find((it) => kindOf(it) === 'clip' && /flex/i.test(it.name)) || allInOne, n(q.peaks));
    }
    add(items.find((it) => kindOf(it) === 'timer'), 1);
    // 50 ft of zip cord per install to get power to the roofline (default — edit on the job)
    // Zip cord matches the wire color (white or black), not green.
    // Zip lines measured in Measure → that many feet of zip in each line's color; none measured → 50 ft default.
    const zipOf = (c) => items.find((it) => /zip/i.test(it.name) && (c === 'black' ? /black/i : /white/i).test(it.name)) || items.find((it) => /zip/i.test(it.name));
    const zips = (q?.zips || []).filter((z) => n(z.ft) > 0);
    if (zips.length) {
      const byColor = {};
      zips.forEach((z) => { const c = z.color === 'black' ? 'black' : 'white'; byColor[c] = (byColor[c] || 0) + n(z.ft); });
      Object.entries(byColor).forEach(([c, f]) => add(zipOf(c), f));
    } else {
      add(zipOf(q?.wire), 50);
    }
  }
  // Mini strands: wire to match (white wire → white-wire minis).
  // Mini strands (Extras): light color from the quote (multicolor → multicolor minis), wire to match.
  const miniWire = q?.wire === 'white' ? /white wire/i : /green wire/i;
  const miniColor = /multi|redgreen/.test(q?.style || '') ? /multi/i : /warm/i;
  const minis = items.filter((it) => kindOf(it) === 'mini');
  add(minis.find((it) => miniColor.test(it.name) && miniWire.test(it.name)) || minis.find((it) => miniColor.test(it.name)) || minis[0], n(q?.strands));
  return out;
}

export const quoteFeet = (q) => n(q?.feet?.easy) + n(q?.feet?.medium) + n(q?.feet?.hard);

// Cost of a set of materials at each item's cost.
export function materialCost(needs, items) {
  return Object.entries(needs).reduce((t, [id, qty]) => t + n(items.find((it) => it.id === id)?.cost) * qty, 0);
}

// Round a shortfall up to real packs (biggest pack first, topped up with the
// smaller one). e.g. need 620 clips → 1 case of 800? or 7 packs of 100? → picks
// the cheapest-to-carry combo the same way the tracker does.
export function packPlan(it, need) {
  const ps = (it?.packs || []).map((p) => ({ size: n(p.size), name: String(p.name || 'pack') })).filter((p) => p.size > 0).sort((a, b) => b.size - a.size).slice(0, 2);
  if (!ps.length || need <= 0) return null;
  const up = (x) => Math.ceil(x - 1e-9);
  const text = (parts) => parts.filter((p) => p.n > 0).map((p) => `${p.n} ${p.name}${p.n > 1 ? 's' : ''} of ${p.size}`).join(' + ');
  const big = ps[0];
  const small = ps[ps.length - 1];
  if (ps.length === 1) { const c = up(need / big.size); return { qty: c * big.size, text: text([{ ...big, n: c }]) }; }
  let c = Math.floor(need / big.size);
  let k = up((need - c * big.size) / small.size);
  if (k * small.size >= big.size) { c += 1; k = 0; }
  return { qty: c * big.size + k * small.size, text: text([{ ...big, n: c }, { ...small, n: k }]) };
}
