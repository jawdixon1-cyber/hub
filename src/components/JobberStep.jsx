import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Phone, ExternalLink, Check, CalendarDays, PhoneCall, Receipt, AlertTriangle, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Jobber step: today's schedule, requests to call, invoices to send, and what's overdue.
// Read-only. Each row opens the item in Jobber; phone rows dial through Quo.

const money = (n) => (n == null ? '' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`);
const time = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
function ago(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 864e5);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
}
const dial = (phone) => `openphone://dial?number=${encodeURIComponent(phone)}&action=call`;

const TYPE = {
  Visit: 'bg-sky-500/15 text-sky-300',
  Assessment: 'bg-violet-500/15 text-violet-300',
  Task: 'bg-amber-500/15 text-amber-300',
  Event: 'bg-zinc-500/20 text-zinc-300',
};

export default function JobberStep() {
  const { session } = useAuth();
  const token = session?.access_token || '';
  const [state, setState] = useState({ loading: true, data: null, error: null });

  const load = useCallback(async (fresh = false) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await fetch(`/api/jobber-today${fresh ? '?fresh=1' : ''}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      setState({ loading: false, data: d, error: d.stale ? d.error : null });
    } catch (e) { setState((s) => ({ ...s, loading: false, error: e.message })); }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const d = state.data;
  const err = d?.errors || {};
  const today = d?.today || [];
  const left = today.filter((x) => !x.done).length;

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <p className="text-sm font-black text-primary flex-1">
          {state.loading && !d ? 'Loading Jobber…' : `Today: ${today.length} on the schedule${today.length ? ` · ${left} left` : ''}`}
        </p>
        {d?.at && <span className="text-[11px] text-muted">Updated {time(d.at)}</span>}
        <button onClick={() => load(true)} disabled={state.loading} title="Refresh from Jobber"
          className="text-muted hover:text-primary p-1.5 rounded-lg hover:bg-surface-alt cursor-pointer disabled:opacity-40">
          <RefreshCw size={14} className={state.loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {state.error && <p className="text-sm font-bold text-rose-400 mb-3">{state.error}</p>}

      {d?.workflow && <Workflow w={d.workflow} />}
      {err.workflow && <p className="text-xs font-bold text-rose-400 mb-3">{err.workflow}</p>}
      {d?.money && <CrewBoard crew={d.money.byCrew} today={d.today || []} />}
      {d?.money && <MoneyToday money={d.money} payments={d.payments} today={d.today || []} payErr={err.payments} dupes={d.duplicates || []} />}

      {d && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Today */}
          <Panel icon={CalendarDays} title="Today" count={today.length} error={err.today}>
            {today.length === 0 && !err.today && <Empty>Nothing on the schedule today.</Empty>}
            {today.map((x) => (
              <Row key={x.id} url={x.url}>
                <div className="w-16 shrink-0 text-xs font-bold text-muted pt-0.5">{x.allDay ? 'All day' : time(x.startAt)}</div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold truncate ${x.done ? 'text-tertiary line-through' : 'text-primary'}`}>
                    <span className={`mr-1.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${TYPE[x.type] || TYPE.Event}`}>{x.type}</span>
                    {x.title}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {[x.client && x.client !== x.title?.split(' - ')[0] ? x.client : null, x.address, x.crew.join(', ')].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {(x.value > 0 || x.est > 0) && <span className="shrink-0 text-xs font-bold text-muted mt-0.5" title={x.estHow || ''}>{money(x.value || x.est)}{x.est > 0 && !x.value ? ' est.' : ''}</span>}
                {x.done && <Check size={16} className="shrink-0 text-emerald-400 mt-0.5" />}
              </Row>
            ))}
          </Panel>

          <div className="space-y-4">
            {/* Requests to call */}
            <Panel icon={PhoneCall} title="Requests to call" count={d.requests?.length} error={err.requests}>
              {(d.requests || []).length === 0 && !err.requests && <Empty>No new requests.</Empty>}
              {(d.requests || []).map((r) => (
                <Row key={r.id} url={r.url}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-primary truncate">
                      {r.client}
                      {r.status === 'overdue' && <span className="ml-1.5 text-[9px] font-black uppercase text-rose-400">overdue</span>}
                    </p>
                    <p className="text-xs text-muted truncate">{r.title !== 'Request' ? r.title : (r.address || 'No details')} · {ago(r.createdAt)}</p>
                  </div>
                  {r.phone && <CallButton phone={r.phone} />}
                </Row>
              ))}
            </Panel>

            {/* Invoices to send */}
            <Panel icon={Receipt} title="Invoices to send" count={d.toInvoice?.length} error={err.invoice}>
              {(d.toInvoice || []).length === 0 && !err.invoice && <Empty>No jobs require invoicing and no draft invoices.</Empty>}
              {(d.toInvoice || []).map((i) => (
                <Row key={i.id} url={i.url}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-primary truncate">{i.client || i.title}</p>
                    <p className="text-xs text-muted truncate">
                      {i.label}{i.jobNumber ? ` · Job #${i.jobNumber}` : ''}{i.kind === 'visit' ? ' · completed, not invoiced' : ''}{i.title && i.client ? ` · ${i.title}` : ''}
                    </p>
                  </div>
                  {i.amount ? <span className="shrink-0 text-sm font-black text-primary">{money(i.amount)}</span> : null}
                </Row>
              ))}
            </Panel>

            {/* Overdue */}
            <Overdue overdue={d.overdue} err={err} />
          </div>
        </div>
      )}
    </section>
  );
}

// Jobber's home-screen "Workflow" row: Requests → Quotes → Jobs → Invoices.
const J = 'https://secure.getjobber.com';
function Workflow({ w }) {
  const k = (n) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : money(Math.round(n)));
  const cols = [
    { title: 'Requests', color: '#c2702a', url: `${J}/requests`, big: w.requests.new, label: 'New',
      rows: [['Overdue', w.requests.overdue, null, w.requests.overdue > 0]] },
    { title: 'Quotes', color: '#9b3b4b', url: `${J}/quotes`, big: w.quotes.approved, label: 'Approved',
      rows: [['Draft', w.quotes.draft], ['Changes requested', w.quotes.changes, null, w.quotes.changes > 0]] },
    { title: 'Jobs', color: '#5b8a2e', url: `${J}/jobs`, big: w.jobs.requiresInvoicing, label: 'Requires invoicing',
      rows: [['Active', w.jobs.active, k(w.jobs.activeTotal)], ['Action required', w.jobs.actionRequired, k(w.jobs.actionTotal), w.jobs.actionRequired > 0]] },
    { title: 'Invoices', color: '#2f5f9e', url: `${J}/invoices`, big: w.invoices.awaiting, bigSub: k(w.invoices.awaitingTotal), label: 'Awaiting payment',
      rows: [['Draft', w.invoices.draft], ['Past due', w.invoices.pastDue, k(w.invoices.pastDueTotal), w.invoices.pastDue > 0]] },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 rounded-3xl border border-card-border bg-card overflow-hidden mb-4">
      {cols.map((c, i) => (
        <a key={c.title} href={c.url} target="_blank" rel="noopener noreferrer"
          className={`block p-4 hover:bg-surface-alt ${i > 0 ? 'lg:border-l' : ''} ${i % 2 ? 'border-l lg:border-l' : ''} ${i > 1 ? 'border-t lg:border-t-0' : ''} border-card-border`}
          style={{ borderTop: `4px solid ${c.color}` }}>
          <p className="text-xs font-bold text-muted mb-1">{c.title}</p>
          <p className="text-3xl font-black text-primary leading-none">
            {c.big}{c.bigSub && c.big > 0 && <span className="ml-1.5 text-sm font-bold text-muted">{c.bigSub}</span>}
          </p>
          <p className="text-sm font-black text-primary mt-1 mb-2">{c.label}</p>
          {c.rows.map(([label, n, amt, alert]) => (
            <div key={label} className="flex items-center text-xs py-0.5">
              <span className={`flex-1 ${alert ? 'font-black text-rose-300' : 'text-muted'}`}>{label} ({n})</span>
              {amt && n > 0 && <span className={`font-bold ${alert ? 'text-rose-300' : 'text-primary'}`}>{amt}</span>}
            </div>
          ))}
        </a>
      ))}
    </div>
  );
}

// Is the visit paid for? (its own invoice, or the plan's monthly bill)
function PaidBadge({ p }) {
  const tone = p.state === 'paid' ? 'bg-emerald-500/15 text-emerald-300'
    : p.state === 'pastdue' ? 'bg-rose-500/15 text-rose-300'
    : p.state === 'due' ? 'bg-amber-500/15 text-amber-300'
    : 'bg-surface-alt text-muted';
  const label = p.state === 'paid' ? `✓ ${p.label}` : p.label;
  return <span title={p.invoiceNumber ? `Invoice #${p.invoiceNumber}` : 'No invoice yet'} className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap ${tone}`}>{label}</span>;
}

// The crew side by side: what each person brought in, their labor, and their visits today.
function CrewBoard({ crew, today }) {
  const GOAL = 30; // lawn labor % goal (Payroll)
  const people = crew.filter((c) => c.name !== 'Unassigned' || c.visits > 0);
  if (!people.length) return null;
  const visitsFor = (name) => today.filter((x) => x.type !== 'Event' && (x.crew.length ? x.crew.includes(name) : name === 'Unassigned'));
  return (
    <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))` }}>
      {people.map((c) => {
        const unknown = c.completed === 0 && c.pending?.length > 0;
        const list = visitsFor(c.name);
        return (
          <div key={c.name} className="rounded-3xl border border-card-border bg-card p-4 flex flex-col">
            <p className="text-base font-black text-primary">{c.name}</p>
            {unknown
              ? <p className="text-sm font-bold text-muted mt-1">Not known yet</p>
              : <p className="text-2xl font-black text-brand leading-tight">{money(c.completed)} <span className="text-xs font-bold text-muted">brought in</span></p>}
            <p className="text-xs text-muted mt-1">
              {c.done} of {c.visits} done{c.value > c.completed ? ` · ${money(c.value - c.completed)} to go` : ''}
            </p>
            {c.pending?.length > 0 && <p className="text-[11px] text-amber-300 mt-1">{c.pending.join(', ')}: one-time job not closed yet, value not known.</p>}
            {c.hours != null && (
              <p className="text-xs mt-1.5">
                <span className="text-muted">{c.hours.toFixed(2)} hrs{c.clockedIn ? ' (on the clock)' : ''}</span>
                {c.rate != null && <span className="text-muted"> × {money(c.rate)} = <b className="text-primary">{money(c.laborCost)}</b></span>}
                {c.rate == null && <span className="text-muted"> · not on payroll</span>}
              </p>
            )}
            {c.laborPct != null && (
              <span className={`self-start mt-1.5 text-xs font-black px-2 py-0.5 rounded-lg ${c.laborPct <= GOAL ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                {c.laborPct}% labor <span className="font-bold opacity-70">· goal {GOAL}%</span>
              </span>
            )}

            {/* Their schedule */}
            <div className="mt-3 pt-2 border-t border-card-border space-y-0.5">
              {list.map((x) => (
                <Row key={x.id} url={x.url}>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold leading-snug ${x.done ? 'text-primary/80' : 'text-primary'} ${x.type === 'Task' && x.done ? 'line-through' : ''}`}>{x.type === 'Task' ? x.title : (x.client || x.title)}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      {!x.allDay && <span className="text-[11px] font-bold text-muted">{time(x.startAt)}</span>}
                      {x.done && x.completedAt && <span className="text-[11px] text-muted">done {time(x.completedAt)}</span>}
                      {x.type !== 'Visit' && <span className={`text-[10px] font-black uppercase ${x.type === 'Task' ? 'text-amber-300' : 'text-violet-300'}`}>{x.type}</span>}
                      {(x.value > 0 || x.est > 0) && <span className="text-[11px] font-bold text-muted" title={x.estHow || ''}>{money(x.value || x.est)}</span>}
                      {x.type === 'Visit' && x.paid ? <PaidBadge p={x.paid} /> : x.done ? <Check size={13} className="text-emerald-400" /> : null}
                    </div>
                  </div>
                </Row>
              ))}
              {list.length === 0 && <p className="text-xs text-muted py-2">Nothing scheduled.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// How much came in today + today's appointment value, Jobber-style, with breakdowns.
function MoneyToday({ money: m, payments, today, payErr, dupes = [] }) {
  const visits = today.filter((x) => x.type === 'Visit');
  const unpaid = visits.filter((x) => x.paid && x.paid.state !== 'paid');
  const a = m.all || m; // includes monthly plans + one-time jobs, worked out per visit
  const tiles = [
    ['Came in today', payments?.total ?? null, 'text-brand'],
    ['Work scheduled', a.total],
    ['Completed', a.completed],
    ['Remaining', a.remaining],
    ['Overdue', a.overdue, a.overdue > 0 ? 'text-rose-300' : ''],
  ];
  return (
    <div className="rounded-3xl border border-card-border bg-card p-4 mb-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
        {tiles.map(([label, v, cls]) => (
          <div key={label} className={label === 'Came in today' ? 'col-span-2 sm:col-span-1 rounded-2xl bg-brand/10 p-3' : 'p-3'}>
            <p className="text-[11px] font-bold text-muted">{label}</p>
            <p className={`text-2xl font-black ${cls || 'text-primary'}`}>{v == null ? '—' : money(v)}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted px-1 mb-2">
        {m.visitsDone} of {m.visits} visits done · {unpaid.length === 0 ? <b className="text-emerald-300">every visit is paid ✓</b> : <b className="text-amber-300">{unpaid.length} not paid yet: {unpaid.map((x) => `${x.client || x.title} (${x.paid.label})`).join(', ')}</b>} · Monthly plans counted per visit (est.).
      </p>
      {payErr && <p className="text-xs font-bold text-rose-400 px-1 mb-2">Payments: {payErr}</p>}
      {dupes.length > 0 && (
        <p className="text-xs text-amber-300 px-1 mb-2">
          Not counted: {dupes.length} duplicate visit{dupes.length === 1 ? '' : 's'} from reopened jobs ({dupes.map((x, i) => (
            <span key={x.id}>{i ? ', ' : ''}{x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-200">{x.client}</a> : x.client}</span>
          ))}), already done today. Delete them in Jobber to clean up.
        </p>
      )}

    </div>
  );
}

function Overdue({ overdue, err }) {
  const [showAll, setShowAll] = useState(false);
  const invoices = overdue?.invoices || [];
  const items = overdue?.items || [];
  const owed = invoices.reduce((s, i) => s + (Number(i.balance) || 0), 0);
  const shown = showAll ? items : items.slice(0, 6);
  return (
    <Panel icon={AlertTriangle} title="Overdue" count={invoices.length + items.length} tone="rose" error={err.pastDue || err.overdue}>
      {invoices.length > 0 && (
        <>
          <SubHead>Past-due invoices · {money(owed)} owed</SubHead>
          {invoices.map((i) => (
            <Row key={i.id} url={i.url}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-primary truncate">{i.client}</p>
                <p className="text-xs text-muted truncate">Invoice #{i.invoiceNumber} · due {shortDate(i.dueDate)} ({ago(i.dueDate)})</p>
              </div>
              <span className="shrink-0 text-sm font-black text-rose-300">{money(i.balance)}</span>
              {i.phone && <CallButton phone={i.phone} />}
            </Row>
          ))}
        </>
      )}
      {items.length > 0 && (
        <>
          <SubHead>Missed visits · {items.length}{items.length >= 40 ? '+' : ''}</SubHead>
          {shown.map((x) => (
            <Row key={x.id} url={x.url}>
              <div className="w-14 shrink-0 text-xs font-bold text-muted pt-0.5">{shortDate(x.startAt)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-primary truncate">
                  <span className={`mr-1.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${TYPE[x.type] || TYPE.Event}`}>{x.type}</span>
                  {x.title}
                </p>
                {(x.client || x.crew.length > 0) && <p className="text-xs text-muted truncate">{[x.client, x.crew.join(', ')].filter(Boolean).join(' · ')}</p>}
              </div>
            </Row>
          ))}
          {items.length > 6 && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-1 px-3 text-xs font-bold text-muted hover:text-primary inline-flex items-center gap-1 cursor-pointer">
              <ChevronDown size={12} className={showAll ? 'rotate-180' : ''} /> {showAll ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
      {invoices.length === 0 && items.length === 0 && !(err.pastDue || err.overdue) && <Empty>Nothing overdue. 🎉</Empty>}
    </Panel>
  );
}

function Panel({ icon: Icon, title, count, tone, error, children }) {
  return (
    <div className="rounded-3xl border border-card-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Icon size={15} className={tone === 'rose' ? 'text-rose-400' : 'text-brand'} />
        <p className="text-sm font-black text-primary flex-1">{title}</p>
        {count > 0 && <span className={`text-xs font-black px-2 py-0.5 rounded-full ${tone === 'rose' ? 'bg-rose-500/15 text-rose-300' : 'bg-surface-alt text-primary'}`}>{count}</span>}
      </div>
      {error && <p className="text-xs font-bold text-rose-400 px-1 mb-1">{error}</p>}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ url, children }) {
  const cls = 'flex items-start gap-2 px-2 py-2 rounded-xl';
  if (!url) return <div className={cls}>{children}</div>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-surface-alt group`} title="Open in Jobber">
      {children}
      <ExternalLink size={12} className="shrink-0 mt-1 text-muted opacity-0 group-hover:opacity-100" />
    </a>
  );
}

function CallButton({ phone }) {
  return (
    <a href={dial(phone)} onClick={(e) => e.stopPropagation()} title={`Call ${phone} from Quo`}
      className="shrink-0 inline-flex items-center gap-1 text-xs font-black text-black bg-brand hover:brightness-110 px-2.5 py-1 rounded-lg">
      <Phone size={12} /> Call
    </a>
  );
}

const SubHead = ({ children }) => <p className="px-2 pt-2 pb-1 text-[10px] font-black uppercase tracking-[0.15em] text-muted">{children}</p>;
const Empty = ({ children }) => <p className="px-2 py-3 text-sm text-muted">{children}</p>;
