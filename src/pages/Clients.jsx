import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { Search, ArrowLeft, ChevronRight, MapPin, Phone, Mail, FileText, User, List, Map as MapIcon, Plus, DollarSign, Send, X } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import { genId } from '../data';
import { generateAgreementHTML } from '../utils/generateAgreement';

const ServiceAgreement = lazy(() => import('./ServiceAgreement'));
const Dominate = lazy(() => import('./Dominate'));
import { RecurringView } from './LaborEfficiency';

/* ─── Helpers ─── */

function fmtTime(hours) {
  if (!hours || hours <= 0) return '--';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

function fmt(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function getContractType(client) {
  // If has Jobber recurring jobs, it's recurring
  if (client.jobberJobs?.length > 0) {
    if (client.hasContract) return 'Full Service';
    return 'Recurring';
  }
  const services = client.services;
  if (!services || services.length === 0) return 'None';
  const ids = new Set(services.map((s) => s.id));
  const hasLawn = ids.has('lawn');
  const hasLeaf = ids.has('leaf');
  const hasExtras = ids.has('aeration') || ids.has('hedge') || ids.has('mulch') || ids.has('pine');
  if (hasLawn && hasExtras) return 'Full Service';
  if (hasLawn || hasLeaf) return 'Recurring';
  return 'Project Only';
}

function getContractColor(type) {
  if (type === 'Full Service') return 'bg-emerald-500/10 text-emerald-500';
  if (type === 'Recurring') return 'bg-blue-500/10 text-blue-500';
  if (type === 'Project Only') return 'bg-amber-500/10 text-amber-500';
  return 'bg-surface-alt text-muted';
}

/* ─── Client Map ─── */

function ClientMap({ clients, onSelect }) {
  // Simple map showing all client locations
  const clientsWithCoords = clients.filter((c) => c.mapCenter);

  if (clientsWithCoords.length === 0) {
    return (
      <div className="text-center py-12">
        <MapIcon size={32} className="mx-auto text-muted/30 mb-3" />
        <p className="text-sm text-muted">No mapped clients yet</p>
        <p className="text-xs text-muted mt-1">Create contracts with property measurements to see them here</p>
      </div>
    );
  }

  // Calculate center from all client locations
  const avgLat = clientsWithCoords.reduce((s, c) => s + c.mapCenter.lat, 0) / clientsWithCoords.length;
  const avgLng = clientsWithCoords.reduce((s, c) => s + c.mapCenter.lng, 0) / clientsWithCoords.length;

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-border-subtle" style={{ height: '400px' }}>
        <Suspense fallback={<div className="h-full bg-surface-alt animate-pulse" />}>
          <ClientMapInner center={[avgLat, avgLng]} clients={clientsWithCoords} onSelect={onSelect} />
        </Suspense>
      </div>
      <p className="text-xs text-muted text-center">{clientsWithCoords.length} client{clientsWithCoords.length !== 1 ? 's' : ''} mapped</p>
    </div>
  );
}

// Lazy inner component to avoid loading leaflet until needed
const ClientMapInner = lazy(() => import('../components/ClientMapInner'));

/* ─── Client List ─── */

function ClientList({ onSelect }) {
  const [search, setSearch] = useState('');
  const [allClients, setAllClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/jobber-data?action=all-clients')
      .then((r) => r.ok ? r.json() : [])
      .then(setAllClients)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = [...allClients];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [allClients, search]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="flex gap-3">
        <div className="flex-1 bg-card rounded-xl border border-border-subtle p-3 text-center">
          <p className="text-[9px] font-bold text-muted uppercase">Total Clients</p>
          <p className="text-2xl font-black text-primary">{allClients.length}</p>
        </div>
        <div className="flex-1 bg-card rounded-xl border border-border-subtle p-3 text-center">
          <p className="text-[9px] font-bold text-muted uppercase">Leads</p>
          <p className="text-2xl font-black text-amber-500">{allClients.filter((c) => c.isLead).length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border-subtle text-sm text-primary placeholder:text-muted outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <p className="text-[10px] text-muted">{filtered.length} clients</p>

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <User size={32} className="mx-auto text-muted/30 mb-3" />
          <p className="text-sm text-muted">{search ? 'No clients match' : 'No clients found'}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="bg-card rounded-xl border border-border-subtle px-4 py-3 hover:bg-surface-alt/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-primary truncate">{c.name}</p>
                      {c.isLead && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-500">Lead</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.address && <p className="text-[11px] text-muted truncate">{c.address}{c.city ? `, ${c.city}` : ''}</p>}
                    </div>
                    {c.phone && <p className="text-[10px] text-muted mt-0.5">{c.phone}</p>}
                    {c.tags?.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {c.tags.map((t) => <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-surface-alt text-muted">{t}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

/* ─── Client Profile ─── */

function ClientProfile({ client, agreement, onBack, onViewContract, onEditContract }) {
  const contractType = getContractType(client);
  const recurringServices = (client.services || []).filter((s) => s.priceLabel === '/visit');
  const projectServices = (client.services || []).filter((s) => s.calcType !== 'included' && s.priceLabel !== '/visit');
  const hasMap = client.measurements && client.measurements.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer">
          <ArrowLeft size={20} className="text-secondary" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-primary truncate">{client.name}</h1>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${getContractColor(contractType)}`}>
              {contractType}
            </span>
          </div>
        </div>
      </div>

      {/* Contact info */}
      <div className="bg-card rounded-2xl border border-border-subtle p-5 space-y-3">
        <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Contact</p>
        {client.address && (
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-muted shrink-0" />
            <p className="text-sm text-secondary">{client.address}{client.cityStateZip ? `, ${client.cityStateZip}` : ''}</p>
          </div>
        )}
        {client.phone && (
          <a href={`tel:${client.phone}`} className="flex items-center gap-2">
            <Phone size={14} className="text-muted shrink-0" />
            <p className="text-sm text-brand-text">{client.phone}</p>
          </a>
        )}
        {client.email && (
          <a href={`mailto:${client.email}`} className="flex items-center gap-2">
            <Mail size={14} className="text-muted shrink-0" />
            <p className="text-sm text-brand-text">{client.email}</p>
          </a>
        )}
      </div>

      {/* Revenue summary */}
      <div className="bg-card rounded-2xl border border-border-subtle p-5">
        <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Revenue</p>
        <div className="grid grid-cols-3 gap-3">
          {client.perVisit > 0 && (
            <div>
              <p className="text-[10px] text-muted">Per Visit</p>
              <p className="text-lg font-bold text-primary">${fmt(client.perVisit)}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] text-muted">Monthly</p>
            <p className="text-lg font-bold text-brand-text">${fmt(client.monthlyPrice || 0)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted">Annual</p>
            <p className="text-lg font-bold text-primary">${fmt(client.annualTotal || 0)}</p>
          </div>
        </div>
      </div>

      {/* Jobber recurring jobs */}
      {client.jobberJobs?.length > 0 && (
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Recurring Jobs</p>
          <div className="space-y-2">
            {client.jobberJobs.map((j, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border-subtle/50 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-primary">Job #{j.jobNumber}</p>
                  <p className="text-[10px] text-muted">{j.frequency}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-brand-text">${fmt(j.perVisit)}/visit</p>
                  <p className="text-[10px] text-muted">${fmt(j.monthly)}/mo</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contract / Term */}
      {client.termStart && (
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Contract</p>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs text-muted">Plan</span>
              <span className="text-xs font-semibold text-primary capitalize">{(client.planTier || 'total-care').replace(/-/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted">Start</span>
              <span className="text-xs font-semibold text-primary">{new Date(client.termStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted">Term</span>
              <span className="text-xs font-semibold text-primary">{client.termMonths || 12} months</span>
            </div>
          </div>
          {agreement && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={onViewContract}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-brand text-brand-text text-sm font-semibold hover:bg-brand-light/10 cursor-pointer transition-colors"
              >
                <FileText size={16} /> View PDF
              </button>
              <button
                onClick={onEditContract}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover cursor-pointer transition-colors"
              >
                <FileText size={16} /> Edit Contract
              </button>
            </div>
          )}
        </div>
      )}

      {/* Recurring services */}
      {recurringServices.length > 0 && (
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Recurring Services</p>
          <div className="space-y-2">
            {recurringServices.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-border-subtle/50 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-primary">{s.name}</p>
                  <p className="text-[10px] text-muted">{s.frequency} · {s.season}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-brand-text">${fmt(s.price)}/visit</p>
                  <p className="text-[10px] text-muted">{s.visitsPerYear} visits · ${fmt(s.price * s.visitsPerYear)}/yr</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* One-off projects */}
      {projectServices.length > 0 && (
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Projects</p>
          <div className="space-y-2">
            {projectServices.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-border-subtle/50 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-primary">{s.name}</p>
                  <p className="text-[10px] text-muted">{s.frequency} · {s.season}</p>
                </div>
                <p className="text-sm font-bold text-brand-text">${fmt(s.price)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Property data */}
      {hasMap && (
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Property</p>
          <div className="grid grid-cols-2 gap-3">
            {(() => {
              const lawn = client.measurements.filter((m) => m.category === 'lawn').reduce((s, m) => s + (m.sqft || 0), 0);
              const beds = client.measurements.filter((m) => m.category === 'beds').reduce((s, m) => s + (m.sqft || 0), 0);
              return (
                <>
                  <div className="bg-surface-alt rounded-xl p-3">
                    <p className="text-[10px] text-muted">Lawn Area</p>
                    <p className="text-lg font-bold text-emerald-500">{Math.round(lawn).toLocaleString()} sq ft</p>
                  </div>
                  <div className="bg-surface-alt rounded-xl p-3">
                    <p className="text-[10px] text-muted">Bed Area</p>
                    <p className="text-lg font-bold text-red-400">{Math.round(beds).toLocaleString()} sq ft</p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Notes */}
      <ClientNotes clientId={client.id} />
    </div>
  );
}

/* ─── Client Notes ─── */

function ClientNotes({ clientId }) {
  const clients = useAppStore((s) => s.clients) || [];
  const setClients = useAppStore((s) => s.setClients);
  const clientData = clients.find((c) => c.id === clientId) || {};
  const [note, setNote] = useState('');

  const notes = clientData.notes || [];

  const addNote = () => {
    if (!note.trim()) return;
    const updated = [...clients];
    const idx = updated.findIndex((c) => c.id === clientId);
    if (idx >= 0) {
      updated[idx] = { ...updated[idx], notes: [{ id: genId(), text: note.trim(), date: new Date().toISOString() }, ...(updated[idx].notes || [])] };
    } else {
      updated.push({ id: clientId, notes: [{ id: genId(), text: note.trim(), date: new Date().toISOString() }] });
    }
    setClients(updated);
    setNote('');
  };

  return (
    <div className="bg-card rounded-2xl border border-border-subtle p-5">
      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Notes</p>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }}
          placeholder="Add a note..."
          className="flex-1 px-3 py-2 rounded-xl bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted outline-none focus:ring-1 focus:ring-brand"
        />
        <button onClick={addNote} disabled={!note.trim()} className="px-4 py-2 rounded-xl bg-brand text-on-brand text-sm font-semibold cursor-pointer disabled:opacity-40">
          Add
        </button>
      </div>
      {notes.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {notes.map((n) => (
            <div key={n.id} className="bg-surface-alt rounded-lg px-3 py-2">
              <p className="text-sm text-secondary">{n.text}</p>
              <p className="text-[10px] text-muted mt-1">{new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">No notes yet</p>
      )}
    </div>
  );
}

/* ─── FULL_BULLETS for regenerating contracts ─── */
const FULL_BULLETS = {
  lawn: ['Mow entire lawn at the proper height for your grass type (Mar-Oct)', 'String trim where mowers can\'t reach', 'Edge along all sidewalks, driveways, and curbs', 'Edge around landscape beds', 'Blow all clippings off hard surfaces', 'Blow all leaves off beds, porches, walkways, driveways (Nov-Feb)', 'Mulch leaves into the lawn to return nutrients to the soil', 'Keep beds and the entire property looking clean year-round'],
  leaf: ['Blow all leaves off landscape beds, porches, walkways, driveways, and hard surfaces', 'Mulch leaves into the lawn to return nutrients to the soil', 'Trim grass as needed', 'Keep beds and the entire property looking clean'],
  aeration: ['Core aerate the entire lawn with commercial-grade equipment', 'Thickens your lawn with LESCO Tall Fescue Select Blend (Certified Tag) — a professional-grade seed trusted on golf courses and athletic fields. Certified for purity (no weeds, no filler) and bred for density, drought tolerance, and disease resistance, it establishes a cleaner, fuller lawn than store-bought blends'],
  sticks: ['Pick up all sticks on the property every visit', 'Haul away and dispose of off-site'],
  hedge: ['Shape and trim all shrubs, bushes, and hedges on the property', 'Remove all clippings and debris from beds and surrounding areas', 'Maintain natural shape while keeping growth in check'],
  mulch: null, // dynamic — uses saved mulchDepth
  pine: ['Weed all landscape beds before installation', 'Install fresh pine needles in all landscape beds', 'Clean up all walkways, driveways, and hard surfaces after installation'],
};

const PLAN_TIERS = [
  { id: 'total-care', name: 'Total Care', addonPerMonth: 0, description: 'All selected services bundled into one predictable monthly payment', extras: [] },
  { id: 'total-care-plus', name: 'Total Care Plus', addonPerMonth: 100, popular: true, description: 'Includes everything in Total Care +', extras: ['Leaf Upgrade (Nov-Feb): Haul off all leaves instead of mulching', 'Seasonal Bed Refresh (Fall): Turn and fluff existing mulch'] },
  { id: 'total-care-premium', name: 'Total Care Premium', addonPerMonth: 220, description: 'Includes everything in Total Care Plus +', extras: ['Up to 2 priority touch-up visits per year', 'Up to 3 storm cleanup visits per year', '48-hour priority requests'] },
];

/* ─── Raise Prices ─── */

function RaisePrices({ clients, onBack }) {
  const [message, setMessage] = useState(`Hi [First Name],\n\nThank you for being a valued client of Hey Jude's Lawn Care. We wanted to give you advance notice that starting [Date], there will be a small adjustment to your service rate.\n\nYour new rate will be [New Rate]. This change helps us continue delivering the same high-quality service you've come to expect — sharp results, reliable scheduling, and clear communication every visit.\n\nIf you have any questions, don't hesitate to reach out. We truly appreciate your loyalty.\n\nBest,\nJude\nHey Jude's Lawn Care\n(803) 902-7447`);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const recurringClients = clients.filter((c) => {
    const ids = new Set((c.services || []).map((s) => s.id));
    return ids.has('lawn') || ids.has('leaf');
  });

  const handleSend = async () => {
    if (!message.trim() || recurringClients.length === 0) return;
    setSending(true);
    try {
      // Send to GHL webhook — each client gets the message
      const payload = {
        action: 'bulk-message',
        message: message.trim(),
        clients: recurringClients.map((c) => ({
          name: c.name,
          email: c.email,
          phone: c.phone,
          address: c.address,
        })),
        sentAt: new Date().toISOString(),
      };
      await fetch('https://services.leadconnectorhq.com/hooks/Umlo2UnfqbijiGqNU6g2/webhook-trigger/15cc8619-0e39-4f92-943f-9fdf1e622e98', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSent(true);
    } catch (e) {
      alert('Failed to send: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted hover:text-secondary cursor-pointer">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="text-center py-12 space-y-3">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
            <Send size={24} className="text-emerald-500" />
          </div>
          <p className="text-lg font-bold text-primary">Sent to {recurringClients.length} clients</p>
          <p className="text-sm text-muted">The message has been sent to your GHL workflow for delivery.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer">
          <ArrowLeft size={20} className="text-secondary" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-primary">Raise Prices</h1>
          <p className="text-xs text-muted">Send a message to all {recurringClients.length} recurring clients</p>
        </div>
      </div>

      {/* Recipients */}
      <div className="bg-card rounded-2xl border border-border-subtle p-4">
        <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-2">Sending to</p>
        <p className="text-sm text-primary font-semibold">{recurringClients.length} recurring clients</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {recurringClients.slice(0, 10).map((c) => (
            <span key={c.id} className="px-2 py-0.5 rounded-full bg-surface-alt text-[10px] text-muted">{c.name.split(' ')[0]}</span>
          ))}
          {recurringClients.length > 10 && <span className="px-2 py-0.5 rounded-full bg-surface-alt text-[10px] text-muted">+{recurringClients.length - 10} more</span>}
        </div>
      </div>

      {/* Message */}
      <div className="bg-card rounded-2xl border border-border-subtle p-4 space-y-2">
        <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Message</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={12}
          className="w-full bg-surface-alt border border-border-subtle rounded-xl p-4 text-sm text-primary placeholder:text-muted outline-none focus:ring-1 focus:ring-brand resize-none"
        />
        <p className="text-[10px] text-muted">Use [First Name], [Date], and [New Rate] as placeholders. Your GHL workflow handles the merge fields.</p>
      </div>

      <button
        onClick={handleSend}
        disabled={sending || !message.trim() || recurringClients.length === 0}
        className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-brand text-on-brand font-black text-lg hover:bg-brand-hover cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
      >
        <Send size={20} /> {sending ? 'Sending...' : `Send to ${recurringClients.length} Clients`}
      </button>
    </div>
  );
}

/* ─── Main ─── */

export default function Clients() {
  const agreements = useAppStore((s) => s.agreements) || [];
  const savedClients = useAppStore((s) => s.clients) || [];
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('crm'); // 'crm' | 'recurring' | 'map' | 'contract' | 'raise'
  const [editingContractId, setEditingContractId] = useState(null);
  const [selectedRecurring, setSelectedRecurring] = useState(null);
  const [expandedVisit, setExpandedVisit] = useState(null);
  const [jobberClients, setJobberClients] = useState([]);
  const [loadingJobber, setLoadingJobber] = useState(true);

  // Fetch recurring clients from Jobber (with timeout)
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const yearStart = today.slice(0, 4) + '-01-01';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s max
    fetch(`/api/commander/summary?start=${yearStart}&end=${today}`, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.recurringClientList) {
          setJobberClients(data.recurringClientList);
        }
      })
      .catch(() => {})
      .finally(() => { clearTimeout(timeout); setLoadingJobber(false); });
  }, []);

  // Build agreements lookup by client name
  const agreementsByName = useMemo(() => {
    const map = new Map();
    for (const a of agreements) {
      const key = (a.clientName || '').toLowerCase().trim();
      const existing = map.get(key);
      if (!existing || new Date(a.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
        map.set(key, a);
      }
    }
    return map;
  }, [agreements]);

  // Merge Jobber recurring clients with agreement data
  const clientList = useMemo(() => {
    const list = jobberClients.map((jc) => {
      const agreement = agreementsByName.get((jc.name || '').toLowerCase().trim());
      return {
        id: agreement?.id || jc.name,
        name: jc.name,
        phone: agreement?.clientPhone || '',
        email: agreement?.clientEmail || '',
        address: agreement?.clientAddress || '',
        cityStateZip: agreement?.clientCityStateZip || '',
        // Jobber data
        jobberJobs: jc.jobs || [],
        perVisit: jc.perVisit || 0,
        monthlyPrice: jc.monthly || 0,
        annualTotal: (jc.monthly || 0) * 12,
        jobCount: jc.jobCount || 0,
        // Agreement data (if exists)
        services: agreement?.services || [],
        planTier: agreement?.planTier,
        termStart: agreement?.termStart,
        termMonths: agreement?.termMonths,
        measurements: agreement?.measurements || [],
        mapCenter: agreement?.mapCenter || null,
        createdAt: agreement?.createdAt,
        updatedAt: agreement?.updatedAt,
        agreementId: agreement?.id || null,
        hasContract: !!agreement,
      };
    });

    // Also add any agreement-only clients not in Jobber
    for (const a of agreements) {
      const key = (a.clientName || '').toLowerCase().trim();
      if (!jobberClients.some((jc) => (jc.name || '').toLowerCase().trim() === key)) {
        list.push({
          id: a.id,
          name: a.clientName || 'Unknown',
          phone: a.clientPhone || '',
          email: a.clientEmail || '',
          address: a.clientAddress || '',
          cityStateZip: a.clientCityStateZip || '',
          jobberJobs: [],
          perVisit: 0,
          monthlyPrice: a.monthlyPrice || 0,
          annualTotal: a.annualTotal || 0,
          jobCount: 0,
          services: a.services || [],
          planTier: a.planTier,
          termStart: a.termStart,
          termMonths: a.termMonths,
          measurements: a.measurements || [],
          mapCenter: a.mapCenter || null,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          agreementId: a.id,
          hasContract: true,
        });
      }
    }
    return list;
  }, [jobberClients, agreements, agreementsByName]);

  const totalRevenue = useMemo(() => clientList.reduce((s, c) => s + (c.monthlyPrice || 0), 0), [clientList]);

  const selected = selectedId ? clientList.find((c) => c.id === selectedId) : null;
  const agreement = selected?.agreementId ? agreements.find((a) => a.id === selected.agreementId) : null;

  // View contract PDF
  const handleViewContract = () => {
    if (!agreement) return;
    const termStart = agreement.termStart ? new Date(agreement.termStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    const html = generateAgreementHTML({
      client: { name: agreement.clientName, phone: agreement.clientPhone || '', email: agreement.clientEmail || '', address: agreement.clientAddress || '', cityStateZip: agreement.clientCityStateZip || 'Rock Hill, SC 29732' },
      services: (agreement.services || []).map((s) => {
        let bullets = FULL_BULLETS[s.id] || [s.name];
        // Make hedge bullet dynamic with saved season
        if (s.id === 'hedge' && s.season) {
          bullets = [`Shape and trim all shrubs, bushes, and hedges on the property (${s.season})`, 'Remove all clippings and debris from beds and surrounding areas', 'Maintain natural shape while keeping growth in check'];
        }
        // Make aeration bullet dynamic with saved visit data
        if (s.id === 'aeration') {
          bullets = ['Core aerate the entire lawn with commercial-grade equipment', 'Thickens your lawn with LESCO Tall Fescue Select Blend (Certified Tag) — a professional-grade seed trusted on golf courses and athletic fields. Certified for purity (no weeds, no filler) and bred for density, drought tolerance, and disease resistance, it establishes a cleaner, fuller lawn than store-bought blends'];
        }
        // Make mulch bullet dynamic with saved depth
        if (s.id === 'mulch') {
          const depth = agreement.mulchDepth || '3';
          bullets = ['Weed all landscape beds before installation', `Install fresh mulch in all landscape beds at ${depth} inches deep`, 'Edge beds cleanly before installation', 'Clean up all walkways, driveways, and hard surfaces after installation'];
        }
        return {
          name: s.name, frequency: s.frequency || '', season: s.season || '', bullets,
          price: s.price, priceLabel: s.priceLabel || '',
          visitsPerYear: s.visitsPerYear || 1, calcType: s.calcType || 'item',
        };
      }),
      plans: PLAN_TIERS.map((p) => ({ name: p.name, monthlyPrice: `$${fmt(Math.round((agreement.annualTotal || 0) / 12) + p.addonPerMonth)}`, description: p.description, extras: p.extras, popular: p.popular || false })),
      term: { startDate: termStart, endDate: '', months: agreement.termMonths || 12 },
    });
    const win = window.open('', '_blank'); win.document.write(html); win.document.close();
  };

  // Client profile view
  if (selected && view !== 'contract') {
    return <ClientProfile client={selected} agreement={agreement} onBack={() => setSelectedId(null)} onViewContract={handleViewContract} onEditContract={() => { setEditingContractId(agreement?.id || null); setView('contract'); }} />;
  }

  // Recurring client profile
  if (selectedRecurring) {
    const rc = selectedRecurring;
    const laborPct = rc.laborPct;
    const visits = rc.visitDetails || [];
    const currentFreq = rc.jobs?.[0]?.frequency || '';
    const isWeekly = currentFreq === 'Weekly';
    const savedClient = savedClients.find((c) => c.name?.toLowerCase().trim() === rc.name?.toLowerCase().trim());
    const quotedWeekly = savedClient?.weeklyPrice || null;
    const quotedEow = savedClient?.eowPrice || null;
    const currentPerVisit = rc.perVisit || 0;
    const displayWeekly = quotedWeekly || (isWeekly ? currentPerVisit : null);
    const displayEow = quotedEow || (!isWeekly ? currentPerVisit : null);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedRecurring(null); setExpandedVisit(null); }} className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer">
            <ArrowLeft size={20} className="text-secondary" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-primary truncate">{rc.name}</h1>
            <p className="text-xs text-muted">{currentFreq || 'Recurring'} · ${fmt(rc.perVisit || 0)}/visit</p>
          </div>
        </div>

        {/* Stats */}
        {(() => {
          const avgLaborCost = visits.length > 0 ? visits.reduce((s, v) => s + v.laborCost, 0) / visits.length : 0;
          const monthlyLaborEst = avgLaborCost * (rc.monthly > 0 && rc.perVisit > 0 ? rc.monthly / rc.perVisit : 0);
          const monthlyProfit = (rc.monthly || 0) - monthlyLaborEst;
          return (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card rounded-2xl border border-border-subtle p-4 text-center">
                <p className="text-[9px] font-bold text-muted uppercase">Per Visit</p>
                <p className="text-2xl font-black text-primary mt-1">${fmt(rc.perVisit || 0)}</p>
              </div>
              <div className="bg-card rounded-2xl border border-border-subtle p-4 text-center">
                <p className="text-[9px] font-bold text-muted uppercase">Monthly Rev</p>
                <p className="text-2xl font-black text-brand-text mt-1">${fmt(rc.monthly || 0)}</p>
              </div>
              <div className="bg-card rounded-2xl border border-border-subtle p-4 text-center">
                <p className="text-[9px] font-bold text-muted uppercase">Monthly Profit</p>
                <p className={`text-2xl font-black mt-1 ${monthlyProfit > 0 ? 'text-emerald-500' : 'text-muted'}`}>{visits.length > 0 ? `$${fmt(monthlyProfit)}` : '--'}</p>
              </div>
            </div>
          );
        })()}
        <div className={`rounded-2xl border p-6 text-center ${laborPct != null ? (laborPct > 30 ? 'bg-red-500/5 border-red-500/20' : laborPct > 25 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-emerald-500/5 border-emerald-500/20') : 'bg-card border-border-subtle'}`}>
          <p className="text-[9px] font-bold text-muted uppercase">Average Labor %</p>
          <p className={`text-5xl font-black mt-2 ${laborPct != null ? (laborPct > 30 ? 'text-red-500' : laborPct > 25 ? 'text-amber-500' : 'text-emerald-500') : 'text-muted'}`}>{laborPct != null ? `${laborPct.toFixed(0)}%` : '--'}</p>
        </div>

        {/* Pricing */}
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Pricing</p>
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-xl p-4 text-center ${isWeekly ? 'bg-brand-light/10 border border-brand/20' : 'bg-surface-alt'}`}>
              <p className="text-[9px] font-bold text-muted uppercase">Weekly</p>
              <p className="text-xl font-black text-primary mt-1">{displayWeekly ? `$${fmt(displayWeekly)}` : '--'}</p>
              {isWeekly && <p className="text-[9px] font-bold text-brand-text mt-1">Current</p>}
            </div>
            <div className={`rounded-xl p-4 text-center ${!isWeekly ? 'bg-brand-light/10 border border-brand/20' : 'bg-surface-alt'}`}>
              <p className="text-[9px] font-bold text-muted uppercase">Every Other Week</p>
              <p className="text-xl font-black text-primary mt-1">{displayEow ? `$${fmt(displayEow)}` : '--'}</p>
              {!isWeekly && <p className="text-[9px] font-bold text-brand-text mt-1">Current</p>}
            </div>
          </div>
          {savedClient?.quotedAt && <p className="text-[9px] text-muted text-center mt-2">Quoted {new Date(savedClient.quotedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
        </div>

        {/* Visit History */}
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Visit History (Last 30 Days)</p>
          {visits.length > 0 ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-2 py-1 text-[9px] font-bold text-muted uppercase">
                <span className="flex-1">Date</span>
                <span className="w-16 text-right">Revenue</span>
                <span className="w-16 text-right">Labor $</span>
                <span className="w-14 text-right">Labor %</span>
                <span className="w-14 text-right">Hours</span>
              </div>
              {visits.sort((a, b) => b.date.localeCompare(a.date)).map((v, vi) => (
                <div key={vi}>
                  <button onClick={() => setExpandedVisit(expandedVisit === vi ? null : vi)} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg bg-surface-alt/50 text-[11px] cursor-pointer hover:bg-surface-alt transition-colors text-left">
                    <span className="flex-1 text-muted">{v.date ? new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--'}</span>
                    <span className="w-16 text-right text-primary font-semibold">${Math.round(v.revenue)}</span>
                    <span className="w-16 text-right text-primary">${Math.round(v.laborCost)}</span>
                    <span className={`w-14 text-right font-bold ${v.laborPct != null ? (v.laborPct > 30 ? 'text-red-500' : v.laborPct > 25 ? 'text-amber-500' : 'text-emerald-500') : 'text-muted'}`}>{v.laborPct != null ? `${v.laborPct}%` : '--'}</span>
                    <span className="w-14 text-right text-muted">{fmtTime(v.hours)}</span>
                  </button>
                  {expandedVisit === vi && (
                    <div className="ml-4 mr-2 my-1 p-3 rounded-lg border border-border-subtle bg-card space-y-2">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Crew Breakdown</p>
                      {Object.keys(v.crew || {}).length > 0 ? (
                        <>
                          <div className="flex items-center gap-2 text-[9px] font-bold text-muted uppercase">
                            <span className="flex-1">Person</span>
                            <span className="w-14 text-right">Rate</span>
                            <span className="w-14 text-right">Hours</span>
                            <span className="w-16 text-right">Cost</span>
                          </div>
                          {Object.entries(v.crew).map(([person, data]) => (
                            <div key={person} className="flex items-center gap-2 text-[11px]">
                              <span className="flex-1 text-primary font-semibold">{person}</span>
                              <span className="w-14 text-right text-muted">${data.rate?.toFixed(0) || '?'}/hr</span>
                              <span className="w-14 text-right text-muted">{fmtTime(data.hours)}</span>
                              <span className="w-16 text-right text-primary font-semibold">${Math.round(data.cost || 0)}</span>
                            </div>
                          ))}
                          <div className="flex items-center gap-2 text-[11px] pt-1 border-t border-border-subtle/50">
                            <span className="flex-1 text-muted font-bold">Total Labor</span>
                            <span className="w-14 text-right"></span>
                            <span className="w-14 text-right text-muted font-bold">{fmtTime(v.hours)}</span>
                            <span className="w-16 text-right text-primary font-bold">${Math.round(v.laborCost)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border-subtle/50">
                            <span className="text-muted">Revenue: <span className="text-primary font-bold">${Math.round(v.revenue)}</span> — Labor: <span className="text-primary font-bold">${Math.round(v.laborCost)}</span></span>
                            <span className={`font-bold ${v.laborPct != null ? (v.laborPct > 30 ? 'text-red-500' : v.laborPct > 25 ? 'text-amber-500' : 'text-emerald-500') : 'text-muted'}`}>{v.laborPct != null ? `${v.laborPct}% labor` : '--'}</span>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-muted">No crew data for this visit</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {/* Average */}
              <div className="flex items-center gap-2 px-2 py-2 rounded-lg border border-brand/20 text-[11px] font-bold mt-1">
                <span className="flex-1 text-primary">Average ({visits.length} visits)</span>
                <span className="w-16 text-right text-primary">${Math.round(visits.reduce((s, v) => s + v.revenue, 0) / visits.length)}</span>
                <span className="w-16 text-right text-primary">${Math.round(visits.reduce((s, v) => s + v.laborCost, 0) / visits.length)}</span>
                <span className={`w-14 text-right ${laborPct != null ? (laborPct > 30 ? 'text-red-500' : laborPct > 25 ? 'text-amber-500' : 'text-emerald-500') : 'text-muted'}`}>{laborPct != null ? `${laborPct.toFixed(0)}%` : '--'}</span>
                <span className="w-14 text-right text-muted">{visits.length > 0 ? fmtTime(visits.reduce((s, v) => s + v.hours, 0) / visits.length) : '--'}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">No visit data from the last 30 days</p>
          )}
        </div>

      </div>
    );
  }

  // Raise prices view
  if (view === 'raise') {
    return <RaisePrices clients={clientList} onBack={() => setView('list')} />;
  }

  // Contract builder view (new or edit)
  if (view === 'contract') {
    return (
      <div className="space-y-4">
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" /></div>}>
          <ServiceAgreement editId={editingContractId} onDone={() => { setView('list'); setEditingContractId(null); setSelectedId(null); }} />
        </Suspense>
      </div>
    );
  }

  // Main view with tabs
  return (
    <div className="space-y-4">
      {/* Tab bar + actions */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-surface-alt p-1 rounded-xl flex-1">
          <button
            onClick={() => setView('crm')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex-1 justify-center ${view === 'crm' ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'}`}
          >
            <User size={14} /> Clients
          </button>
          <button
            onClick={() => setView('recurring')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex-1 justify-center ${view === 'recurring' ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'}`}
          >
            <List size={14} /> Recurring
          </button>
          <button
            onClick={() => setView('map')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex-1 justify-center ${view === 'map' ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'}`}
          >
            <MapIcon size={14} /> Map
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('raise')}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border-subtle text-xs font-semibold text-secondary cursor-pointer hover:bg-surface-alt transition-colors"
          >
            <DollarSign size={14} /> Raise Prices
          </button>
          <button
            onClick={() => { setEditingContractId(null); setView('contract'); }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand text-on-brand text-xs font-semibold cursor-pointer hover:bg-brand-hover transition-colors"
          >
            <Plus size={14} /> New Contract
          </button>
        </div>
      </div>

      {/* Content */}
      {view === 'crm' && <ClientList onSelect={(c) => { setSelectedId(c.id); }} />}
      {view === 'recurring' && <RecurringView onSelectClient={(c) => { setSelectedRecurring(c); }} />}
      {view === 'map' && (
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" /></div>}>
          <Dominate />
        </Suspense>
      )}
    </div>
  );
}
