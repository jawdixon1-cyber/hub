// What every add-on uses from Material, added up ({ itemId: qty }) — only the ones that start added.
export const addonTotals = (list) => {
  const t = {};
  (list || []).filter((a) => a.on !== false).forEach((a) => {
    // Strands set but no item follows them (e.g. a bush added by hand) → they're mini strands.
    const items = (a.items || []).some((it) => it.qty === 'strands') || !(Number(a.strands) > 0)
      ? (a.items || []) : [...(a.items || []), { id: 'mini-warm', qty: 'strands' }];
    items.forEach((it) => {
      const q = it.qty === 'strands' ? Number(a.strands) || 0 : Number(it.qty) || 0;
      if (it.id && q > 0) t[it.id] = (t[it.id] || 0) + q;
    });
  });
  return t;
};

// An add-on with strands is always priced strands × $/strand (so a stale price can't stick);
// one without strands (wreath, garland…) keeps the price typed in.
export const PER_STRAND = 40;
export const addonPrice = (a, perStrand = PER_STRAND) => {
  const n = Number(a?.strands) || 0; const per = Number(perStrand) > 0 ? Number(perStrand) : PER_STRAND;
  return n > 0 ? n * per : Number(a?.price) || 0;
};
export const pricedAddons = (list, perStrand) => (list || []).map((a) => ({ ...a, price: addonPrice(a, perStrand) }));
