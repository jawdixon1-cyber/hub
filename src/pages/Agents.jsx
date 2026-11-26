import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Hey Jude's Agent HQ: the "company pyramid" of agents. Each agent card shows what it
// needs, when it runs, who it hands off to, and whether it's live in Hub yet.

const DEPTS = [
  { key: 'office', n: 1, name: 'Office + Inbox', lead: 'Chief of Staff', color: '#00DF00', icon: '🏠' },
  { key: 'money', n: 2, name: 'Money', lead: 'Finance', color: '#FACC15', icon: '💵' },
  { key: 'sales', n: 3, name: 'Leads + Sales', lead: 'Sales Manager', color: '#FB923C', icon: '⚡' },
  { key: 'mkt', n: 4, name: 'Marketing', lead: 'Marketing', color: '#38BDF8', icon: '📣' },
  { key: 'field', n: 5, name: 'Field Ops', lead: 'You + crew lead', color: '#A78BFA', icon: '🔧' },
  { key: 'team', n: 6, name: 'Team', lead: 'You', color: '#F472B6', icon: '👥' },
];

// status: live = working in Hub today · next = build next · later = parked
const AGENTS = [
  { d: 'office', name: 'Chief of Staff', does: 'Reads every agent, Jobber and your inbox, then sends you one brief.', why: "One message: what's done, what's stuck, and the 3 things only you can do.", needs: ['Hub', 'Jobber', 'Gmail'], runs: '7:30 AM daily', to: ['You'], status: 'next' },
  { d: 'office', name: 'Text Inbox', does: 'Pulls every Quo text into End of Day so nothing gets missed.', why: 'Clients text more than they email.', needs: ['Quo'], runs: 'End of Day', to: ['Speed to Lead', 'Chief of Staff'], status: 'live', path: '/workflow/team-end' },
  { d: 'office', name: 'Email Inbox', does: 'Work Gmail panel in End of Day: replies, receipts, leads.', why: 'Nothing important dies in spam.', needs: ['Gmail'], runs: 'End of Day', to: ['Accounting', 'Speed to Lead'], status: 'live', path: '/workflow/team-end' },
  { d: 'office', name: 'Scheduling', does: 'Client says "Tuesday works" → books it in Jobber with one approval.', why: 'Booking goes from 3 apps to one tap.', needs: ['Jobber', 'Quo'], runs: 'When a reply comes in', to: ['Field Ops'], status: 'later' },

  { d: 'money', name: 'Daily Report', does: 'Live HQ globe: requests, quotes, installs, materials, money.', why: 'Know where you stand in one look.', needs: ['Hub', 'Jobber'], runs: 'Always live', to: ['You'], status: 'live', path: '/hq' },
  { d: 'money', name: 'Payroll', does: 'Lawn labor % and lights labor % vs goal, plus lights bonus split.', why: 'Good / Okay / Rough every week.', needs: ['Jobber timesheets'], runs: 'Weekly', to: ['You'], status: 'live', path: '/payroll' },
  { d: 'money', name: 'Daily P&L', does: 'Real profit per job: labor + materials + bonus vs price.', why: 'Find the jobs losing money while you can still fix pricing.', needs: ['Jobber', 'Materials tab'], runs: 'Weekdays 8 PM', to: ['Finance', 'Quote Coach'], status: 'next' },
  { d: 'money', name: 'Accounting', does: 'Logs receipts from Gmail onto the right order/job.', why: 'Books stay clean without typing.', needs: ['Gmail', 'Hub orders'], runs: 'Daily', to: ['Daily P&L'], status: 'later' },

  { d: 'sales', name: 'Speed to Lead', does: 'New Jobber request → lands in Quo in ~5 sec + Leads step.', why: 'First to respond usually wins.', needs: ['Jobber', 'Quo'], runs: 'Instantly (webhook)', to: ['Sales Manager'], status: 'live', path: '/leads' },
  { d: 'sales', name: 'Quote Follow Up', does: 'Drafts friendly follow-ups on unanswered quotes at day 3, 7 and 14.', why: 'Most quotes die from silence, not price.', needs: ['Jobber', 'Quo'], runs: 'Weekdays 8 PM', to: ['You: send'], status: 'next' },
  { d: 'sales', name: 'Sales Manager', does: 'Lights pipeline: sold / pending / declined, $/ft, multi-year.', why: 'Always know your close rate.', needs: ['Jobber', 'Lights Quoter'], runs: 'Always live', to: ['Chief of Staff'], status: 'live', path: '/lights-quoter?view=sales' },
  { d: 'sales', name: 'Quote Coach', does: 'Checks each quote against real $/ft and labor rates.', why: 'Underpriced quotes are the silent killer.', needs: ['Lights Quoter', 'Daily P&L'], runs: 'On every new quote', to: ['Sales Manager'], status: 'later' },

  { d: 'mkt', name: 'Past Client Upsell', does: 'Picks the best past lawn clients for lights and drafts a text each.', why: "They already trust you. It's lights season.", needs: ['Jobber', 'Quo'], runs: 'Sundays 8 PM', to: ['You: send'], status: 'next' },
  { d: 'mkt', name: 'Review + Referral', does: 'After each install: review ask + referral offer, drafted for you.', why: 'Happy clients forget to review.', needs: ['Jobber', 'Quo'], runs: 'When a job closes', to: ['You: send'], status: 'next' },
  { d: 'mkt', name: 'Google Profile', does: 'Drafts review replies + posts fresh job photos to GBP.', why: 'Active profile = more free leads.', needs: ['Google Business'], runs: 'Weekdays 8 AM', to: ['Marketing'], status: 'later' },
  { d: 'mkt', name: 'Mass Text', does: 'Seasonal blast to past clients, tracks every yes.', why: 'One blast can fill weeks.', needs: ['Quo', '10DLC approval'], runs: 'When you run it', to: ['You: send'], status: 'later', note: 'Waiting on 10DLC' },

  { d: 'field', name: 'Materials', does: 'NEED per material across every sold job + orders on the way.', why: 'No job waits on bulbs or clips.', needs: ['Lights Quoter', 'Orders'], runs: 'Always live', to: ['You'], status: 'live', path: '/lights-quoter?view=supplies' },
  { d: 'field', name: 'Crew View', does: 'Each job’s team page: strands, photos, materials.', why: 'Crew shows up knowing the plan.', needs: ['Lights Quoter'], runs: 'Per job', to: ['Crew'], status: 'live', path: '/lights-quoter?view=jobs' },
  { d: 'field', name: 'Timesheet Check', does: 'Flags bad clock-ins and suggests fixes. Never edits on its own.', why: 'Payroll stays right.', needs: ['Jobber timesheets'], runs: 'Daily', to: ['You: approve'], status: 'live', path: '/timesheets' },

  { d: 'team', name: 'Hiring', does: 'Writes the post, screens applicants, drafts interview invites.', why: 'Spring hiring stops eating your nights.', needs: ['Indeed', 'Gmail'], runs: 'Only when you say go', to: ['You'], status: 'later' },
];

const STATUS = {
  live: { label: 'Live in Hub', bg: 'rgba(0,223,0,.15)', fg: '#00DF00' },
  next: { label: 'Build next', bg: 'rgba(250,204,21,.15)', fg: '#FACC15' },
  later: { label: 'Later', bg: 'rgba(255,255,255,.08)', fg: 'rgba(255,255,255,.5)' },
};

const FLOWS = [
  ['Lead to sold job', ['Speed to Lead', 'Leads step', 'Quote', 'Quote Follow Up', 'Sales Manager']],
  ['Sold to installed', ['Sales Manager', 'Materials', 'Crew View', 'Review + Referral']],
  ['Money', ['Timesheet Check', 'Payroll', 'Daily P&L', 'Daily Report']],
  ['Everything to you', ['Every agent', 'Chief of Staff', 'You']],
];

const card = 'rounded-xl border border-white/10 bg-white/[.03]';

function AgentCard({ a, color, onOpen }) {
  const s = STATUS[a.status];
  return (
    <div className={`${card} p-4 flex flex-col gap-3`} style={{ borderTop: `2px solid ${color}` }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-black text-white leading-tight">{a.name}</p>
          <p className="text-sm text-white/75 mt-1">{a.does}</p>
          <p className="text-xs text-white/45 mt-1">{a.why}</p>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide" style={{ background: s.bg, color: s.fg }}>{a.note || s.label}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className={`${card} p-2`}>
          <p className="text-[9px] font-black tracking-widest text-orange-400">NEEDS</p>
          <div className="flex flex-wrap gap-1 mt-1">{a.needs.map((n) => <span key={n} className="rounded-md bg-white/10 px-1.5 py-0.5 text-white/80">{n}</span>)}</div>
        </div>
        <div className={`${card} p-2`}>
          <p className="text-[9px] font-black tracking-widest text-orange-400">RUNS</p>
          <p className="mt-1 font-bold" style={{ color }}>{a.runs}</p>
        </div>
        <div className={`${card} p-2`}>
          <p className="text-[9px] font-black tracking-widest text-orange-400">HANDS OFF TO</p>
          {a.to.map((t) => <p key={t} className="mt-1 text-white/85">→ {t}</p>)}
        </div>
      </div>
      {a.path && <button onClick={() => onOpen(a.path)} className="self-start text-xs font-bold hover:underline" style={{ color }}>Open in Hub →</button>}
    </div>
  );
}

export default function Agents() {
  const navigate = useNavigate();
  const [dept, setDept] = useState(null);
  const d = DEPTS.find((x) => x.key === dept);
  const count = (k, st) => AGENTS.filter((a) => a.d === k && (!st || a.status === st)).length;
  const live = AGENTS.filter((a) => a.status === 'live').length;

  return (
    <div className="-m-4 sm:-m-6 min-h-[calc(100vh-56px)] p-4 sm:p-8" style={{ background: '#07090a' }}>
      <div className="max-w-5xl mx-auto">
        {!d ? (
          <>
            <p className="text-[11px] font-black tracking-[0.25em] text-[#00DF00]">THE PYRAMID</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white mt-1">Hey Jude&#8217;s, stacked like a real company</h1>
            <p className="text-sm text-white/50 mt-1">{live} of {AGENTS.length} agents already live in Hub · tap a department</p>

            <div className="flex flex-col items-center mt-8">
              <div className="rounded-xl px-8 py-3 text-center font-black text-black" style={{ background: '#F59E0B' }}>
                <p className="text-xl">YOU</p><p className="text-xs font-semibold opacity-80">The 3 things only you can do</p>
              </div>
              <div className="w-px h-5 bg-[#00DF00]" />
              <div className="rounded-xl px-8 py-3 text-center text-black" style={{ background: '#00DF00', boxShadow: '0 0 30px #00DF0066' }}>
                <p className="text-xl font-black">Chief of Staff</p><p className="text-xs font-semibold opacity-80">Reads every agent, sends you one brief</p>
              </div>
              <div className="w-px h-5 bg-[#00DF00]" />
              <div className="w-full h-px bg-[#00DF00]/60" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 w-full mt-5">
                {DEPTS.map((x) => (
                  <button key={x.key} onClick={() => setDept(x.key)} className={`${card} p-3 text-center hover:bg-white/[.07] transition`} style={{ borderTop: `2px solid ${x.color}` }}>
                    <p className="text-xl">{x.icon}</p>
                    <p className="text-sm font-black text-white mt-1">{x.n}. {x.name}</p>
                    <p className="text-[11px] text-white/50">{x.lead}</p>
                    <p className="text-xs font-bold mt-1" style={{ color: x.color }}>{count(x.key)} agents · {count(x.key, 'live')} live</p>
                  </button>
                ))}
              </div>
            </div>

            <div className={`${card} p-4 mt-8 border-orange-400/40`}>
              <p className="text-[10px] font-black tracking-widest text-orange-400">HOUSE RULES, EVERY AGENT</p>
              <p className="text-sm text-white/80 mt-1">Never sends a text without your OK · never auto-edits timesheets · never moves money · never makes up numbers · drafts, you approve.</p>
            </div>

            <p className="text-[11px] font-black tracking-[0.25em] text-[#00DF00] mt-10">THE WEB</p>
            <h2 className="text-2xl font-black text-white">How they talk to each other</h2>
            <div className="mt-4 space-y-4">
              {FLOWS.map(([t, steps]) => (
                <div key={t}>
                  <p className="text-[10px] font-black tracking-widest text-orange-400 uppercase">{t}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {steps.map((s, i) => (
                      <span key={s} className="flex items-center gap-2">
                        <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/85">{s}</span>
                        {i < steps.length - 1 && <span className="text-[#00DF00]">→</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setDept(null)} className="text-sm text-white/60 hover:text-white">← Pyramid</button>
            <p className="text-[11px] font-black tracking-[0.25em] mt-4" style={{ color: d.color }}>DEPARTMENT {d.n} OF 6</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white">{d.icon} {d.name}</h1>
            <p className="text-sm text-white/50 mt-1">Led by <span style={{ color: d.color }}>{d.lead}</span> · {count(d.key)} agents, {count(d.key, 'live')} live</p>
            <div className="grid gap-4 mt-6 md:grid-cols-2">
              {AGENTS.filter((a) => a.d === d.key).map((a) => <AgentCard key={a.name} a={a} color={d.color} onOpen={navigate} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
