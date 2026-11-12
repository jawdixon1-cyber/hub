// Extras: things lit besides the roofline (columns, railings, trees, bushes…), priced per mini strand.
// One strand = STRAND_FT feet of lights.

export const STRAND_FT = 24;

const n = (v) => Number(v) || 0;

// Each type: which measurements it takes and how many feet of lights that comes to.
//   wrap: spiral around something — length = √((wraps × around)² + run²); 0 wraps = straight along it
export const EXTRA_TYPES = [
  { id: 'column', label: 'Column', fields: [['run', 'Height ft'], ['around', 'Around ft'], ['wraps', 'Wraps']], kind: 'wrap', prompt: 'column wrapped in a spiral' },
  { id: 'railing', label: 'Railing', fields: [['run', 'Length ft'], ['around', 'Around ft'], ['wraps', 'Wraps']], kind: 'wrap', prompt: 'railing' },
  { id: 'trunk', label: 'Tree trunk', fields: [['run', 'Height ft'], ['around', 'Around ft'], ['wraps', 'Wraps']], kind: 'wrap', prompt: 'tree trunk wrapped in a spiral' },
  { id: 'tree', label: 'Full tree', fields: [['run', 'Height ft'], ['width', 'Width ft']], kind: 'area', per: 6, prompt: 'whole tree (trunk and branches)' },
  { id: 'bush', label: 'Bush', fields: [['width', 'Width ft'], ['run', 'Height ft']], kind: 'area', per: 9, prompt: 'bush, lights draped evenly over it' },
  { id: 'other', label: 'Other', fields: [], kind: 'manual', prompt: 'item' },
];
export const typeOf = (id) => EXTRA_TYPES.find((t) => t.id === id) || EXTRA_TYPES[0];

// { ft, strands, math } for one item. item.strands (typed) overrides the math.
export function extraMath(item) {
  const t = typeOf(item.type);
  let ft = 0;
  let math = '';
  if (t.kind === 'wrap') {
    const run = n(item.run);
    const wraps = n(item.wraps);
    const around = n(item.around);
    ft = wraps > 0 && around > 0 ? Math.sqrt((wraps * around) ** 2 + run ** 2) : run;
    math = wraps > 0 && around > 0 ? `${wraps} wraps × ${around} ft around, ${run} ft ${t.id === 'railing' ? 'long' : 'tall'} → ${Math.round(ft * 10) / 10} ft of lights` : `${run} ft straight`;
  } else if (t.kind === 'area') {
    const sq = n(item.width) * n(item.run);
    const s = sq > 0 ? Math.max(1, Math.ceil(sq / t.per)) : 0;
    ft = s * STRAND_FT;
    math = sq > 0 ? `${n(item.width)} × ${n(item.run)} ft = ${Math.round(sq)} sq ft ÷ ${t.per} per strand` : '';
  }
  const auto = t.kind === 'wrap' ? (ft > 0 ? Math.ceil(ft / STRAND_FT) : 0) : t.kind === 'area' ? Math.round(ft / STRAND_FT) : 0;
  const typed = item.strands !== undefined && item.strands !== '' ? n(item.strands) : null;
  return { ft, auto, strands: typed ?? auto, typed: typed !== null, math };
}

export const extrasStrands = (extras) => (extras || []).reduce((t, it) => t + extraMath(it).strands, 0);

// Lines for the ChatGPT prompt: "1. Column wrapped in a spiral (2 strands)…"
export function extrasPromptLines(extras) {
  return (extras || []).map((it, i) => {
    const t = typeOf(it.type);
    const { strands } = extraMath(it);
    const wraps = t.kind === 'wrap' && n(it.wraps) > 0 ? `, wrapped ${n(it.wraps)} times` : '';
    return `${i + 1}. ${it.label?.trim() || t.label} — ${t.prompt}${wraps} (about ${strands} strand${strands === 1 ? '' : 's'} of mini lights)`;
  });
}
