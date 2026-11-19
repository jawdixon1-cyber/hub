// Strands for the crew view: each drawn plan line is one strand. Figures out what touches what
// (other strands, zip cords, power) and the install order: start at the power, work outward.

const ptsOf = (l) => l.pts || [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
export function distToLine(p, pts) {
  if (pts.length === 1) return dist(p, pts[0]);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSeg(p, pts[i - 1], pts[i]));
  return best;
}
const ends = (pts) => [pts[0], pts[pts.length - 1]];

// Pieces = the straight runs of a line. Gutters are always flat; a shingle/magnet run that's
// steep in the photo is probably a slope (rake).
export function piecesOf(line, steep = 0.25) {
  const pts = ptsOf(line);
  const canSlope = line.mount === 'shingle' || line.mount === 'magnet';
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    out.push({ a, b, slope: canSlope && dy > steep * Math.max(dx, 1) });
  }
  return out;
}

// One section (photo) → strands with neighbors. startNo = number of the first strand in this section.
export function strandsOfSide(side, si) {
  const w = side.w || 1600, h = side.h || 1200;
  const near = Math.max(w, h) * 0.02;
  const lines = (side.lines || []).map((l, li) => ({ li, line: l, pts: ptsOf(l) }));
  const zips = (side.jumps || []).map((z, zi) => ({ zi, zip: z, pts: ptsOf(z) }));
  const power = [...(side.outlets || []).map((p) => ({ ...p, kind: 'outlet' })), ...(side.inlines || []).map((p) => ({ ...p, kind: 'inline' }))];

  // Neighbors: line ↔ line when an end of one touches the other; line ↔ line through a zip cord.
  const nb = lines.map(() => new Map()); // li → Map(otherLi → { how, zi })
  const link = (a, b, how, zi) => { if (a === b) return; if (!nb[a].has(b) || how === 'zip') nb[a].set(b, { how, zi }); if (!nb[b].has(a) || how === 'zip') nb[b].set(a, { how, zi }); };
  lines.forEach((A) => lines.forEach((B) => {
    if (A.li >= B.li) return;
    if (ends(A.pts).some((p) => distToLine(p, B.pts) < near) || ends(B.pts).some((p) => distToLine(p, A.pts) < near)) link(A.li, B.li, 'touch');
  }));
  const zipLines = zips.map((Z) => lines.filter((L) => ends(Z.pts).some((p) => distToLine(p, L.pts) < near)).map((L) => L.li));
  zipLines.forEach((ls, zi) => ls.forEach((a) => ls.forEach((b) => link(a, b, 'zip', zi))));

  // Power: the crew starts at the plug mark (🔌 outlet / ⚡ inline) — the strand nearest each mark.
  const powered = new Map(); // li → { kind }
  power.forEach((p) => {
    let best = null, bd = Infinity;
    lines.forEach((L) => { const d = distToLine(p, L.pts); if (d < bd) { bd = d; best = L.li; } });
    if (best != null && !powered.has(best)) powered.set(best, { kind: p.kind });
  });

  // Install order: breadth-first from the power, then anything left in drawn order.
  const order = [];
  const seen = new Set();
  const walk = (start) => {
    const q = [...start];
    q.forEach((li) => seen.add(li));
    while (q.length) {
      const li = q.shift();
      order.push(li);
      [...nb[li].keys()].sort((a, b) => a - b).forEach((o) => { if (!seen.has(o)) { seen.add(o); q.push(o); } });
    }
  };
  walk([...powered.keys()].sort((a, b) => a - b));
  lines.forEach((L) => { if (!seen.has(L.li)) walk([L.li]); });

  return order.map((li) => ({
    key: `${si}-${li}`, si, li, line: lines[li].line, pts: lines[li].pts,
    pieces: piecesOf(lines[li].line),
    power: powered.get(li) || null,
    neighbors: [...nb[li].entries()].map(([o, v]) => ({ li: o, ...v })),
    zips: zipLines.map((ls, zi) => (ls.includes(li) ? zi : -1)).filter((zi) => zi >= 0),
  }));
}

// Every section, numbered 1..n across the whole job.
export function strandsOfJob(sides) {
  let n = 0;
  const all = sides.flatMap((s, si) => strandsOfSide(s, si));
  all.forEach((s) => { s.no = ++n; });
  const byKey = Object.fromEntries(all.map((s) => [s.key, s]));
  all.forEach((s) => { s.neighbors.forEach((x) => { x.no = byKey[`${s.si}-${x.li}`]?.no; }); });
  return all;
}

// Feet of one piece: flat = tape feet; slope = flat bottom distance ÷ cos(angle).
export function pieceFeet(p) {
  if (!p) return null;
  if (p.m === 's') {
    const run = Number(p.run), deg = Number(p.deg);
    if (!(run > 0) || !(deg >= 0) || deg >= 80 || p.run === '' || p.deg === '') return null;
    return run / Math.cos((deg * Math.PI) / 180);
  }
  const ft = Number(p.ft);
  return p.ft !== '' && ft > 0 ? ft : null;
}
export const pitchOf = (deg) => Math.round(Math.tan((deg * Math.PI) / 180) * 12 * 2) / 2; // x/12, nearest ½
export const fmt = (n) => (n == null ? '' : (Math.round(n * 10) / 10).toString());

// Wire color of a strand: the plan line's color, else the quote's wire.
const WIRE = { white: ['White', '#FFFFFF'], black: ['Black', '#111111'], green: ['Green', '#1F7A35'] };
export const wireOf = (s, jobWire) => WIRE[s.line.color] ? s.line.color : WIRE[jobWire] ? jobWire : 'white';
export const wireHex = (k) => (WIRE[k] || WIRE.white)[1];
export const wireName = (k) => (WIRE[k] || WIRE.white)[0];

export const blankParts = (s) => s.pieces.map((p) => (p.slope ? { m: 's', run: '', deg: '' } : { m: 't', ft: '' }));
export function strandTotal(parts) {
  if (!parts?.length) return null;
  const fts = parts.map(pieceFeet);
  return fts.every((f) => f != null) ? fts.reduce((a, b) => a + b, 0) : null;
}


// ── Strands the crew actually wires ──
// The plan's drawn lines ("runs") are how Jude measures. The crew may run one wire across several
// of them (even across photos). groups = [["0-1","0-0"], ["0-3","1-0"], …] — runs joined into one strand,
// set by the crew. Any run not in a group is its own strand.
// Returns strands in install order (power first), each { id, no, runs: [run…], power, neighbors: [{ no, how }] }.
export function groupRuns(runs, groups = []) {
  const byKey = Object.fromEntries(runs.map((r) => [r.key, r]));
  const owner = {};
  const sets = [];
  (groups || []).forEach((g) => {
    const keys = (g || []).filter((k) => byKey[k] && !(k in owner));
    if (keys.length < 2) return;
    keys.forEach((k) => { owner[k] = sets.length; });
    sets.push(keys);
  });
  runs.forEach((r) => { if (!(r.key in owner)) { owner[r.key] = sets.length; sets.push([r.key]); } });

  // Strand graph: two strands hook up when any of their runs do.
  const nb = sets.map(() => new Map());
  sets.forEach((keys, a) => keys.forEach((k) => byKey[k].neighbors.forEach((n) => {
    const b = owner[`${byKey[k].si}-${n.li}`];
    if (b == null || b === a) return;
    if (!nb[a].has(b) || n.how === 'zip') nb[a].set(b, n.how);
  })));
  const powered = sets.map((keys) => keys.some((k) => byKey[k].power));
  const firstRun = (i) => Math.min(...sets[i].map((k) => byKey[k].no));
  const order = [];
  const seen = new Set();
  const walk = (start) => {
    const q = [...start];
    q.forEach((i) => seen.add(i));
    while (q.length) {
      const i = q.shift();
      order.push(i);
      [...nb[i].keys()].sort((a, b) => firstRun(a) - firstRun(b)).forEach((o) => { if (!seen.has(o)) { seen.add(o); q.push(o); } });
    }
  };
  walk(sets.map((_, i) => i).filter((i) => powered[i]).sort((a, b) => firstRun(a) - firstRun(b)));
  sets.map((_, i) => i).sort((a, b) => firstRun(a) - firstRun(b)).forEach((i) => { if (!seen.has(i)) walk([i]); });

  const noOf = {};
  order.forEach((i, n) => { noOf[i] = n + 1; });
  return order.map((i) => {
    const rs = sets[i].map((k) => byKey[k]);
    const p = rs.find((r) => r.power)?.power || null;
    return {
      id: sets[i][0], no: noOf[i], runs: rs, line: rs[0].line, power: p,
      neighbors: [...nb[i].entries()].map(([b, how]) => ({ no: noOf[b], how })).sort((a, b) => a.no - b.no),
    };
  });
}

// Feet for a whole strand: every run measured → sum, else null.
export function groupTotal(strand, partsOf) {
  const t = strand.runs.map((r) => strandTotal(partsOf(r.key)));
  return t.every((x) => x != null) ? t.reduce((a, b) => a + b, 0) : null;
}
export const groupPlan = (strand) => strand.runs.reduce((a, r) => a + (Number(r.line.feet) || 0), 0);

// ── Strands the crew drew on their own site photos ──
// map = { photos: [{ pid, no, w, h, lines: [{ id, s, pts, a: 'male'|'in', b: 'female'|'out'|'' }] }] }
// Every line with the same s is one strand (it went around a corner into the next photo).
// Returns { sides, strands } shaped like the plan's, so the measuring sheet works the same.
export function crewStrands(map, photoUrl) {
  const photos = map?.photos || [];
  const sides = photos.map((p, i) => ({
    plain: photoUrl(p.pid), w: p.w, h: p.h, label: `Photo ${i + 1}`, crew: true,
    lines: p.lines.filter((l) => l.k !== 'zip').map((l) => ({ pts: l.pts, ends: { a: l.a, b: l.b }, s: l.s })),
    jumps: p.lines.filter((l) => l.k === 'zip').map((l) => ({ pts: l.pts })), outlets: [], inlines: [],
  }));
  const byS = new Map();
  photos.forEach((p, si) => p.lines.filter((l) => l.k !== 'zip').forEach((l, li) => {
    const run = { key: `c${p.no}-${l.id}`, si, li, line: sides[si].lines[li], pts: l.pts, pieces: piecesOf({ pts: l.pts, mount: 'shingle' }, 0.5), power: null, neighbors: [], zips: [] };
    if (!byS.has(l.s)) byS.set(l.s, []);
    byS.get(l.s).push(run);
  }));
  const strands = [...byS.keys()].sort((a, b) => a - b).map((s, i) => {
    const runs = byS.get(s);
    return { id: runs[0].key, no: i + 1, s, runs, line: runs[0].line, power: null, neighbors: [], crew: true, open: runs.filter((r) => r.line.ends.b === 'out').length > runs.filter((r) => r.line.ends.a === 'in').length };
  });
  // Zip cords (no lights): feet saved under "zc<photo>-<line>".
  const zips = photos.flatMap((p, si) => p.lines.filter((l) => l.k === 'zip').map((l) => ({ key: `zc${p.no}-${l.id}`, si })));
  return { sides, strands, zips };
}

const PALETTE = ['#00DF00', '#38BDF8', '#F472B6', '#FACC15', '#A78BFA', '#FB923C', '#2DD4BF', '#F87171'];
export const strandColor = (rank) => PALETTE[(rank - 1) % PALETTE.length];

// Shrink a camera photo: ≤1280px JPEG (~150 KB) to draw on + a ~20 KB thumbnail → { data, thumb, w, h }.
export function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const draw = (max, q) => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return [c.toDataURL('image/jpeg', q), c.width, c.height];
      };
      const [data, w, h] = draw(1280, 0.7);
      const [thumb] = draw(420, 0.6);
      URL.revokeObjectURL(url);
      resolve({ data, thumb, w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Couldn’t read that photo')); };
    img.src = url;
  });
}

