import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Present step: exactly what the client's Jobber quote will say, built by the same
// server code that creates the real quote. Pick seasons + add-ons to see each version.

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function LightsQuotePreview({ quoteId }) {
  const { session } = useAuth();
  const token = session?.access_token || '';
  const [years, setYears] = useState(1);
  const [addonIds, setAddonIds] = useState([]);
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [showTerms, setShowTerms] = useState(false);
  const [made, setMade] = useState({ busy: false, quote: null, error: null });
  // Same call the presentation makes when the client picks: one Jobber quote per presentation.
  const createQuote = async () => {
    setMade({ busy: true, quote: null, error: null });
    try {
      const r = await fetch('/api/jobber-data?action=lights-quote-create', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: quoteId, years, addonIds }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      setMade({ busy: false, quote: d, error: null });
    } catch (e) { setMade({ busy: false, quote: null, error: e.message }); }
  };

  useEffect(() => {
    if (!quoteId || !token) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch('/api/jobber-data?action=lights-quote-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: quoteId, years, addonIds }),
    })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Error ${r.status}`); return d; })
      .then((d) => { if (alive) setState({ loading: false, data: d, error: null }); })
      .catch((e) => { if (alive) setState({ loading: false, data: null, error: e.message }); });
    return () => { alive = false; };
  }, [quoteId, token, years, addonIds]);

  if (!quoteId) return null;
  const d = state.data;
  const toggle = (id) => setAddonIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <div className="rounded-xl border border-border-default bg-card p-4">
      <p className="text-base font-bold text-primary">What their quote will say</p>
      <p className="text-xs text-muted mb-3">The exact Jobber quote that gets created when they pick. Try each option.</p>

      {/* Options they can pick at the presentation */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {[1, 2, 3].map((y) => (
          <button key={y} onClick={() => setYears(y)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${years === y ? 'bg-brand text-on-brand' : 'bg-surface-alt text-primary hover:bg-surface'}`}>
            {y} season{y > 1 ? 's' : ''}{y === 2 ? ' (5% off)' : y === 3 ? ' (10% off)' : ''}
          </button>
        ))}
      </div>
      {d?.availableAddons?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {d.availableAddons.map((a) => (
            <label key={a.id} className="inline-flex items-center gap-1.5 text-sm text-primary bg-surface-alt px-2.5 py-1 rounded-lg cursor-pointer">
              <input type="checkbox" checked={addonIds.includes(a.id)} onChange={() => toggle(a.id)} />
              {a.label} <span className="text-muted">{money(a.price)}</span>
            </label>
          ))}
        </div>
      )}

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.loading && !d && <p className="text-sm text-muted">Building the preview…</p>}

      {d && (
        <div className={`rounded-lg border border-border-default bg-surface-alt/40 p-4 ${state.loading ? 'opacity-60' : ''}`}>
          <p className="text-lg font-bold text-primary mb-3">{d.title}</p>
          <div className="divide-y divide-border-subtle">
            {d.lineItems.map((li, i) => (
              <div key={i} className="py-2.5 flex gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary">{li.name}</p>
                  {li.description && <p className="text-xs text-secondary whitespace-pre-wrap mt-1">{li.description}</p>}
                </div>
                <p className={`text-sm font-semibold shrink-0 ${li.unitPrice < 0 ? 'text-brand-text' : 'text-primary'}`}>
                  {li.unitPrice === 0 ? '$0.00' : money(li.unitPrice * (li.quantity || 1))}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t border-border-default mt-2 pt-2 space-y-1 text-sm">
            <Row k="Subtotal" v={money(d.subtotal)} />
            {d.discount > 0 && <Row k={`Discount (${d.discountRate}%)`} v={`−${money(d.discount)}`} accent />}
            <Row k="Total" v={money(d.total)} bold />
            <Row k={`Deposit due at approval (${d.depositRate}%)`} v={money(d.deposit)} muted />
          </div>
          <button onClick={() => setShowTerms((v) => !v)} className="mt-3 text-xs font-semibold text-muted hover:text-primary inline-flex items-center gap-1 cursor-pointer">
            <ChevronDown size={12} className={showTerms ? 'rotate-180' : ''} /> {showTerms ? 'Hide' : 'Show'} the terms on the quote
          </button>
          {showTerms && <p className="mt-2 text-xs text-secondary whitespace-pre-wrap">{d.message}</p>}
        </div>
      )}

      {d && (
        <div className="mt-3">
          {made.quote ? (
            <div className="rounded-lg border border-border-brand bg-brand-light p-3 flex items-center gap-3 flex-wrap">
              <p className="flex-1 text-sm font-semibold text-primary">
                {made.quote.existing ? 'Already in Jobber' : '✓ Created in Jobber'}: quote #{made.quote.quoteNumber}
                {made.quote.total != null && <span className="text-secondary"> · {money(made.quote.total)}</span>}
              </p>
              {made.quote.url && <a href={made.quote.url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-brand text-on-brand px-4 py-2 text-sm font-bold">Open in Jobber ↗</a>}
            </div>
          ) : (
            <button onClick={createQuote} disabled={made.busy || state.loading}
              className="w-full rounded-xl bg-brand text-on-brand py-3 text-base font-bold hover:bg-brand-hover disabled:opacity-50 cursor-pointer">
              {made.busy ? 'Creating in Jobber…' : `Create quote in Jobber · ${years} season${years > 1 ? 's' : ''}`}
            </button>
          )}
          {made.error && <p className="text-sm text-red-400 mt-1">{made.error}</p>}
        </div>
      )}
    </div>
  );
}

function Row({ k, v, bold, muted, accent }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={muted ? 'text-muted' : 'text-secondary'}>{k}</span>
      <span className={`${bold ? 'font-bold text-primary text-base' : muted ? 'text-muted' : 'text-primary'} ${accent ? 'text-brand-text' : ''}`}>{v}</span>
    </div>
  );
}
