import { Trash2, Minus } from 'lucide-react';
import { getNetSqft } from './mapUtils';

function fmt(n) {
  return n.toLocaleString('en-US');
}

const CATEGORY_META = {
  lawn: { label: 'Lawn', color: '#22c55e' },
  beds: { label: 'Beds', color: '#ef4444' },
  exclude: { label: 'Exclude', color: '#6b7280' },
};

export default function MeasurementList({ measurements, onUpdate, onDelete }) {
  if (!measurements.length) {
    return (
      <p className="text-sm text-tertiary italic py-3">
        Tap + on the map, pick Lawn, Beds, or Exclude, then plot dots to measure areas.
      </p>
    );
  }

  // Group by category
  const groups = {};
  measurements.forEach((m) => {
    const cat = m.category || 'lawn';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  });

  const excludes = groups.exclude || [];

  const categoryOrder = ['lawn', 'beds', 'exclude'];

  // Compute net totals for lawn and beds
  const netTotals = {};
  for (const catId of ['lawn', 'beds']) {
    const items = groups[catId] || [];
    netTotals[catId] = items.reduce((sum, m) => sum + getNetSqft(m, excludes), 0);
  }
  const grandTotal = netTotals.lawn + netTotals.beds;

  return (
    <div className="space-y-4">
      {categoryOrder.map((catId) => {
        const items = groups[catId];
        if (!items || items.length === 0) return null;
        const meta = CATEGORY_META[catId] || { label: catId, color: '#888' };
        const isExclude = catId === 'exclude';
        const catGross = items.reduce((sum, m) => sum + m.sqft, 0);

        return (
          <div key={catId}>
            {/* Category header */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: meta.color }}
              />
              <span className="text-xs font-bold text-secondary uppercase tracking-wide">
                {meta.label}
              </span>
              {isExclude ? (
                <span className="text-xs font-semibold text-muted ml-auto">
                  <Minus size={10} className="inline mr-0.5" />{fmt(catGross)} ft²
                </span>
              ) : (
                <span className="text-xs font-semibold text-muted ml-auto">
                  {excludes.length > 0 && netTotals[catId] !== catGross
                    ? <><span className="line-through opacity-50">{fmt(catGross)}</span> {fmt(netTotals[catId])} ft²</>
                    : <>{fmt(catGross)} ft²</>
                  }
                </span>
              )}
            </div>

            {/* Items */}
            <div className="space-y-1.5">
              {items.map((m) => {
                const net = isExclude ? m.sqft : getNetSqft(m, excludes);
                const hasExclusion = !isExclude && net !== m.sqft;

                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
                      isExclude
                        ? 'bg-gray-50 dark:bg-gray-900/20 border-gray-300 dark:border-gray-700'
                        : 'bg-surface border-border-subtle'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-sm shrink-0"
                      style={{ backgroundColor: m.color }}
                    />
                    <input
                      type="text"
                      value={m.label}
                      onChange={(e) => onUpdate(m.id, { label: e.target.value })}
                      className="flex-1 min-w-0 bg-transparent text-sm text-primary font-medium outline-none border-b border-transparent focus:border-brand transition-colors"
                    />
                    <span className="text-sm font-semibold text-secondary whitespace-nowrap">
                      {isExclude && <Minus size={10} className="inline mr-0.5" />}
                      {hasExclusion ? (
                        <><span className="line-through opacity-50 mr-1">{fmt(m.sqft)}</span>{fmt(net)}</>
                      ) : (
                        fmt(m.sqft)
                      )} ft²
                    </span>
                    <button
                      onClick={() => onDelete(m.id)}
                      className="p-1 rounded hover:bg-surface-alt transition-colors cursor-pointer text-muted hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Grand total (net) */}
      <div className="flex items-center justify-between pt-2 border-t border-border-default">
        <span className="text-sm font-bold text-primary">Net Total</span>
        <span className="text-sm font-bold text-primary">{fmt(grandTotal)} ft²</span>
      </div>
    </div>
  );
}
