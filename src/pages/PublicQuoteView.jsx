import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Check, MessageSquare, Loader2, FileText, MapPin, Phone, Mail } from 'lucide-react';

const money = (n) => (Number(n || 0)).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

// Client-facing read-only quote at /q/:token. No auth — token-gated via RLS policy.
// Client can Approve or Request Changes; both flip the quote's status.
export default function PublicQuoteView() {
  const { token } = useParams();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('hub_quotes').select('*').eq('public_token', token).maybeSingle();
    if (error) setError(error.message);
    setQuote(data || null);
    setLoading(false);
    // Stamp first-view if not already set.
    if (data && !data.viewed_at) {
      await supabase.from('hub_quotes').update({ viewed_at: new Date().toISOString() }).eq('public_token', token);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const approve = async () => {
    setSubmitting(true);
    const { error } = await supabase.from('hub_quotes')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('public_token', token);
    setSubmitting(false);
    if (error) { alert(`Couldn't approve: ${error.message}`); return; }
    load();
  };

  const requestChanges = async () => {
    if (!changeNote.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from('hub_quotes')
      .update({ status: 'changes_requested', client_response_note: changeNote })
      .eq('public_token', token);
    setSubmitting(false);
    if (error) { alert(`Couldn't submit: ${error.message}`); return; }
    setRequestChangesOpen(false);
    load();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-bg"><Loader2 size={32} className="text-muted animate-spin" /></div>;
  if (error || !quote) return <div className="min-h-screen flex items-center justify-center bg-bg p-6 text-center"><p className="text-secondary">This quote link is invalid or has expired.</p></div>;

  const payload = quote.raw_payload || {};
  const clientName = payload.client_name || 'Customer';
  const lineItems = (payload.line_items || []).filter(li => li.kind !== 'text' || (li.text || '').trim());
  const alreadyApproved = quote.status === 'approved';
  const alreadyRequested = quote.status === 'changes_requested';

  return (
    <div className="min-h-screen bg-bg py-8 px-4">
      <div className="max-w-3xl mx-auto bg-card border border-border-subtle rounded-2xl overflow-hidden">
        <div className="h-1 bg-brand" />

        {/* Header */}
        <div className="p-6 border-b border-border-subtle">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={20} className="text-brand-text" />
            <h1 className="text-2xl font-black text-primary">
              {quote.title || `Quote for ${clientName}`}
            </h1>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Quote #</p>
              <p className="text-primary mt-1 font-semibold">#{quote.quote_number}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Date</p>
              <p className="text-primary mt-1 font-semibold">{fmtDate(quote.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Intro */}
        {payload.intro && (payload.intro.title || payload.intro.description || payload.intro.image_url) && (
          <div className="p-6 border-b border-border-subtle">
            {payload.intro.image_url && (
              <div className="flex justify-center mb-4">
                <img src={payload.intro.image_url} alt="" className="max-h-80 object-contain" />
              </div>
            )}
            {payload.intro.title && <h2 className="text-xl font-black text-primary mb-2">{payload.intro.title}</h2>}
            {payload.intro.description && <p className="text-sm text-secondary whitespace-pre-wrap">{payload.intro.description}</p>}
          </div>
        )}

        {/* Line items */}
        <div className="p-6 border-b border-border-subtle">
          <h2 className="text-lg font-black text-primary mb-4">What's Included</h2>
          <ul className="space-y-3">
            {lineItems.map((li, idx) => {
              if (li.kind === 'text') return <li key={idx} className="text-sm text-secondary italic">{li.text}</li>;
              if (li.kind === 'option_set') {
                const sel = (li.options || []).find(o => o.id === li.selected_option_id) || li.options?.[0];
                const mods = (li.modifiers || []).filter(m => m.selected);
                const total = (sel ? Number(sel.price || 0) : 0) + mods.reduce((s, m) => s + Number(m.price || 0), 0);
                return (
                  <li key={idx} className="rounded-lg border border-border-subtle p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-primary">{li.name || 'Service'}</p>
                      <p className="font-bold text-primary">{money(total)}{sel?.price_unit ? <span className="text-xs font-normal text-muted ml-1">{sel.price_unit}</span> : null}</p>
                    </div>
                    {li.description && <p className="text-sm text-secondary mt-1 whitespace-pre-wrap">{li.description}</p>}
                    {sel && <p className="text-sm text-secondary mt-2">Selected: <span className="font-semibold text-primary">{sel.label}</span></p>}
                    {mods.length > 0 && (
                      <ul className="text-sm text-secondary mt-1 pl-4 list-disc">
                        {mods.map(m => <li key={m.id}>{m.label} (+{money(m.price)})</li>)}
                      </ul>
                    )}
                  </li>
                );
              }
              const total = li.manual_total != null
                ? Number(li.manual_total)
                : Number(li.qty || 1) * Number(li.unit_price || 0);
              return (
                <li key={idx} className={`flex items-start justify-between gap-4 ${li.optional ? 'opacity-60' : ''}`}>
                  <div className="flex-1">
                    <p className="font-bold text-primary">
                      {li.name || 'Item'}
                      {li.optional && <span className="text-xs text-muted font-normal ml-2">(optional)</span>}
                    </p>
                    {li.description && <p className="text-sm text-secondary mt-1 whitespace-pre-wrap">{li.description}</p>}
                    {li.image_url && <img src={li.image_url} alt="" className="mt-2 max-h-32 rounded-md" />}
                  </div>
                  <p className="font-bold text-primary shrink-0 text-right">
                    {money(total)}
                    {li.price_unit && <span className="text-xs font-normal text-muted ml-1 block">{li.price_unit}</span>}
                  </p>
                </li>
              );
            })}
          </ul>

          {/* Totals */}
          <div className="mt-6 pt-4 border-t border-border-subtle space-y-1 text-sm max-w-xs ml-auto">
            <div className="flex justify-between"><span className="text-secondary">Subtotal</span><span className="text-primary">{money(quote.subtotal)}</span></div>
            {Number(quote.discount) > 0 && <div className="flex justify-between"><span className="text-secondary">Discount</span><span className="text-primary">−{money(quote.discount)}</span></div>}
            {Number(quote.tax) > 0 && <div className="flex justify-between"><span className="text-secondary">Tax</span><span className="text-primary">{money(quote.tax)}</span></div>}
            <div className="flex justify-between text-lg font-black pt-2 border-t border-border-subtle"><span>Total</span><span>{money(quote.total)}</span></div>
          </div>
        </div>

        {/* Client message */}
        {payload.client_message && (
          <div className="p-6 border-b border-border-subtle whitespace-pre-wrap text-sm text-secondary">{payload.client_message}</div>
        )}

        {/* Contract */}
        {payload.contract && (
          <div className="p-6 border-b border-border-subtle">
            <h3 className="text-sm font-black text-primary mb-2">Terms</h3>
            <p className="text-xs text-secondary whitespace-pre-wrap leading-relaxed">{payload.contract}</p>
          </div>
        )}

        {/* Action bar */}
        <div className="p-6 bg-surface-alt/40">
          {alreadyApproved ? (
            <div className="text-center">
              <Check size={32} className="text-emerald-500 mx-auto mb-2" />
              <p className="font-bold text-emerald-600">Quote Approved</p>
              <p className="text-xs text-secondary mt-1">Approved {fmtDate(quote.approved_at)}</p>
            </div>
          ) : alreadyRequested ? (
            <div className="text-center">
              <MessageSquare size={24} className="text-amber-500 mx-auto mb-2" />
              <p className="font-bold text-amber-600">Changes Requested</p>
              {quote.client_response_note && <p className="text-sm text-secondary mt-2 italic">"{quote.client_response_note}"</p>}
            </div>
          ) : requestChangesOpen ? (
            <div className="space-y-3">
              <textarea
                value={changeNote}
                onChange={e => setChangeNote(e.target.value)}
                placeholder="What changes would you like? (e.g. swap weekly for biweekly, add hedge trim, etc.)"
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-border-subtle bg-card text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50 resize-y" />
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => { setRequestChangesOpen(false); setChangeNote(''); }}
                  className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-bold text-primary cursor-pointer">Cancel</button>
                <button onClick={requestChanges} disabled={submitting || !changeNote.trim()}
                  className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold disabled:opacity-50 cursor-pointer">
                  {submitting ? 'Sending…' : 'Send Request'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setRequestChangesOpen(true)}
                className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-card cursor-pointer">
                Request Changes
              </button>
              <button onClick={approve} disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover disabled:opacity-50 cursor-pointer">
                <Check size={16} /> Approve Quote
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
