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
