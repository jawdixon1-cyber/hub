import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';

// Resolve the team-member list from the app store's permissions map + ensure the
// owner is always present (even if they aren't keyed in `permissions`).
function useTeamMembers() {
  const permissions = useAppStore((s) => s.permissions) || {};
  const { currentUser, user } = useAuth();
  const list = Object.entries(permissions).map(([email, info]) => ({ email, name: info?.name || email }));
  const ownerEmail = user?.email?.toLowerCase();
  if (ownerEmail && !permissions[ownerEmail]) {
    list.unshift({ email: ownerEmail, name: currentUser || user?.user_metadata?.full_name || user?.email || 'Owner' });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}
import {
  Plus, FileText, Loader2, Search, MoreHorizontal, X, ChevronRight,
  Trash2, Image as ImageIcon, GripVertical, Eye, Pencil, Check,
  MapPin, Phone, Mail, Home as HomeIcon, RefreshCw, MessageSquare,
} from 'lucide-react';
import { compressImage } from './Requests';

// Quote templates — pre-fill the builder with common service packages.
// Edit/extend these as offerings grow. Each template becomes a starting point
// for a draft quote; the builder (Phase 2) will use `line_items` to seed sections.
const QUOTE_TEMPLATES = [
  { id: 'aeration-fescue', label: 'Aeration Plus Package — Fescue', line_items: [] },
  { id: 'cleanup',         label: 'Cleanup',                         line_items: [] },
  { id: 'hedges',          label: 'Hedges',                          line_items: [] },
  { id: 'lawn',            label: 'Lawn',                            line_items: [] },
];

// ─── Status config — Jobber buckets: Draft / Awaiting response / Changes requested / Approved.
// "Converted" and "Archived" exist as terminal states too, but the overview card mirrors Jobber.
const STATUS_CONFIG = {
  draft:               { label: 'Draft',              dot: 'bg-slate-400'  },
  awaiting_response:   { label: 'Awaiting response',  dot: 'bg-amber-500'  },
  changes_requested:   { label: 'Changes requested',  dot: 'bg-rose-500'   },
  approved:            { label: 'Approved',           dot: 'bg-emerald-500'},
  converted:           { label: 'Converted',          dot: 'bg-cyan-500'   },
  archived:            { label: 'Archived',           dot: 'bg-zinc-500'   },
};

const money = (n) => (Number(n || 0)).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
// "8034878656" → "(803) 487-8656". Falls back to the input if it isn't a 10-digit US number.
// Common cadences for the "price per…" field. Users can type any free-form value;
// these just feed a datalist for quick selection.
const PRICE_UNIT_SUGGESTIONS = [
  'per visit', 'per month', 'per week', 'one-time', 'per yard', 'per hour', 'per sq ft', 'per linear ft',
];

// Dollar contribution of a single line item to the quote subtotal.
function lineItemContribution(li) {
  if (!li || li.kind === 'text') return 0;
  if (li.kind === 'option_set') {
    const opt = (li.options || []).find(o => o.id === li.selected_option_id);
    const base = opt ? Number(opt.price || 0) : 0;
    const mods = (li.modifiers || []).reduce((s, m) => s + (m.selected ? Number(m.price || 0) : 0), 0);
    return base + mods;
  }
  if (li.optional) return 0;
  // Manual override wins over derived qty × unit_price.
  if (li.manual_total != null) return Number(li.manual_total);
  if (li.show_unit_price === false) return 0;
  return Number(li.qty || 1) * Number(li.unit_price || 0);
}

function fmtPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return raw;
}

export default function Quotes() {
  const { orgId, currentUser, user } = useAuth();
  const defaultSalesperson = currentUser || user?.user_metadata?.full_name || user?.email || '';
  const navigate = useNavigate();
  const { quoteNumber: urlQuoteNumber } = useParams();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);

  const createQuote = async ({ template_id, title }) => {
    const tpl = QUOTE_TEMPLATES.find(t => t.id === template_id);
    const finalTitle = title || tpl?.label || 'New Quote';
    const { data, error } = await supabase.from('hub_quotes').insert({
      org_id: orgId,
      title: finalTitle,
      status: 'draft',
      raw_payload: { template_id: template_id || null, line_items: tpl?.line_items || [] },
    }).select('*').single();
    if (error) { console.error('[Quotes] create error:', error.message); return; }
    setShowNewQuote(false);
    await fetchQuotes();
    navigate(`/quotes/${data.quote_number ?? data.id}`);
  };

  const fetchQuotes = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('hub_quotes').select('*').eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error) console.error('[Quotes] fetch error:', error.message);
    setQuotes(data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  // Resolve /quotes/:quoteNumber → selected quote, like Clients/Requests do.
  useEffect(() => {
    if (!urlQuoteNumber) { if (selected) setSelected(null); return; }
    if (quotes.length === 0) return;
    const asNum = Number(urlQuoteNumber);
    const match = quotes.find(q =>
      (Number.isFinite(asNum) && Number(q.quote_number) === asNum) || q.id === urlQuoteNumber
    );
    if (match) setSelected(match);
  }, [urlQuoteNumber, quotes]);

  // ── KPI counts (overview card)
  const counts = useMemo(() => {
    const c = { draft: 0, awaiting_response: 0, changes_requested: 0, approved: 0 };
    for (const q of quotes) if (c[q.status] !== undefined) c[q.status]++;
    return c;
  }, [quotes]);

  // ── 30-day rollups for Sent / Converted KPIs
  const thirtyDays = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let sentCount = 0, sentTotal = 0, convCount = 0, convTotal = 0;
    for (const q of quotes) {
      const sentTs = q.sent_at ? new Date(q.sent_at).getTime() : null;
      if (sentTs && sentTs >= cutoff) { sentCount++; sentTotal += Number(q.total || 0); }
      const apTs = q.approved_at ? new Date(q.approved_at).getTime() : null;
      if (apTs && apTs >= cutoff) { convCount++; convTotal += Number(q.total || 0); }
    }
    return { sentCount, sentTotal, convCount, convTotal };
  }, [quotes]);

  const conversionRate = thirtyDays.sentCount ? Math.round(100 * thirtyDays.convCount / thirtyDays.sentCount) : 0;

  // ── Filtered list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter(row => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!q) return true;
      const blob = [row.title, row.quote_number, row.raw_payload?.client_name, row.raw_payload?.property]
        .filter(Boolean).join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [quotes, search, statusFilter]);

  if (selected) {
    return <QuoteDetail quote={selected} onBack={() => { setSelected(null); navigate('/quotes'); }} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-black text-primary">Quotes</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewQuote(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer transition-colors">
            <Plus size={16} /> New Quote
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMoreActions(v => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer transition-colors">
              <MoreHorizontal size={16} /> More Actions
            </button>
            {showMoreActions && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreActions(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl py-1 min-w-[220px]">
                  <button onClick={() => { setShowMoreActions(false); alert('Export coming soon'); }}
                    className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-surface-alt cursor-pointer text-secondary">
                    Export quotes (CSV)
                  </button>
                  <button onClick={() => { setShowMoreActions(false); alert('Templates manager coming soon'); }}
                    className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-surface-alt cursor-pointer text-secondary">
                    Manage templates
                  </button>
                  <div className="border-t border-border-subtle my-1" />
                  <button onClick={() => { setShowMoreActions(false); setStatusFilter('archived'); }}
                    className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-surface-alt cursor-pointer text-secondary">
                    View archived
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-card border border-border-subtle p-5">
          <p className="text-sm font-black text-primary mb-3">Overview</p>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-400" /><span className="text-secondary">Draft</span><span className="ml-auto text-primary font-semibold">({counts.draft})</span></li>
            <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-secondary">Awaiting response</span><span className="ml-auto text-primary font-semibold">({counts.awaiting_response})</span></li>
            <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-500" /><span className="text-secondary">Changes requested</span><span className="ml-auto text-primary font-semibold">({counts.changes_requested})</span></li>
            <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-secondary">Approved</span><span className="ml-auto text-primary font-semibold">({counts.approved})</span></li>
          </ul>
        </div>

        <KpiCard label="Conversion rate" sub="Past 30 days" big={`${conversionRate}%`} />
        <KpiCard label="Sent" sub="Past 30 days" big={String(thirtyDays.sentCount)} foot={money(thirtyDays.sentTotal)} />
        <KpiCard label="Converted" sub="Past 30 days" big={String(thirtyDays.convCount)} foot={money(thirtyDays.convTotal)} />
      </div>

      {/* Filters + search */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-full bg-surface-alt border border-border-subtle text-sm text-primary cursor-pointer">
            <option value="all">Status | All</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search quotes..."
            className="w-full pl-9 pr-3 py-2 rounded-full bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50" />
        </div>
      </div>

      {/* All quotes — flush with page, no card wrapper */}
      <div>
        <h2 className="text-2xl font-black text-primary mb-3">
          All quotes <span className="text-muted text-base font-medium">({filtered.length} results)</span>
        </h2>

        {loading ? (
          <div className="py-16 flex items-center justify-center"><Loader2 size={20} className="text-muted animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={() => setShowNewQuote(true)} hasAny={quotes.length > 0} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-subtle">
                  <th className="px-3 py-2.5">Client</th>
                  <th className="px-3 py-2.5">Quote #</th>
                  <th className="px-3 py-2.5">Property</th>
                  <th className="px-3 py-2.5">Created</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => {
                  const cfg = STATUS_CONFIG[q.status] || STATUS_CONFIG.draft;
                  return (
                    <tr key={q.id}
                      onClick={() => { setSelected(q); navigate(`/quotes/${q.quote_number ?? q.id}`); }}
                      className="cursor-pointer hover:bg-white/[0.02] transition-colors border-b border-border-subtle/40">
                      <td className="px-3 py-3 font-bold text-primary">{q.raw_payload?.client_name || q.title || '—'}</td>
                      <td className="px-3 py-3 text-secondary">#{q.quote_number ?? '—'}</td>
                      <td className="px-3 py-3 text-secondary">{q.raw_payload?.property || '—'}</td>
                      <td className="px-3 py-3 text-secondary">{fmtDate(q.created_at)}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary">
                          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />{cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-primary">{money(q.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewQuote && <NewQuoteModal onClose={() => setShowNewQuote(false)} onCreate={createQuote} />}
    </div>
  );
}

function NewQuoteModal({ onClose, onCreate }) {
  const [saving, setSaving] = useState(false);
  const pick = async (template_id) => {
    setSaving(true);
    await onCreate({ template_id });
    setSaving(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-md">
        <div className="h-1 bg-brand rounded-t-2xl" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-black text-primary">New quote</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-primary cursor-pointer"><X size={16} /></button>
        </div>
        <div className="p-2">
          <p className="px-4 py-3 text-xs font-bold text-muted uppercase tracking-wider">Use template</p>
          <ul>
            {QUOTE_TEMPLATES.map(tpl => (
              <li key={tpl.id}>
                <button disabled={saving} onClick={() => pick(tpl.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm text-primary hover:bg-surface-alt cursor-pointer disabled:opacity-50 border-t border-border-subtle/40">
                  <span>{tpl.label}</span>
                  <ChevronRight size={16} className="text-muted" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3 my-3 px-4">
            <div className="flex-1 h-px bg-border-subtle" />
            <p className="text-xs text-muted">or</p>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>
          <div className="px-4 pb-4">
            <button disabled={saving} onClick={() => pick(null)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create New Quote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, sub, big, foot }) {
  return (
    <div className="rounded-2xl bg-card border border-border-subtle p-5">
      <p className="text-sm font-black text-primary">{label}</p>
      <p className="text-xs text-muted mt-0.5">{sub}</p>
      <p className="text-3xl font-black text-primary mt-4">{big}</p>
      {foot && <p className="text-xs text-muted mt-1">{foot}</p>}
    </div>
  );
}

function EmptyState({ onCreate, hasAny }) {
  return (
    <div className="py-16 flex flex-col items-center justify-center text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-3">
        <FileText size={24} className="text-brand-text" />
      </div>
      <h3 className="text-lg font-black text-primary">{hasAny ? 'No quotes match your filters' : 'No quotes yet'}</h3>
      <p className="text-sm text-secondary mt-1 max-w-sm">{hasAny ? 'Try clearing filters or searching for something else.' : 'Create your first quote to start sending pricing to clients.'}</p>
      {!hasAny && (
        <button onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer transition-colors">
          <Plus size={16} /> New Quote
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Quote builder — full Jobber-style document editor.
   State lives in `draft`. Save flushes to DB. Cancel returns to list.
   ═══════════════════════════════════════════════════════════════════ */

const DEFAULT_CONTRACT = `Quote Validity
Lock in your quote. This quote is valid for 14 days, after which pricing may be subject to change.

No Long-Term Commitment
Stay flexible. There's no long-term commitment. You can switch or cancel anytime with at least 24 hours' notice before your next visit.

Service Alerts
You'll never be left guessing. We send a reminder the day before each visit and an "On the Way" text when our crew is en route each visit.

Simple Billing
We keep it hassle-free. After each visit is complete, your card on file is securely charged, and a receipt is sent by email immediately.`;

const DEFAULT_CLIENT_MESSAGE = `Hey ____,

Your quote is ready.

Click "View Quote" below to review the details and approve your preferred option.

If you have any questions, reply here or call/text me.`;

// Optional sections that can be added/removed via "+ Add section" pills.
// Each blank quote starts with just: Header → Product/Service → Totals → Contract → Notes.
const OPTIONAL_SECTIONS = {
  introduction:    { label: 'Introduction',   slot: 'above' },
  attachments:     { label: 'Attachments',    slot: 'below' },
  images:          { label: 'Images',         slot: 'below' },
  reviews:         { label: 'Reviews',        slot: 'below' },
  client_message:  { label: 'Client message', slot: 'below' },
};

function QuoteDetail({ quote, onBack }) {
  const { orgId } = useAuth();
  const [draft, setDraft] = useState(() => normalizeDraft(quote));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [clientView, setClientView] = useState(false);
  const navigate = useNavigate();
  // Per-section editing. Brand-new drafts open with every section in edit mode
  // so the user can fill the quote out top-to-bottom. Saved quotes open in
  // view mode and each section's pencil flips it back to edit on demand.
  const wasSaved = new Date(quote.updated_at).getTime() > new Date(quote.created_at).getTime() + 2000;
  // Once the quote has been saved at least once, the universal Save bar disappears
  // entirely — only section-level Save/Cancel remain.
  const [everSaved, setEverSaved] = useState(wasSaved);
  const ALL_SECTION_IDS = ['header', 'introduction', 'product_service', 'totals', 'attachments', 'images', 'reviews', 'client_message', 'contract'];
  const [editingSections, setEditingSections] = useState(() => wasSaved ? new Set() : new Set(ALL_SECTION_IDS));
  const [sectionSnapshots, setSectionSnapshots] = useState({});
  const isEditing = (id) => editingSections.has(id);
  const startEdit = (id) => {
    // Snapshot draft so Cancel can revert what THIS section's edits changed.
    setSectionSnapshots(s => ({ ...s, [id]: JSON.parse(JSON.stringify(draft)) }));
    setEditingSections(s => new Set([...s, id]));
  };
  const cancelEdit = (id) => {
    const snap = sectionSnapshots[id];
    if (snap) setDraft(snap);
    setEditingSections(s => { const next = new Set(s); next.delete(id); return next; });
    setSectionSnapshots(s => { const next = { ...s }; delete next[id]; return next; });
  };
  const saveEdit = async (id) => {
    await save();
    setEditingSections(s => { const next = new Set(s); next.delete(id); return next; });
    setSectionSnapshots(s => { const next = { ...s }; delete next[id]; return next; });
  };
  // Aggregate "are we in any kind of edit" — controls global top-bar buttons.
  const mode = editingSections.size > 0 ? 'edit' : 'view';
  const setMode = (next) => {
    if (next === 'edit') setEditingSections(new Set(ALL_SECTION_IDS));
    else setEditingSections(new Set());
  };
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef(null);
  useEffect(() => {
    if (!showMore) return;
    const onDown = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showMore]);

  // Auto-title: when the client name changes, suggest "Quote for X" — but never
  // clobber a custom title the user already typed.
  const setClient = (client_id, client_name) => {
    setDraft(d => {
      const isAutoTitle = !d.title || /^Quote for /.test(d.title) || d.title === 'New Quote';
      return {
        ...d,
        client_id,
        title: isAutoTitle ? (client_name ? `Quote for ${client_name}` : '') : d.title,
        raw_payload: { ...d.raw_payload, client_name },
      };
    });
  };

  const updateStatus = async (next) => {
    setDraft(d => ({ ...d, status: next }));
    await supabase.from('hub_quotes').update({ status: next, updated_at: new Date().toISOString() }).eq('id', quote.id);
    setShowMore(false);
  };

  const deleteQuote = async () => {
    if (!confirm('Delete this quote? This cannot be undone.')) return;
    await supabase.from('hub_quotes').delete().eq('id', quote.id);
    navigate('/quotes');
  };

  const enabledSections = draft.raw_payload?.enabled_sections || [];
  const isEnabled = (k) => enabledSections.includes(k);
  const addSection = (k) => {
    if (isEnabled(k)) return;
    setDraft(d => ({ ...d, raw_payload: { ...d.raw_payload, enabled_sections: [...(d.raw_payload?.enabled_sections || []), k] } }));
  };
  const removeSection = (k) => {
    setDraft(d => ({ ...d, raw_payload: { ...d.raw_payload, enabled_sections: (d.raw_payload?.enabled_sections || []).filter(s => s !== k) } }));
  };
  const aboveSlot = Object.entries(OPTIONAL_SECTIONS).filter(([k, v]) => v.slot === 'above' && !isEnabled(k));
  const belowSlot = Object.entries(OPTIONAL_SECTIONS).filter(([k, v]) => v.slot === 'below' && !isEnabled(k));

  // Recompute totals whenever line items / discount / tax change.
  // Handles three line-item kinds:
  //   - text       → never counted
  //   - option_set → selected option's price + any selected modifiers
  //   - standard   → qty × unit_price (unless flagged optional)
  useEffect(() => {
    const subtotal = (draft.line_items || []).reduce((sum, li) => sum + lineItemContribution(li), 0);
    const total = Math.max(0, subtotal - Number(draft.discount || 0) + Number(draft.tax || 0));
    if (subtotal !== draft.subtotal || total !== draft.total) {
      setDraft(d => ({ ...d, subtotal, total }));
    }
  }, [draft.line_items, draft.discount, draft.tax]);

  const set = (patch) => setDraft(d => ({ ...d, ...patch }));
  const setPayload = (patch) => setDraft(d => ({ ...d, raw_payload: { ...d.raw_payload, ...patch } }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('hub_quotes').update({
      title: draft.title || null,
      client_id: draft.client_id || null,
      salesperson: draft.salesperson || null,
      subtotal: draft.subtotal || 0,
      discount: draft.discount || 0,
      tax: draft.tax || 0,
      total: draft.total || 0,
      status: draft.status || 'draft',
      raw_payload: draft.raw_payload || {},
    }).eq('id', quote.id);
    setSaving(false);
    if (error) { alert(`Save failed: ${error.message}`); return; }
    setSavedAt(new Date());
    setEverSaved(true);
    setMode('view');
  };

  const cfg = STATUS_CONFIG[draft.status] || STATUS_CONFIG.draft;

  return (
    <div className="max-w-4xl mx-auto pb-32 space-y-4">
      {/* Sticky top bar */}
      <div className="flex items-center justify-between gap-3 sticky top-0 bg-bg/95 backdrop-blur z-30 py-2 -mx-2 px-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-primary">
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />{cfg.label}
        </span>
        <div className="flex items-center gap-2">
          {savedAt && mode === 'edit' && <span className="text-xs text-muted">Saved {savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
          {mode === 'view' && (
            <>
              <div className="relative" ref={moreRef}>
                <button onClick={() => setShowMore(v => !v)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer">
                  <MoreHorizontal size={16} /> More
                </button>
                {showMore && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl py-2 min-w-[240px]">
                    <button onClick={() => { setShowMore(false); alert('Convert to Job — needs Jobs tab. Coming soon.'); }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                      <FileText size={14} /> Convert to Job
                    </button>
                    <button onClick={async () => {
                      setShowMore(false);
                      const { data, error } = await supabase.from('hub_quotes').insert({
                        org_id: orgId,
                        title: `${draft.title || 'Quote'} (copy)`,
                        status: 'draft',
                        client_id: draft.client_id,
                        salesperson: draft.salesperson,
                        raw_payload: draft.raw_payload,
                      }).select('*').single();
                      if (error) { alert(`Copy failed: ${error.message}`); return; }
                      navigate(`/quotes/${data.quote_number ?? data.id}`);
                    }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                      <Plus size={14} /> Create Similar Quote
                    </button>
                    <div className="px-4 pt-3 pb-1 text-[10px] font-bold text-muted uppercase tracking-wider">Send as…</div>
                    <button onClick={async () => {
                      setShowMore(false);
                      // Ensure quote has a public_token; mint one if missing.
                      let token = quote.public_token;
                      if (!token) {
                        token = crypto.randomUUID().replace(/-/g, '');
                        const { error } = await supabase.from('hub_quotes').update({ public_token: token }).eq('id', quote.id);
                        if (error) { alert(`Couldn't generate link: ${error.message}`); return; }
                      }
                      const url = `${window.location.origin}/q/${token}`;
                      try {
                        await navigator.clipboard.writeText(url);
                        alert(`Share link copied to clipboard:\n${url}`);
                      } catch {
                        prompt('Share this link with the client:', url);
                      }
                    }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                      <ChevronRight size={14} /> Get share link
                    </button>
                    <button onClick={() => { setShowMore(false); alert('Email send coming soon'); }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                      <Mail size={14} /> Email
                    </button>
                    <div className="px-4 pt-3 pb-1 text-[10px] font-bold text-muted uppercase tracking-wider">Mark as…</div>
                    <button onClick={() => updateStatus('awaiting_response')}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                      <Mail size={14} /> Awaiting Response
                    </button>
                    <button onClick={() => updateStatus('approved')}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                      <Check size={14} /> Approved
                    </button>
                    <div className="border-t border-border-subtle my-2" />
                    <button onClick={() => { setShowMore(false); alert('Preview as client — coming soon'); }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                      <Eye size={14} /> Preview as Client
                    </button>
                    <button onClick={() => { setShowMore(false); alert('Signature collection — coming soon'); }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                      <Pencil size={14} /> Collect Signature
                    </button>
                    <button onClick={() => { setShowMore(false); window.print(); }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                      <FileText size={14} /> Print or Save PDF
                    </button>
                    <div className="border-t border-border-subtle my-2" />
                    <button onClick={() => { setShowMore(false); deleteQuote(); }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-red-400">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => alert('Text send — wait on 10DLC approval')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer">
                <MessageSquare size={16} /> Send Text
              </button>
            </>
          )}
        </div>
      </div>

      {/* ═══ Quote document — full panel, no outer card wrapper. Sections separated by dividers. ═══ */}
      <div className="bg-card">
        <div className="h-1 bg-brand" />

        {/* Header — title, client, quote#, salesperson */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText size={20} className="text-brand-text" />
              <h2 className="text-2xl font-black text-primary">
                {draft.title || (draft.raw_payload?.client_name ? `Quote for ${draft.raw_payload.client_name}` : 'New Quote')}
              </h2>
            </div>
            {mode === 'view' && (
              <button onClick={() => setMode('edit')}
                className="p-2 rounded-lg border border-border-subtle text-muted hover:text-primary cursor-pointer" title="Edit quote">
                <Pencil size={14} />
              </button>
            )}
          </div>

          {mode === 'edit' && (
            <FloatInput label="Title"
              value={draft.title || ''}
              onChange={e => set({ title: e.target.value })} />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:items-start">
            <ClientPicker
              orgId={orgId}
              clientId={draft.client_id}
              onChange={setClient} />
            <div className="space-y-3">
              <Field label="Quote #">
                <input value={`#${quote.quote_number ?? ''}`} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
              </Field>
              <SalespersonPicker
                value={draft.salesperson || ''}
                onChange={(v) => set({ salesperson: v })} />
            </div>
          </div>
        </div>

        {/* Pill row (above): Introduction */}
        {aboveSlot.length > 0 && (
          <SectionBand>
            <SectionPills addLabel="Add section" pills={aboveSlot.map(([k, v]) => ({ key: k, label: v.label }))} onAdd={addSection} />
          </SectionBand>
        )}

        {/* Introduction (optional) */}
        {isEnabled('introduction') && (
          <Section title="Introduction"
            onDelete={() => removeSection('introduction')}
            editing={isEditing('introduction')}
            onEdit={() => startEdit('introduction')}
            onSave={() => saveEdit('introduction')}
            onCancel={() => cancelEdit('introduction')}>
            <ImageSlot
              url={draft.raw_payload?.intro?.image_url}
              onUpload={(image_url) => setPayload({ intro: { ...(draft.raw_payload?.intro || {}), image_url } })}
              onRemove={() => setPayload({ intro: { ...(draft.raw_payload?.intro || {}), image_url: null } })} />
            <FloatInput label="Title"
              value={draft.raw_payload?.intro?.title || ''}
              onChange={e => setPayload({ intro: { ...(draft.raw_payload?.intro || {}), title: e.target.value } })} />
            <FloatTextarea label="Description" rows={5}
              value={draft.raw_payload?.intro?.description || ''}
              onChange={e => setPayload({ intro: { ...(draft.raw_payload?.intro || {}), description: e.target.value } })} />
          </Section>
        )}

        {/* Product / Service line items */}
        <Section title="Product / Service"
          editing={isEditing('product_service')}
          onEdit={() => startEdit('product_service')}
          onSave={() => saveEdit('product_service')}
          onCancel={() => cancelEdit('product_service')}>
          <div className="space-y-3">
            {(draft.line_items || []).map((li, idx) => (
              <LineItemEditor
                key={idx}
                item={li}
                onChange={item => set({ line_items: draft.line_items.map((x, i) => i === idx ? item : x) })}
                onRemove={() => set({ line_items: draft.line_items.filter((_, i) => i !== idx) })} />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => set({ line_items: [...(draft.line_items || []), { name: '', description: '', qty: 1, unit_price: null }] })}
              className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer">+ Add Line Item</button>
            <button onClick={() => {
              const opt1 = crypto.randomUUID();
              const opt2 = crypto.randomUUID();
              set({ line_items: [...(draft.line_items || []), {
                kind: 'option_set',
                name: '',
                description: '',
                options: [
                  { id: opt1, label: 'Option A', price: 0, price_unit: '' },
                  { id: opt2, label: 'Option B', price: 0, price_unit: '' },
                ],
                selected_option_id: opt1,
                modifiers: [],
              }] });
            }}
              className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer">Build Option Set</button>
          </div>
        </Section>

        {/* Totals */}
        <div className="px-6 py-5 border-t border-border-subtle">
          <Totals
            subtotal={draft.subtotal}
            discount={draft.discount}
            tax={draft.tax}
            total={draft.total}
            onDiscount={v => set({ discount: v })}
            onTax={v => set({ tax: v })} />
          <button onClick={() => alert('Deposit / payment schedule coming soon')}
            className="mt-4 text-sm font-bold text-brand-text hover:underline cursor-pointer">+ Add Deposit or Payment Schedule</button>
        </div>

        {/* Pill row (below): Attachments / Images / Reviews / Client message */}
        {belowSlot.length > 0 && (
          <SectionBand>
            <SectionPills addLabel="Add section" pills={belowSlot.map(([k, v]) => ({ key: k, label: v.label }))} onAdd={addSection} />
          </SectionBand>
        )}

        {/* Attachments (optional, stub) */}
        {isEnabled('attachments') && (
          <Section title="Attachments" subtitle="Attach files for the client (coming soon)" onDelete={() => removeSection('attachments')}>
            <p className="text-sm text-muted">File attachment uploads aren't wired yet.</p>
          </Section>
        )}

        {/* Images (optional) */}
        {isEnabled('images') && (
          <Section title="Images" subtitle="Add images to showcase your past work" onDelete={() => removeSection('images')}>
            <ImageGrid
              quoteId={quote.id}
              urls={draft.raw_payload?.images || []}
              onChange={images => setPayload({ images })} />
          </Section>
        )}

        {/* Reviews (optional, stub) */}
        {isEnabled('reviews') && (
          <Section title="Reviews" subtitle="Pull in customer reviews (coming soon)" onDelete={() => removeSection('reviews')}>
            <p className="text-sm text-muted">Reviews integration isn't wired yet.</p>
          </Section>
        )}

        {/* Client message (optional) */}
        {isEnabled('client_message') && (
          <Section title="Client message" onDelete={() => removeSection('client_message')}>
            <textarea rows={6} value={draft.raw_payload?.client_message || ''}
              onChange={e => setPayload({ client_message: e.target.value })}
              placeholder={DEFAULT_CLIENT_MESSAGE}
              className={`${inputCls} resize-y`} />
          </Section>
        )}

        {/* Contract / Disclaimer — auto-expands so the full disclaimer is readable. */}
        <Section title="Contract / Disclaimer"
          editing={isEditing('contract')}
          onEdit={() => startEdit('contract')}
          onSave={() => saveEdit('contract')}
          onCancel={() => cancelEdit('contract')}>
          <AutoGrowTextarea
            value={draft.raw_payload?.contract ?? DEFAULT_CONTRACT}
            onChange={e => setPayload({ contract: e.target.value })}
            className={inputCls} />
        </Section>

      </div>

      {/* Universal save bar removed — every section has its own Save/Cancel now. */}
    </div>
  );
}

const inputCls = "w-full px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50";

function normalizeDraft(quote) {
  return {
    id: quote.id,
    title: quote.title || '',
    client_id: quote.client_id || null,
    salesperson: quote.salesperson || '',
    status: quote.status || 'draft',
    subtotal: Number(quote.subtotal || 0),
    discount: Number(quote.discount || 0),
    tax: Number(quote.tax || 0),
    total: Number(quote.total || 0),
    line_items: (quote.raw_payload?.line_items?.length ? quote.raw_payload.line_items : [{ name: '', description: '', qty: 1, unit_price: null }]),
    raw_payload: quote.raw_payload || {},
  };
}

// Salesperson dropdown — sourced from the org's team members (Settings).
// Stores a plain name string on the quote row so downstream code doesn't need
// to resolve a user_id at render time.
function SalespersonPicker({ value, onChange }) {
  const team = useTeamMembers();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <Field label="Salesperson">
      <div className="relative" ref={wrapRef}>
        <button type="button" onClick={() => setOpen(v => !v)}
          className={`${inputCls} text-left flex items-center justify-between cursor-pointer`}>
          <span className={value ? 'text-primary' : 'text-muted'}>{value || 'Select salesperson'}</span>
          <ChevronRight size={14} className={`text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl max-h-72 overflow-y-auto py-1">
            {team.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">No team members. Add them in Settings → Team.</p>
            ) : team.map(m => {
              const selected = m.name === value;
              return (
                <button key={m.email} type="button"
                  onClick={() => { onChange(m.name); setOpen(false); }}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-surface-alt cursor-pointer ${selected ? 'text-primary font-semibold' : 'text-secondary'}`}>
                  <span>{m.name}</span>
                  {selected && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Field>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-muted uppercase tracking-wider mb-1">{label}</span>
      {children}
    </label>
  );
}

function SectionPills({ addLabel, pills, onAdd }) {
  // "+ Add section" is just the row label — not interactive. Pills next to it
  // are the actual sections you can add.
  if (!pills.length) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
        <Plus size={14} /> {addLabel}
      </span>
      {pills.map(p => (
        <button key={p.key} onClick={() => onAdd(p.key)}
          className="px-4 py-2 rounded-full bg-surface-alt border border-border-subtle text-sm font-medium text-primary hover:bg-card cursor-pointer">
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, subtitle, onDelete, children, editing, onEdit, onSave, onCancel }) {
  // Rendered as a flat row inside the parent document card. Top border separates
  // it from the previous section — no rounded edges, no nested card.
  // When `editing` is false AND `onEdit` is provided, a pencil icon appears in the
  // header and the section's inputs are disabled (locked). Save/Cancel appear at
  // the bottom while editing.
  const lockable = onEdit != null;
  return (
    <div className="px-6 py-5 border-t border-border-subtle">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-black text-primary">{title}</h3>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (editing || !lockable) && (
            <button onClick={() => { if (confirm('Remove section?')) onDelete(); }}
              className="p-1.5 text-muted hover:text-red-400 cursor-pointer"><Trash2 size={16} /></button>
          )}
          {lockable && !editing && (
            <button onClick={onEdit}
              className="p-1.5 rounded-md border border-border-subtle text-muted hover:text-primary cursor-pointer" title="Edit section">
              <Pencil size={14} />
            </button>
          )}
        </div>
      </div>
      <fieldset disabled={lockable && !editing} className="space-y-3 disabled:pointer-events-none disabled:[&_input]:cursor-default disabled:[&_button]:cursor-default border-0 p-0 m-0">
        {children}
      </fieldset>
      {lockable && editing && (
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-border-subtle/60">
          <button onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-bold text-primary hover:bg-surface-alt cursor-pointer">Cancel</button>
          <button onClick={onSave}
            className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer">Save</button>
        </div>
      )}
    </div>
  );
}

// Pill row rendered as a band inside the document card.
function SectionBand({ children }) {
  return (
    <div className="px-6 py-3 border-t border-border-subtle bg-surface-alt/30">
      {children}
    </div>
  );
}

function ClientPicker({ orgId, clientId, onChange }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [current, setCurrent] = useState(null);
  const [property, setProperty] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  // Load full client + primary property when a client is selected.
  useEffect(() => {
    if (!clientId) { setCurrent(null); setProperty(null); return; }
    (async () => {
      const { data: c } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle();
      setCurrent(c || null);
      if (c) {
        const { data: props } = await supabase.from('properties').select('*').eq('client_id', clientId).order('created_at', { ascending: true }).limit(1);
        setProperty(props?.[0] || null);
      }
    })();
  }, [clientId]);

  // Search clients while dropdown is open. Fetch enough to render rich rows
  // (name, properties, email/phone, active badge) + counts.
  useEffect(() => {
    if (!open || !orgId) return;
    const term = q.trim();
    const t = setTimeout(async () => {
      let qb = supabase.from('clients').select('id, first_name, last_name, company_name, emails, phones, tags').eq('org_id', orgId).limit(8);
      if (term) qb = qb.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,company_name.ilike.%${term}%`);
      const { data } = await qb;
      const rows = data || [];
      // Pull every client's first property + total property count in one query.
      const ids = rows.map(r => r.id);
      if (ids.length) {
        const { data: props } = await supabase.from('properties').select('client_id, street, city, state, zip').in('client_id', ids);
        const byClient = {};
        for (const p of props || []) {
          (byClient[p.client_id] ||= []).push(p);
        }
        for (const r of rows) {
          r._properties = byClient[r.id] || [];
        }
      }
      setResults(rows);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, orgId]);

  // Close picker dropdown on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Close 3-dot menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  // ── Selected-client card view ──
  if (current) {
    const name = [current.first_name, current.last_name].filter(Boolean).join(' ') || current.company_name || 'Unknown';
    const phone = (current.phones || []).find(p => p?.primary)?.number || current.phones?.[0]?.number || '';
    const email = (current.emails || []).find(e => e?.primary)?.address || current.emails?.[0]?.address || '';
    const addressLines = property
      ? [property.street, [property.city, property.state, property.zip].filter(Boolean).join(', ')].filter(Boolean)
      : [];
    return (
      <Field label="Client">
        <div className="relative rounded-xl border border-border-subtle bg-card/60 p-4">
          <div className="flex items-start justify-between gap-2">
            <button onClick={() => navigate(`/clients/${current.client_number ?? current.id}`)}
              className="text-sm font-bold text-primary cursor-pointer flex items-center gap-1.5 text-left">
              <span className="hover:underline">{name}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-brand inline-block" />
            </button>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen(v => !v)}
                className="p-1.5 rounded-md hover:bg-surface-alt text-muted hover:text-primary cursor-pointer">
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl py-1 min-w-[200px]">
                  <button onClick={() => { setMenuOpen(false); window.open(`/clients/${current.client_number ?? current.id}`, '_blank', 'noopener'); }}
                    className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                    <Eye size={14} /> View client profile
                  </button>
                  <button onClick={() => { setMenuOpen(false); window.open(`/clients/${current.client_number ?? current.id}/edit`, '_blank', 'noopener'); }}
                    className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                    <Pencil size={14} /> Edit client details
                  </button>
                  <button onClick={() => { setMenuOpen(false); alert('Property switcher coming soon'); }}
                    className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                    <HomeIcon size={14} /> Change property
                  </button>
                  <div className="border-t border-border-subtle my-1" />
                  <button onClick={() => { setMenuOpen(false); onChange(null, null); setQ(''); setOpen(true); }}
                    className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-red-400">
                    <X size={14} /> Change client
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 space-y-1.5 text-sm">
            {addressLines.length > 0 && (
              <div className="flex items-start gap-2 text-secondary">
                <MapPin size={14} className="shrink-0 mt-0.5 text-muted" />
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLines.join(', '))}`}
                  target="_blank" rel="noreferrer"
                  className="inline text-brand-text no-underline hover:underline">
                  {addressLines.map((line, i) => (
                    <span key={i} className="block">{line}</span>
                  ))}
                </a>
              </div>
            )}
            {phone && (
              <div className="flex items-center gap-2 text-secondary">
                <Phone size={14} className="text-muted" />
                <a href={`tel:${String(phone).replace(/\D/g,'')}`}
                  className="inline text-brand-text no-underline hover:underline">
                  {fmtPhone(phone)}
                </a>
              </div>
            )}
            {email && (
              <div className="flex items-center gap-2 text-secondary">
                <Mail size={14} className="text-muted" />
                <a href={`mailto:${email}`}
                  className="inline text-brand-text no-underline hover:underline">
                  {email}
                </a>
              </div>
            )}
          </div>
        </div>
      </Field>
    );
  }

  // ── Search/picker view ──
  return (
    <Field label="Client">
      <div className="relative" ref={wrapRef}>
        <input value={q} onFocus={() => setOpen(true)}
          onChange={e => setQ(e.target.value)}
          placeholder="Select a client"
          className={inputCls} />
        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl max-h-[440px] overflow-y-auto py-1">
            {results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">No clients found</p>
            ) : results.map(c => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || 'Unknown';
              const phone = (c.phones || []).find(p => p?.primary)?.number || c.phones?.[0]?.number || '';
              const email = (c.emails || []).find(e => e?.primary)?.address || c.emails?.[0]?.address || '';
              const archived = Array.isArray(c.tags) && c.tags.includes('archived');
              const props = c._properties || [];
              const propLine = props.length > 1
                ? `${props.length} Properties`
                : props[0]
                  ? [props[0].street, [props[0].city, props[0].state, props[0].zip].filter(Boolean).join(', ')].filter(Boolean).join(', ')
                  : '';
              const contactLine = [email, fmtPhone(phone)].filter(Boolean).join(' · ');
              return (
                <button key={c.id}
                  onClick={() => { onChange(c.id, name); setOpen(false); setQ(''); }}
                  className="w-full px-4 py-3 text-left hover:bg-surface-alt cursor-pointer flex items-start justify-between gap-3 border-b border-border-subtle/40 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-primary text-sm">{name}</p>
                    {propLine && <p className="text-sm text-secondary mt-0.5 truncate">{propLine}</p>}
                    {contactLine && <p className="text-sm text-secondary mt-0.5 truncate">{contactLine}</p>}
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0
                    ${archived ? 'bg-zinc-500/15 text-zinc-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${archived ? 'bg-zinc-400' : 'bg-emerald-500'}`} />
                    {archived ? 'Archived' : 'Active'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Field>
  );
}

function LineItemEditor({ item, onChange, onRemove }) {
  if (item.kind === 'text') {
    return (
      <div className="rounded-xl border border-border-subtle p-3 flex items-start gap-2 bg-surface-alt/40">
        <GripVertical size={14} className="text-muted mt-2 shrink-0" />
        <textarea rows={2} value={item.text || ''} onChange={e => onChange({ ...item, text: e.target.value })}
          placeholder="Add a text block (no charge)…"
          className={`${inputCls} resize-y`} />
        <button onClick={onRemove} className="p-1.5 text-muted hover:text-red-400 cursor-pointer mt-1"><Trash2 size={14} /></button>
      </div>
    );
  }
  if (item.kind === 'option_set') {
    return <OptionSetEditor item={item} onChange={onChange} onRemove={onRemove} />;
  }
  // Derived total = qty × unit_price unless the user has typed a manual override.
  // manual_total wins when set so contractors can hand-tune the line value.
  const derivedTotal = Number(item.qty || 1) * Number(item.unit_price || 0);
  const lineTotal = item.manual_total != null ? Number(item.manual_total) : derivedTotal;
  const dimmed = !!item.optional;
  const showQty   = !!item.show_qty;
  const showUnit  = !!item.show_price_unit;
  // Unit price is OFF by default — add it via the "+ Unit price" chip. Most
  // contractors think in line totals or option sets, not unit pricing, so keeping
  // it opt-in trims a column most quotes don't need.
  const showPrice = item.show_unit_price === true;
  // Grid columns adapt to which optional fields are visible.
  // Order: Name + (Quantity?) + (Unit price?) + Total. "Per" is baked into Total.
  // Total always renders.
  const cols = ['minmax(0,1fr)'];
  if (showQty)   cols.push('100px');
  if (showPrice) cols.push('130px'); // unit price
  cols.push('150px'); // total — always
  return (
    <div className={`rounded-xl border border-border-subtle p-4 bg-surface-alt/40 ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <GripVertical size={14} className="text-muted mt-3 shrink-0" />
        <div className="flex-1 space-y-3">
          {/* Row 1: Name + (Quantity?) + Unit price + (Per?) + Total */}
          <div className="grid gap-2" style={{ gridTemplateColumns: cols.join(' ') }}>
            <FloatInput label="Name"
              value={item.name || ''}
              onChange={e => onChange({ ...item, name: e.target.value })} />
            {showQty && (
              <FieldWithRemove onRemove={() => onChange({ ...item, qty: 1, show_qty: false })}>
                <FloatInput label="Quantity" type="number" inputMode="decimal"
                  value={item.qty ?? ''}
                  onChange={e => onChange({ ...item, qty: e.target.value === '' ? null : Number(e.target.value) })} />
              </FieldWithRemove>
            )}
            {showPrice && (
              <FieldWithRemove onRemove={() => onChange({ ...item, unit_price: null, show_unit_price: false })}>
                <FloatInput label="Unit price" type="number" inputMode="decimal" prefix="$"
                  value={item.unit_price ?? ''}
                  onChange={e => onChange({ ...item, unit_price: e.target.value === '' ? null : Number(e.target.value) })} />
              </FieldWithRemove>
            )}
            <div className="relative">
              {/* Show empty until something's actually been entered — either a manual
                  override OR a real unit price. Avoids the "0 you can't delete" trap. */}
              <FloatInput label="Total" type="number" inputMode="decimal" prefix="$"
                value={item.manual_total ?? (showPrice && item.unit_price != null ? derivedTotal : '')}
                onChange={e => onChange({ ...item, manual_total: e.target.value === '' ? null : Number(e.target.value) })} />
              {item.price_unit && (
                <span className="pointer-events-none absolute right-2 bottom-1.5 text-xs text-muted">{item.price_unit}</span>
              )}
            </div>
          </div>

          {/* Row 2: Description (wide) + Image slot (square, doesn't stretch) */}
          <div className="grid grid-cols-[1fr_140px] gap-3 items-start">
            <FloatTextarea label="Description" rows={4}
              value={item.description || ''}
              onChange={e => onChange({ ...item, description: e.target.value })} />
            <div className="w-[140px]">
              <LineItemImageSlot
                url={item.image_url}
                onUpload={(url) => onChange({ ...item, image_url: url })}
                onRemove={() => onChange({ ...item, image_url: null })} />
            </div>
          </div>

          {/* Row 3: Optional toggle + opt-in field chips */}
          <div className="flex items-center gap-4 flex-wrap">
            <label className="inline-flex items-center gap-2 text-sm text-secondary cursor-pointer select-none">
              <input type="checkbox" checked={!!item.optional}
                onChange={e => onChange({ ...item, optional: e.target.checked })} />
              Optional
            </label>
            {!showPrice && (
              <button
                onClick={() => onChange({ ...item, show_unit_price: true })}
                className="text-sm font-bold text-brand-text hover:underline cursor-pointer">+ Unit price</button>
            )}
            {!showQty && (
              <button
                onClick={() => onChange({ ...item, show_qty: true, qty: item.qty ?? 1 })}
                className="text-sm font-bold text-brand-text hover:underline cursor-pointer">+ Quantity</button>
            )}
            {showUnit ? (
              <div className="w-44">
                <FieldWithRemove onRemove={() => onChange({ ...item, price_unit: '', show_price_unit: false })}>
                  <PriceUnitInput
                    value={item.price_unit || ''}
                    onChange={(v) => onChange({ ...item, price_unit: v })} />
                </FieldWithRemove>
              </div>
            ) : (
              <button
                onClick={() => onChange({ ...item, show_price_unit: true })}
                className="text-sm font-bold text-brand-text hover:underline cursor-pointer">+ Per (visit / month / etc.)</button>
            )}
          </div>
        </div>
        <button onClick={onRemove} className="p-1.5 text-muted hover:text-red-400 cursor-pointer"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

// Inline "field box" — label sits above content inside a single bordered box,
// matching the Jobber line-item style. Used for read-only displays (e.g. Total)
// where the value isn't an input element. Mirrors FloatInput's 52px geometry so
// rows of mixed inputs + readouts line up cleanly.
function BoxField({ label, children }) {
  return (
    <div className="relative rounded-lg border border-border-subtle bg-card h-[52px] overflow-hidden">
      <p className="absolute left-3 top-1.5 text-[11px] font-medium text-muted">{label}</p>
      <div className="absolute left-3 right-3 bottom-1.5">{children}</div>
    </div>
  );
}
const boxInputCls = "w-full px-3 py-2 bg-transparent text-sm text-primary placeholder:text-muted focus:outline-none";

// ── Floating-label inputs (Material-style) ──
// Empty + unfocused: label sits centered like a placeholder.
// Filled or focused: label floats up to a small caption inside the top-left.
// Trick: input uses placeholder=" " so :placeholder-shown is true iff value is "".
function FloatInput({ label, value, onChange, prefix, type = 'text', inputMode, className = '' }) {
  // Default state = label floated up (top-2, small). When input is empty AND not
  // focused, label drops back to placeholder position. Refocusing or typing returns
  // it to the floated state.
  // Prefix (e.g. "$") sits in the value zone below the floated label — it's hidden
  // when the field is showing the placeholder so it doesn't crowd the centered label.
  return (
    <div className={`relative rounded-lg border border-border-subtle bg-card h-[52px] ${className}`}>
      <input
        type={type}
        inputMode={inputMode}
        value={value ?? ''}
        onChange={onChange}
        placeholder=" "
        className={`peer block w-full h-full px-3 pt-5 pb-1.5 bg-transparent text-sm text-primary placeholder-transparent focus:outline-none ${prefix ? 'pl-6' : ''}`}
      />
      {prefix && (
        <span className="pointer-events-none absolute left-3 bottom-1.5 text-sm text-muted opacity-100 peer-placeholder-shown:opacity-0 peer-focus:opacity-100 transition-opacity">
          {prefix}
        </span>
      )}
      <label className="pointer-events-none absolute left-3 text-muted transition-all duration-150
        top-1.5 text-[11px] font-medium
        peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-normal
        peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:font-medium">
        {label}
      </label>
    </div>
  );
}

function FloatTextarea({ label, value, onChange, rows = 5 }) {
  return (
    <div className="relative rounded-lg border border-border-subtle bg-card">
      <textarea
        rows={rows}
        value={value ?? ''}
        onChange={onChange}
        placeholder=" "
        className="peer block w-full px-3 pt-6 pb-2 bg-transparent text-sm text-primary placeholder-transparent focus:outline-none resize-y"
      />
      <label className="pointer-events-none absolute left-3 text-muted transition-all duration-150
        top-2 text-[11px] font-medium
        peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-placeholder-shown:font-normal
        peer-focus:top-2 peer-focus:text-[11px] peer-focus:font-medium">
        {label}
      </label>
    </div>
  );
}

// Price-unit field: free-form text input with a datalist of common cadences.
// Click into the field and a list of "per visit", "per yard", etc. appears.
// Renders any field with a tiny X overlayed top-right for "remove this column"
// behavior on opt-in fields (Quantity, Per).
// Textarea that grows to fit its content so long blocks (Contract/Disclaimer)
// don't need scrolling inside a small fixed box.
function AutoGrowTextarea({ value, onChange, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={onChange}
      className={`${className} resize-none overflow-hidden`}
      style={{ minHeight: '200px' }} />
  );
}

function FieldWithRemove({ children, onRemove }) {
  return (
    <div className="relative">
      {children}
      <button onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-card border border-border-subtle text-muted hover:text-red-400 cursor-pointer"
        title="Remove">
        <X size={11} />
      </button>
    </div>
  );
}

function PriceUnitInput({ value, onChange }) {
  const listId = useMemo(() => `price-unit-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <div className="relative rounded-lg border border-border-subtle bg-card h-[52px]">
      <input
        list={listId}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder=" "
        className="peer block w-full h-full px-3 pt-5 pb-1.5 bg-transparent text-sm text-primary placeholder-transparent focus:outline-none"
      />
      <datalist id={listId}>
        {PRICE_UNIT_SUGGESTIONS.map(s => <option key={s} value={s} />)}
      </datalist>
      <label className="pointer-events-none absolute left-3 text-muted transition-all duration-150
        top-1.5 text-[11px] font-medium
        peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-normal
        peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:font-medium">
        Per
      </label>
    </div>
  );
}

/* ─── Option Set editor ───
   Renders a service with multiple mutually-exclusive options (client picks one)
   plus optional add-on modifiers (client can stack). Used for "Weekly vs Biweekly
   lawn maintenance" with "+ Edging" type situations.
*/
function OptionSetEditor({ item, onChange, onRemove }) {
  const opts = item.options || [];
  const mods = item.modifiers || [];
  const selectedOption = opts.find(o => o.id === item.selected_option_id) || opts[0];

  const updateOpt = (id, patch) => onChange({ ...item, options: opts.map(o => o.id === id ? { ...o, ...patch } : o) });
  const removeOpt = (id) => onChange({
    ...item,
    options: opts.filter(o => o.id !== id),
    selected_option_id: item.selected_option_id === id ? (opts.find(o => o.id !== id)?.id ?? null) : item.selected_option_id,
  });
  const addOpt = () => {
    const newId = crypto.randomUUID();
    onChange({
      ...item,
      options: [...opts, { id: newId, label: '', price: 0, price_unit: '', description: '' }],
      selected_option_id: item.selected_option_id || newId,
    });
  };

  const updateMod = (id, patch) => onChange({ ...item, modifiers: mods.map(m => m.id === id ? { ...m, ...patch } : m) });
  const removeMod = (id) => onChange({ ...item, modifiers: mods.filter(m => m.id !== id) });
  const addMod = () => onChange({ ...item, modifiers: [...mods, { id: crypto.randomUUID(), label: '', price: 0, selected: false }] });

  const total = lineItemContribution(item);

  return (
    <div className="rounded-xl border-2 border-brand/40 p-4 bg-surface-alt/40 space-y-4">
      <div className="flex items-start gap-2">
        <GripVertical size={14} className="text-muted mt-3 shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand/15 text-brand-text">
              Option Set
            </span>
            <p className="text-sm font-bold text-primary">{money(total)} <span className="text-xs font-medium text-muted">currently selected</span></p>
          </div>
          <FloatInput label="Name"
            value={item.name || ''}
            onChange={e => onChange({ ...item, name: e.target.value })} />
          <FloatTextarea label="Description (shown above options)" rows={2}
            value={item.description || ''}
            onChange={e => onChange({ ...item, description: e.target.value })} />

          {/* Options (radio) */}
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Options — client picks one</p>
            <div className="space-y-2">
              {opts.map(o => {
                const isSel = selectedOption?.id === o.id;
                return (
                  <div key={o.id} className={`rounded-lg border p-3 flex items-start gap-3 ${isSel ? 'border-brand bg-brand/5' : 'border-border-subtle bg-card'}`}>
                    <input type="radio" name={`opt-${item.id || 'set'}`} checked={isSel}
                      onChange={() => onChange({ ...item, selected_option_id: o.id })}
                      className="mt-1.5 cursor-pointer" />
                    <div className="flex-1 grid grid-cols-[1fr_110px_110px] gap-2">
                      <FloatInput label="Label"
                        value={o.label || ''}
                        onChange={e => updateOpt(o.id, { label: e.target.value })} />
                      <FloatInput label="Price" type="number" inputMode="decimal" prefix="$"
                        value={o.price ?? ''}
                        onChange={e => updateOpt(o.id, { price: e.target.value === '' ? null : Number(e.target.value) })} />
                      <PriceUnitInput
                        value={o.price_unit || ''}
                        onChange={(v) => updateOpt(o.id, { price_unit: v })} />
                    </div>
                    <button onClick={() => removeOpt(o.id)} className="p-1.5 text-muted hover:text-red-400 cursor-pointer mt-1"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
            <button onClick={addOpt}
              className="mt-2 text-sm font-bold text-brand-text hover:underline cursor-pointer">+ Add option</button>
          </div>

        </div>
        <button onClick={onRemove} className="p-1.5 text-muted hover:text-red-400 cursor-pointer"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function LineItemImageSlot({ url, onUpload, onRemove }) {
  const [uploading, setUploading] = useState(false);
  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const path = `quote-line/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from('quote-images').upload(path, compressed, { upsert: false, contentType: 'image/jpeg' });
      if (error) throw error;
      const { data } = supabase.storage.from('quote-images').getPublicUrl(path);
      onUpload(data.publicUrl);
    } catch (e) { alert(`Upload failed: ${e.message}`); }
    setUploading(false);
  };
  if (url) {
    return (
      <div className="relative">
        <img src={url} alt="" className="w-full aspect-square object-cover rounded-lg border border-border-subtle" />
        <button onClick={onRemove}
          className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-card/90 border border-border-subtle text-muted hover:text-red-400 cursor-pointer">
          <Trash2 size={12} />
        </button>
      </div>
    );
  }
  return (
    <label className="flex items-center justify-center w-full aspect-square rounded-lg border-2 border-dashed border-border-subtle text-muted hover:bg-surface-alt cursor-pointer">
      {uploading ? <Loader2 size={20} className="animate-spin" /> : <ImageIcon size={20} />}
      <input type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files?.[0])} />
    </label>
  );
}

function NumField({ label, value, onChange, prefix }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-muted uppercase tracking-wider mb-1">{label}</span>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{prefix}</span>}
        <input type="number" inputMode="decimal" value={value} onChange={e => onChange(Number(e.target.value) || 0)}
          className={`${inputCls} ${prefix ? 'pl-6' : ''}`} />
      </div>
    </label>
  );
}

function Totals({ subtotal, discount, tax, total, onDiscount, onTax }) {
  // Discount + tax are opt-in. Until the user clicks the "+ Add" link, the field
  // doesn't show — keeps simple quotes clean.
  const [discountOn, setDiscountOn] = useState(Number(discount) > 0);
  const [taxOn,      setTaxOn]      = useState(Number(tax) > 0);
  const removeDiscount = () => { setDiscountOn(false); onDiscount(0); };
  const removeTax      = () => { setTaxOn(false); onTax(0); };
  return (
    <div className="space-y-2 max-w-sm ml-auto text-sm">
      <Row label="Subtotal" value={money(subtotal)} />
      {discountOn ? (
        <RowInput label="Discount" value={discount} onChange={onDiscount} onRemove={removeDiscount} />
      ) : (
        <button onClick={() => setDiscountOn(true)}
          className="block ml-auto text-sm font-bold text-brand-text hover:underline cursor-pointer">+ Add Discount</button>
      )}
      {taxOn ? (
        <RowInput label="Tax" value={tax} onChange={onTax} onRemove={removeTax} />
      ) : (
        <button onClick={() => setTaxOn(true)}
          className="block ml-auto text-sm font-bold text-brand-text hover:underline cursor-pointer">+ Add Tax</button>
      )}
      <div className="border-t border-border-subtle pt-2">
        <Row label="Total" value={money(total)} big />
      </div>
    </div>
  );
}
function Row({ label, value, big }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-secondary ${big ? 'text-lg font-black text-primary' : ''}`}>{label}</span>
      <span className={`text-primary ${big ? 'text-lg font-black' : 'font-semibold'}`}>{value}</span>
    </div>
  );
}
function RowInput({ label, value, onChange, onRemove }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-secondary">{label}</span>
      <div className="flex items-center gap-1">
        <div className="relative w-32">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
          <input type="number" inputMode="decimal"
            value={value ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
            className={`${inputCls} pl-6 text-right`} />
        </div>
        {onRemove && (
          <button onClick={onRemove}
            className="p-1.5 text-muted hover:text-red-400 cursor-pointer" title={`Remove ${label}`}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function ImageSlot({ url, onUpload, onRemove }) {
  const [uploading, setUploading] = useState(false);
  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const ext = compressed.type === 'image/png' ? 'png' : 'jpg';
      const path = `quote-intro/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('quote-images').upload(path, compressed, { upsert: false, contentType: compressed.type });
      if (error) throw error;
      const { data } = supabase.storage.from('quote-images').getPublicUrl(path);
      onUpload(data.publicUrl);
    } catch (e) { alert(`Upload failed: ${e.message}`); }
    setUploading(false);
  };
  if (url) {
    // Centered. Container is transparent so PNG cutouts keep their alpha.
    return (
      <div className="relative w-full rounded-xl border border-border-subtle p-4 flex justify-center">
        <img src={url} alt="" className="max-h-80 object-contain" />
        <button onClick={onRemove}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-card/90 border border-border-subtle text-muted hover:text-red-400 cursor-pointer">
          <Trash2 size={14} />
        </button>
      </div>
    );
  }
  return (
    <label className="flex items-center justify-center gap-4 w-full py-8 rounded-xl border-2 border-dashed border-border-subtle text-muted hover:bg-surface-alt cursor-pointer">
      {uploading ? <Loader2 size={20} className="animate-spin" /> : (
        <>
          <span className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold">Add Image</span>
          <span className="text-sm text-muted">AVIF, GIF, JPEG, PNG, WEBP up to 25MB each</span>
        </>
      )}
      <input type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files?.[0])} />
    </label>
  );
}

function ImageGrid({ quoteId, urls, onChange }) {
  const [uploading, setUploading] = useState(false);
  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    const added = [];
    for (const f of files) {
      try {
        const compressed = await compressImage(f);
        const path = `quote-${quoteId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from('quote-images').upload(path, compressed, { upsert: false, contentType: 'image/jpeg' });
        if (error) throw error;
        const { data } = supabase.storage.from('quote-images').getPublicUrl(path);
        added.push(data.publicUrl);
      } catch (e) { console.error('[Quotes ImageGrid] upload error:', e.message); }
    }
    setUploading(false);
    if (added.length) onChange([...(urls || []), ...added]);
  };
  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {(urls || []).map((u, i) => (
          <div key={i} className="relative group">
            <img src={u} alt="" className="aspect-square w-full object-cover rounded-xl border border-border-subtle" />
            <button onClick={() => onChange(urls.filter((_, j) => j !== i))}
              className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-card/90 border border-border-subtle text-muted hover:text-red-400 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <label className="aspect-square flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-subtle text-muted hover:bg-surface-alt cursor-pointer text-xs gap-1">
          {uploading ? <Loader2 size={20} className="animate-spin" /> : (<><Plus size={16} /><span>Add Images</span></>)}
          <input type="file" accept="image/*" multiple hidden onChange={e => handleFiles(Array.from(e.target.files || []))} />
        </label>
      </div>
      <p className="text-[11px] text-muted mt-2">AVIF, GIF, JPEG, PNG, WEBP up to 25MB each</p>
    </div>
  );
}
