import { useState, useRef, useCallback } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  Pencil,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Eye,
  Code,
  ClipboardList,
  Inbox,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  X,
  Globe,
  Sparkles,
  Type,
  AlignLeft,
  Mail,
  Phone,
  CircleDot,
  ListChecks,
  List,
  PenTool,
  Video,
  FileText,
  Briefcase,
  Search,
  ArrowUpDown,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';

const genId = () => crypto.randomUUID().slice(0, 8);

/* ─── Field type definitions ─── */
const FIELD_TYPES = [
  { type: 'short',    label: 'Short Answer', icon: Type,       color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  { type: 'long',     label: 'Long Answer',  icon: AlignLeft,  color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  { type: 'email',    label: 'Email',         icon: Mail,       color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-500/20' },
  { type: 'phone',    label: 'Phone',         icon: Phone,      color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  { type: 'radio',    label: 'Single Select', icon: CircleDot,  color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  { type: 'dropdown', label: 'Dropdown',      icon: List,       color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  { type: 'multi',    label: 'Multi Select',  icon: ListChecks, color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-500/20' },
  { type: 'signature',label: 'Signature',     icon: PenTool,    color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
  { type: 'video',    label: 'Video',         icon: Video,      color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
  { type: 'info',     label: 'Info Text',     icon: FileText,   color: 'text-gray-400',   bg: 'bg-gray-500/10 border-gray-500/20' },
];

const FIELD_TYPE_MAP = Object.fromEntries(FIELD_TYPES.map((t) => [t.type, t]));
const HAS_OPTIONS = new Set(['radio', 'dropdown', 'multi']);

/* ─── Shared UI ─── */
function Input({ value, onChange, placeholder, className = '', ...rest }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-surface-alt border border-border-default rounded-lg px-3 py-2 text-sm text-primary placeholder:text-placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand ${className}`}
      {...rest}
    />
  );
}

/* ═══════════════════════════════════════════
   HIRING PAGE PREVIEW
   ═══════════════════════════════════════════ */
function HiringPagePreview({ content, steps }) {
  const c = content;

  const CheckIcon = () => (
    <span className="w-[18px] h-[18px] rounded-md bg-[rgba(176,255,3,.10)] border border-[rgba(176,255,3,.18)] inline-flex items-center justify-center shrink-0 mt-0.5">
      <svg width="12" height="12" viewBox="0 0 24 24"><path fill="#B0FF03" d="M9.2 16.6 4.9 12.3l1.6-1.6 2.7 2.7 8-8 1.6 1.6z"/></svg>
    </span>
  );
  const XIcon = () => (
    <span className="w-[18px] h-[18px] rounded-md bg-[rgba(255,80,80,.08)] border border-[rgba(255,80,80,.20)] inline-flex items-center justify-center shrink-0 mt-0.5">
      <svg width="12" height="12" viewBox="0 0 24 24"><path fill="rgba(255,100,100,.70)" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    </span>
  );

  const Checklist = ({ items, neg }) => (
    <ul className="space-y-0">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 items-start py-2.5 border-t border-[rgba(255,255,255,.07)] first:border-0 text-[rgba(255,255,255,.78)] font-[760] text-[14.5px] leading-[1.35]">
          {neg ? <XIcon /> : <CheckIcon />}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );

  const Card = ({ children, feature }) => (
    <div className={`rounded-[22px] p-[18px] overflow-hidden ${
      feature
        ? 'border border-[rgba(176,255,3,.20)] bg-[radial-gradient(110%_140%_at_50%_0%,rgba(176,255,3,.12)_0%,rgba(176,255,3,0)_66%),rgba(255,255,255,.03)]'
        : 'border border-[rgba(255,255,255,.10)] bg-[rgba(255,255,255,.03)]'
    }`}>
      {children}
    </div>
  );

  const CardTitle = ({ children }) => (
    <h3 className="text-[16px] font-black tracking-[.2px] text-[rgba(255,255,255,.92)] mb-2.5">{children}</h3>
  );

  const Callout = ({ children, feature }) => (
    <div className={`mt-3.5 px-3.5 py-3 rounded-2xl font-[850] text-[14.5px] ${
      feature
        ? 'border border-[rgba(176,255,3,.20)] bg-[rgba(176,255,3,.06)] text-[rgba(255,255,255,.92)]'
        : 'border border-[rgba(255,255,255,.10)] bg-[rgba(255,255,255,.02)] text-[rgba(255,255,255,.86)]'
    }`}>
      {children}
    </div>
  );

  const SH = ({ children }) => (
    <h2 className="text-[clamp(24px,4.6vw,32px)] leading-[1.1] font-black tracking-[-0.3px] text-white mb-2.5">{children}</h2>
  );

  const SP = ({ children }) => (
    <p className="text-[rgba(255,255,255,.74)] font-[720] mb-3 max-w-[78ch]">{children}</p>
  );

  const Sec = ({ children }) => (
    <div className="py-12 border-t border-[rgba(255,255,255,.08)]">{children}</div>
  );

  const allSteps = steps || [];

  // Render a single field in the preview style
  const FormField = ({ field }) => (
    <div>
      {field.label.includes('\n') ? (
        <div className="text-[13px] text-[rgba(255,255,255,.7)] mb-2 whitespace-pre-line leading-relaxed font-semibold">{field.label}</div>
      ) : (
        <label className="block text-[13px] font-semibold text-[rgba(255,255,255,.8)] mb-1.5">
          {field.label} {field.required && <span className="text-red-400">*</span>}
        </label>
      )}
      {field.description && <p className="text-[11px] text-[rgba(255,255,255,.4)] mb-1.5 font-semibold">{field.description}</p>}

      {field.type === 'info' && null}
      {(field.type === 'short' || field.type === 'text' || field.type === 'email' || field.type === 'phone') && (
        <div className="w-full bg-[#1a1a1a] border border-[#2e2e2e] rounded-xl px-3.5 py-2.5 text-sm text-[#444]">{field.placeholder || '\u00A0'}</div>
      )}
      {(field.type === 'long') && (
        <div className="w-full bg-[#1a1a1a] border border-[#2e2e2e] rounded-xl px-3.5 py-2.5 text-sm text-[#444] min-h-[72px]">{field.placeholder || '\u00A0'}</div>
      )}
      {field.type === 'dropdown' && (
        <div className="w-full bg-[#1a1a1a] border border-[#2e2e2e] rounded-xl px-3.5 py-2.5 text-sm text-[#444] flex items-center justify-between">
          <span>Select...</span>
          <ChevronDown size={14} className="text-[#444]" />
        </div>
      )}
      {field.type === 'radio' && (
        <div className="space-y-1.5">
          {(field.options || []).map((opt, i) => (
            <div key={i} className="flex items-center gap-3 px-3.5 py-2 rounded-xl border border-[#2e2e2e] bg-[#1a1a1a]">
              <div className="w-4 h-4 rounded-full border-2 border-[#444] shrink-0" />
              <span className="text-[13px] text-[rgba(255,255,255,.7)] font-semibold">{opt}</span>
            </div>
          ))}
        </div>
      )}
      {(field.type === 'multi' || field.type === 'checkbox') && (
        <div className="space-y-1.5">
          {(field.options || []).map((opt, i) => (
            <div key={i} className="flex items-center gap-3 px-3.5 py-2 rounded-xl border border-[#2e2e2e] bg-[#1a1a1a]">
              <div className="w-4 h-4 rounded-md border-2 border-[#444] shrink-0" />
              <span className="text-[13px] text-[rgba(255,255,255,.7)] font-semibold">{opt}</span>
            </div>
          ))}
        </div>
      )}
      {field.type === 'signature' && (
        <div className="w-full bg-[#1a1a1a] border border-[#2e2e2e] rounded-xl h-[100px] flex items-center justify-center">
          <span className="text-[12px] text-[#444] font-semibold">Draw your signature here</span>
        </div>
      )}
      {field.type === 'video' && (
        <div className="w-full bg-[#1a1a1a] border-2 border-dashed border-[#2e2e2e] rounded-xl py-6 flex flex-col items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          <span className="text-[11px] text-[#444] font-semibold mt-1.5">Upload video</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#000', color: 'rgba(255,255,255,.92)', fontFamily: "'Montserrat', system-ui, sans-serif", lineHeight: 1.55, WebkitFontSmoothing: 'antialiased' }}>
      {/* LOGO BANNER */}
      <div className="flex items-center justify-center py-3 px-4" style={{ background: '#000', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <img src="https://assets.cdn.filesafe.space/Umlo2UnfqbijiGqNU6g2/media/69a0cc399185ff63f8649cd6.png" alt="Hey Jude's Lawn Care" style={{ height: 44 }} />
      </div>

      {/* HERO */}
      <div className="relative text-center overflow-hidden" style={{ padding: '80px 16px 50px', backgroundImage: "url('https://assets.cdn.filesafe.space/Umlo2UnfqbijiGqNU6g2/media/6990a89bc086658638d69137.png')", backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.82) 0%, rgba(0,0,0,.6) 50%, rgba(0,0,0,.85) 100%)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(176,255,3,.12) 0%, transparent 60%)' }} />
        <div className="relative z-10 max-w-[700px] mx-auto">
          <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-[rgba(176,255,3,.06)] border border-[rgba(176,255,3,.25)] text-[11px] font-black uppercase tracking-[.5px] mb-4">
            <svg width="12" height="12" viewBox="0 0 24 24"><path fill="#B0FF03" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            {c.hero.badge}
          </span>
          <h1 className="text-[clamp(22px,4.5vw,42px)] leading-[1.1] font-black tracking-[-0.5px] mb-3 whitespace-pre-line">
            {c.hero.title.split('\n').map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {i > 0 ? <span className="text-[#B0FF03]" style={{ textShadow: '0 0 30px rgba(176,255,3,.35)' }}>{line}</span> : line}
              </span>
            ))}
          </h1>
          {c.hero.subtitle && <p className="text-[15px] font-bold text-[rgba(255,255,255,.65)] max-w-[480px] mx-auto mb-5">{c.hero.subtitle}</p>}
          <span className="inline-flex items-center justify-center h-12 px-7 rounded-2xl bg-[#B0FF03] text-[#111] font-black text-[14px] border border-[rgba(0,0,0,.22)] shadow-[0_0_20px_rgba(176,255,3,.25)]">{c.hero.cta}</span>
          {c.hero.note && <p className="mt-2 text-[11px] font-[750] text-[rgba(255,255,255,.45)]">{c.hero.note}</p>}
        </div>
      </div>

      <div className="max-w-[1020px] mx-auto px-4">
        {/* 1. WHAT YOU GET — lead with what they care about */}
        {c.whatYouGet && (
          <Sec>
            <SH>What You Get</SH>
            <Card feature><Checklist items={c.whatYouGet.items} /></Card>
            <Callout feature>{c.whatYouGet.callout}</Callout>
          </Sec>
        )}

        {/* 2. WHO WE ARE — company + values */}
        {c.whatWeDo && (
          <Sec>
            <SH>Who We Are</SH>
            <SP>{c.whatWeDo.intro}</SP>
            {c.whatWeDo.items?.length > 0 && <Card feature><Checklist items={c.whatWeDo.items} /></Card>}
            {c.coreValues && (
              <div className={c.whatWeDo.items?.length > 0 ? 'mt-5' : 'mt-2'}>
                <p className="text-[14px] font-black text-[rgba(255,255,255,.7)] mb-3">{c.coreValues.intro}</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {c.coreValues.values.map((v, i) => (
                    <div key={i} className="rounded-xl border border-[rgba(176,255,3,.20)] bg-[rgba(176,255,3,.04)] px-2 py-2.5 text-center flex items-center justify-center min-h-[44px]">
                      <span className="text-[11px] sm:text-[12px] font-black text-[rgba(255,255,255,.85)] leading-tight">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {c.whatWeDo.callout && <Callout feature>{c.whatWeDo.callout}</Callout>}
          </Sec>
        )}

        {/* 3. PAY & BENEFITS */}
        <Sec>
          <SH>Pay & Benefits</SH>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
            <Card feature><CardTitle>Compensation</CardTitle><Checklist items={c.payBenefits.compensation} /></Card>
            <Card><CardTitle>Culture</CardTitle><Checklist items={c.payBenefits.scheduleCulture} /></Card>
          </div>
        </Sec>

        {/* 3. WHAT YOU'LL DO + GROWTH — show the path */}
        <Sec>
          <SH>What You'll Do</SH>
          <SP>{c.whatYoullDo.intro}</SP>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
            <Card feature><CardTitle>Daily Work</CardTitle><Checklist items={c.whatYoullDo.dailyWork} /></Card>
            <Card><CardTitle>How You'll Learn</CardTitle><Checklist items={c.whatYoullDo.howYoullLearn} /></Card>
          </div>
        </Sec>

        <Sec>
          <SH>When You Become a Team Lead</SH>
          <SP>{c.teamLead.intro}</SP>
          <Card feature><Checklist items={c.teamLead.items} /></Card>
          <Callout feature>{c.teamLead.callout}</Callout>
        </Sec>

        <Sec>
          <SH>How We Run Jobs</SH>
          <SP>{c.howWeRun.intro}</SP>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-4">
            {c.howWeRun.cards.map((card, i) => (
              <Card key={i}><CardTitle>{card.title}</CardTitle><p className="text-[rgba(255,255,255,.72)] font-[720] text-[14.5px] leading-[1.45]">{card.body}</p></Card>
            ))}
          </div>
        </Sec>

        {/* REQUIREMENTS — filter */}
        <Sec>
          <SH>Requirements</SH>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
            <Card><CardTitle>Must have</CardTitle><Checklist items={c.requirements.mustHave} /></Card>
            <Card feature><CardTitle>Preferred (Not Required)</CardTitle>{c.requirements.preferredNote && <p className="text-[13px] text-[rgba(255,255,255,.55)] font-semibold mb-2">{c.requirements.preferredNote}</p>}<Checklist items={c.requirements.preferred} /></Card>
          </div>
          {c.requirements.callouts.map((text, i) => <Callout key={i} feature={i === 0}>{text}</Callout>)}
        </Sec>

        {/* 6. FIT CHECK */}
        <Sec>
          <SH>Good Fit?</SH>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
            {c.goodFit.map((card, i) => (
              <Card key={i} feature><CardTitle>{card.title}</CardTitle><p className="text-[rgba(255,255,255,.72)] font-[720] text-[14.5px] leading-[1.45]">{card.body}</p></Card>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-3.5">
            {c.notAFit.map((item, i) => <Card key={i}><Checklist items={[item]} neg /></Card>)}
          </div>
          <Callout>{c.notAFitCallout}</Callout>
        </Sec>

        {/* FULL APPLICATION FORM */}
        <Sec>
          <SH>{c.bottomCta.title}</SH>
          <p className="text-[15px] font-bold text-[rgba(255,255,255,.55)] mb-6">{c.bottomCta.subtitle}</p>
          <div className="max-w-lg mx-auto">
            {allSteps.map((step, si) => (
              <div key={step.id} className={si > 0 ? 'mt-10' : ''}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-7 h-7 rounded-full bg-[#B0FF03] text-[#111] flex items-center justify-center text-xs font-black shrink-0">{si + 1}</div>
                  <h3 className="text-[18px] font-black text-white">{step.title}</h3>
                </div>
                <div className="space-y-4">
                  {(step.fields || []).map((field) => (
                    <FormField key={field.id} field={field} />
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-8">
              <span className="inline-flex items-center justify-center w-full h-12 rounded-xl bg-[#B0FF03] text-[#111] font-black text-sm border border-[rgba(0,0,0,.22)]">
                Submit Application
              </span>
            </div>
          </div>
        </Sec>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PAGES INDEX
   ═══════════════════════════════════════════ */
function PagesIndex({ onSelect }) {
  const content = useAppStore((s) => s.hiringContent);
  const applications = useAppStore((s) => s.applications) || [];
  const form = useAppStore((s) => s.applicationForm);
  const newApps = applications.filter((a) => a.status === 'new').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-primary">Hiring</h1>
          <p className="text-sm text-muted mt-0.5">Manage your hiring pages and review applicants.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button onClick={() => onSelect('landscaping-helper')} className="bg-card rounded-2xl border border-border-subtle p-5 text-left hover:border-border-strong hover:shadow-lg transition-all cursor-pointer group">
          <div className="w-full h-40 rounded-xl bg-black overflow-hidden mb-4 relative">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4" style={{ background: 'radial-gradient(circle at 50% 40%, rgba(176,255,3,.10), transparent 70%)' }}>
              <span className="text-[9px] font-black uppercase tracking-wider text-[rgba(255,255,255,.5)] mb-1.5">{content?.hero?.badge}</span>
              <p className="text-sm font-black text-white leading-tight max-w-[240px]">{content?.hero?.title}</p>
              <span className="mt-2 px-3 py-1 rounded-full bg-[#B0FF03] text-[#111] text-[10px] font-black">{content?.hero?.cta}</span>
            </div>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold bg-black/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Eye size={14} /> View Page</span>
            </div>
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-primary text-sm truncate">Landscaping Team Member</h3>
              <p className="text-xs text-muted mt-0.5 flex items-center gap-1.5"><Globe size={12} />heyjudeslawncare.com/grow</p>
            </div>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${form?.settings?.active ? 'bg-green-500/15 text-green-400' : 'bg-surface-alt text-muted'}`}>
              {form?.settings?.active ? 'Active' : 'Paused'}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border-subtle">
            <div className="flex items-center gap-1.5 text-xs text-muted"><Inbox size={13} /><span className="font-semibold">{applications.length}</span> applications</div>
            {newApps > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">{newApps} new</span>}
          </div>
        </button>
        <div className="rounded-2xl border-2 border-dashed border-border-default p-5 flex flex-col items-center justify-center text-center min-h-[280px] opacity-50">
          <Plus size={24} className="text-muted mb-2" /><p className="text-sm font-semibold text-muted">Add Hiring Page</p><p className="text-xs text-muted mt-1">Coming soon</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PAGE DETAIL VIEW
   ═══════════════════════════════════════════ */
const DETAIL_TABS = [
  { id: 'jobpost', label: 'Job Post', icon: Briefcase },
  { id: 'preview', label: 'Preview', icon: Eye },
  { id: 'applications', label: 'Applications', icon: Inbox },
];

function PageDetail({ onBack }) {
  const content = useAppStore((s) => s.hiringContent);
  const form = useAppStore((s) => s.applicationForm);
  const applications = useAppStore((s) => s.applications) || [];
  const [tab, setTab] = useState('jobpost');
  const newApps = applications.filter((a) => a.status === 'new').length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted hover:text-primary transition-colors cursor-pointer"><ChevronLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-primary truncate">Landscaping Team Member</h1>
          <p className="text-xs text-muted flex items-center gap-1.5 mt-0.5"><Globe size={12} /> heyjudeslawncare.com/grow</p>
        </div>
        <a href="https://heyjudeslawncare.com/grow" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs font-semibold text-secondary hover:bg-surface-alt cursor-pointer">
          <ExternalLink size={13} /> Visit Live
        </a>
      </div>

      <div className="flex gap-1 bg-surface-alt rounded-xl p-1 mb-5 overflow-x-auto">
        {DETAIL_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer relative whitespace-nowrap flex-1 min-w-0 ${tab === t.id ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'}`}>
              <Icon size={14} className="shrink-0" />
              <span className="truncate">{t.label}</span>
              {t.id === 'applications' && newApps > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">{newApps}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'preview' && <PreviewTab content={content} form={form} />}
      {tab === 'jobpost' && <JobPostTab />}
      {tab === 'applications' && <ApplicationsTab />}
    </div>
  );
}

/* ─── Preview Tab ─── */
function PreviewTab({ content, form }) {
  const [codeCopied, setCodeCopied] = useState(false);

  const copyPageCode = () => {
    const c = content;
    const ck = '<svg viewBox="0 0 24 24"><path fill="#B0FF03" d="M9.2 16.6 4.9 12.3l1.6-1.6 2.7 2.7 8-8 1.6 1.6z"/></svg>';
    const xk = '<svg viewBox="0 0 24 24"><path fill="rgba(255,100,100,.70)" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    const chk = (items, neg) => items.map(t => '<li><span class="check' + (neg ? ' neg' : '') + '">' + (neg ? xk : ck) + '</span>' + t + '</li>').join('');
    const crd = (inner, feat) => '<div class="card' + (feat ? ' feature' : '') + '">' + inner + '</div>';
    const titleLines = c.hero.title.split('\n');

    const html = `<style>
.hj-page{background:#000;color:rgba(255,255,255,.92);font-family:'Montserrat',system-ui,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased;max-width:1020px;margin:0 auto;padding:0 16px}
.hj-page *{box-sizing:border-box}
.hj-hero{padding:100px 16px 60px;text-align:center;position:relative;overflow:hidden;background:url('https://assets.cdn.filesafe.space/Umlo2UnfqbijiGqNU6g2/media/6990a89bc086658638d69137.png') center/cover no-repeat;width:100vw;margin-left:calc(-50vw + 50%)}
.hj-hero::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.82) 0%,rgba(0,0,0,.6) 50%,rgba(0,0,0,.85) 100%)}
.hj-hero::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:400px;background:radial-gradient(circle,rgba(176,255,3,.12) 0%,transparent 60%);pointer-events:none}
.hj-hero>*{position:relative;z-index:1}
.star-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(176,255,3,.06);border:1px solid rgba(176,255,3,.25);font-weight:900;font-size:11px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:16px}
.star-badge svg{width:12px;height:12px;color:#B0FF03}
.hj-page h1{font-size:clamp(22px,4.5vw,46px);line-height:1.1;margin:0 0 16px;font-weight:900;letter-spacing:-.5px;max-width:700px;margin-left:auto;margin-right:auto}
.hj-page h1 .green{color:#B0FF03;text-shadow:0 0 30px rgba(176,255,3,.35)}
.hj-btn{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;border-radius:16px;height:48px;padding:0 28px;font-weight:900;font-size:14px;border:1px solid rgba(0,0,0,.22);background:#B0FF03;color:#111;box-shadow:0 0 20px rgba(176,255,3,.25)}
.hj-btn:hover{background:#c4ff33}
.hj-sec{padding:56px 0;border-top:1px solid rgba(255,255,255,.08)}
.hj-page h2{margin:0 0 10px;font-size:clamp(22px,4.6vw,34px);line-height:1.1;font-weight:900;letter-spacing:-.3px;color:rgba(255,255,255,.92)}
.hj-page p.intro{margin:0 0 12px;color:rgba(255,255,255,.74);font-weight:720;max-width:78ch}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:16px}
.grid-values{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
.value-chip{display:flex;align-items:center;justify-content:center;min-height:44px}
.card{border-radius:22px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);padding:18px}
.card.feature{border:1px solid rgba(176,255,3,.20);background:radial-gradient(110% 140% at 50% 0%,rgba(176,255,3,.12) 0%,rgba(176,255,3,0) 66%),rgba(255,255,255,.03)}
.card h3{margin:0 0 10px;font-size:16px;font-weight:900;color:rgba(255,255,255,.92)}
.card p{margin:0;color:rgba(255,255,255,.72);font-weight:720;font-size:14.5px;line-height:1.45}
.value-chip{border-radius:14px;border:1px solid rgba(176,255,3,.20);background:rgba(176,255,3,.04);padding:10px 12px;text-align:center;font-size:12px;font-weight:900;color:rgba(255,255,255,.85)}
.checklist{list-style:none;padding:0;margin:0}
.checklist li{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid rgba(255,255,255,.07);color:rgba(255,255,255,.78);font-weight:760;font-size:14.5px;line-height:1.35}
.checklist li:first-child{border-top:none}
.check{width:18px;height:18px;border-radius:6px;background:rgba(176,255,3,.10);border:1px solid rgba(176,255,3,.18);display:grid;place-items:center;margin-top:1px;flex:0 0 auto}
.check svg{width:12px;height:12px}
.check.neg{background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.20)}
.callout{margin-top:14px;padding:12px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.02);font-weight:850;font-size:14.5px;color:rgba(255,255,255,.86)}
.callout.feature{border:1px solid rgba(176,255,3,.20);background:rgba(176,255,3,.06);color:rgba(255,255,255,.92)}
.hj-input{width:100%;background:#1a1a1a;border:1px solid #2e2e2e;border-radius:12px;padding:10px 14px;font-size:16px;color:#fff;font-family:inherit;font-weight:600;outline:none;transition:border-color .2s;-webkit-appearance:none}
.hj-input:focus{border-color:#B0FF03;box-shadow:0 0 0 2px rgba(176,255,3,.15)}
.hj-input::placeholder{color:#555}
textarea.hj-input{min-height:80px;resize:vertical}
select.hj-input{appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}
.hj-radio-group,.hj-check-group{display:flex;flex-direction:column;gap:6px}
.hj-radio-label,.hj-check-label{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;border:1px solid #2e2e2e;background:#1a1a1a;cursor:pointer;font-size:13px;color:rgba(255,255,255,.7);font-weight:600;transition:border-color .2s}
.hj-radio-label:hover,.hj-check-label:hover{border-color:#444}
.hj-radio-label input,.hj-check-label input{accent-color:#B0FF03;width:16px;height:16px;flex-shrink:0}
@media(max-width:720px){.grid-2,.grid-3{grid-template-columns:1fr}.grid-values{grid-template-columns:1fr 1fr 1fr}.hj-btn{width:100%;max-width:520px}}
</style>

<div class="hj-page">
<div style="display:flex;align-items:center;justify-content:center;padding:12px 16px;background:#000;border-bottom:1px solid rgba(255,255,255,.08)">
<img src="https://assets.cdn.filesafe.space/Umlo2UnfqbijiGqNU6g2/media/69a0cc399185ff63f8649cd6.png" alt="Hey Jude's Lawn Care" style="height:44px"/>
</div>
<div class="hj-hero">
<div class="star-badge"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ${c.hero.badge}</div>
<h1>${titleLines[0]}${titleLines[1] ? '<br><span class="green">' + titleLines[1] + '</span>' : ''}</h1>
${c.hero.subtitle ? '<p style="font-size:15px;font-weight:700;color:rgba(255,255,255,.65);max-width:480px;margin:0 auto 20px">' + c.hero.subtitle + '</p>' : ''}
<a class="hj-btn" href="#apply">${c.hero.cta}</a>
</div>

<div class="hj-sec"><h2>What You Get</h2>
${crd('<ul class="checklist">' + chk(c.whatYouGet?.items || []) + '</ul>', true)}
<div class="callout feature">${c.whatYouGet?.callout || ''}</div>
</div>

<div class="hj-sec"><h2>Who We Are</h2>
<p class="intro">${c.whatWeDo?.intro || ''}</p>
<p style="font-size:14px;font-weight:900;color:rgba(255,255,255,.7);margin:20px 0 12px">${c.coreValues?.intro || 'Our Core Values'}</p>
<div class="grid-values">${(c.coreValues?.values || []).map(v => '<div class="value-chip">' + v + '</div>').join('')}</div>
${c.whatWeDo?.callout ? '<div class="callout feature" style="margin-top:14px">' + c.whatWeDo.callout + '</div>' : ''}
</div>

<div class="hj-sec"><h2>Pay &amp; Benefits</h2>
<div class="grid-2">
${crd('<h3>Compensation</h3><ul class="checklist">' + chk(c.payBenefits?.compensation || []) + '</ul>', true)}
${crd('<h3>Culture</h3><ul class="checklist">' + chk(c.payBenefits?.scheduleCulture || []) + '</ul>')}
</div></div>

<div class="hj-sec"><h2>What You'll Do</h2>
<p class="intro">${c.whatYoullDo?.intro || ''}</p>
<div class="grid-2">
${crd('<h3>Daily Work</h3><ul class="checklist">' + chk(c.whatYoullDo?.dailyWork || []) + '</ul>', true)}
${crd("<h3>How You'll Learn</h3><ul class=\"checklist\">" + chk(c.whatYoullDo?.howYoullLearn || []) + '</ul>')}
</div></div>

<div class="hj-sec"><h2>When You Become a Team Lead</h2>
<p class="intro">${c.teamLead?.intro || ''}</p>
${crd('<ul class="checklist">' + chk(c.teamLead?.items || []) + '</ul>', true)}
<div class="callout feature" style="margin-top:14px">${c.teamLead?.callout || ''}</div>
</div>

<div class="hj-sec"><h2>How We Run Jobs</h2>
<p class="intro">${c.howWeRun?.intro || ''}</p>
<div class="grid-3">${(c.howWeRun?.cards || []).map(cd => crd('<h3>' + cd.title + '</h3><p>' + cd.body + '</p>')).join('')}</div>
</div>

<div class="hj-sec"><h2>Requirements</h2>
<div class="grid-2">
${crd('<h3>Must have</h3><ul class="checklist">' + chk(c.requirements?.mustHave || []) + '</ul>')}
${crd('<h3>Preferred (Not Required)</h3><p style="font-size:13px;color:rgba(255,255,255,.55);font-weight:700;margin-bottom:8px">' + (c.requirements?.preferredNote || '') + '</p><ul class="checklist">' + chk(c.requirements?.preferred || []) + '</ul>', true)}
</div>
${(c.requirements?.callouts || []).map((t, i) => '<div class="callout' + (i === 0 ? ' feature' : '') + '" style="margin-top:14px">' + t + '</div>').join('')}
</div>

<div class="hj-sec"><h2>Good Fit?</h2>
<div class="grid-2">${(c.goodFit || []).map(g => crd('<h3>' + g.title + '</h3><p>' + g.body + '</p>', true)).join('')}</div>
<div class="grid-2" style="margin-top:14px">${(c.notAFit || []).map(t => crd('<ul class="checklist">' + chk([t], true) + '</ul>')).join('')}</div>
<div class="callout" style="margin-top:14px">${c.notAFitCallout || ''}</div>
</div>

<div class="hj-sec" id="apply">
<h2>${c.bottomCta?.title || 'Ready to apply?'}</h2>
<p class="intro">${c.bottomCta?.subtitle || ''}</p>
<div id="hj-form-wrap" style="max-width:560px;margin:0 auto">
<form id="hj-apply-form" onsubmit="return hjSubmit(event)">
${(form?.steps || []).map((step, si) => `
<div style="${si > 0 ? 'margin-top:40px' : ''}">
<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
<div style="width:28px;height:28px;border-radius:50%;background:#B0FF03;color:#111;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;flex-shrink:0">${si + 1}</div>
<h3 style="margin:0;font-size:18px;font-weight:900;color:#fff">${step.title}</h3>
</div>
${(step.fields || []).map(f => {
  const lbl = f.label.includes('\n')
    ? '<div style="font-size:13px;color:rgba(255,255,255,.7);white-space:pre-line;margin-bottom:8px;font-weight:600;line-height:1.5">' + f.label + '</div>'
    : '<label style="display:block;font-size:13px;font-weight:700;color:rgba(255,255,255,.8);margin-bottom:6px">' + f.label + (f.required ? ' <span style="color:#f87171">*</span>' : '') + '</label>';
  const desc = f.description ? '<p style="font-size:11px;color:rgba(255,255,255,.4);margin:0 0 6px;font-weight:600">' + f.description + '</p>' : '';
  let input = '';
  const nm = f.id;
  const req = f.required ? ' required' : '';
  const ph = (f.placeholder || '').replace(/'/g, '&#39;');
  if (f.type === 'email') {
    input = "<input type='email' name='" + nm + "' class='hj-input' placeholder='" + ph + "'" + req + "/>";
  } else if (f.type === 'phone') {
    input = "<input type='tel' name='" + nm + "' class='hj-input' placeholder='" + ph + "'" + req + "/>";
  } else if (f.type === 'short' || f.type === 'text') {
    const isDate = f.label.toLowerCase().includes('date') || f.label.toLowerCase().includes('birth');
    input = isDate
      ? "<input type='date' name='" + nm + "' class='hj-input'" + req + "/>"
      : "<input type='text' name='" + nm + "' class='hj-input' placeholder='" + ph + "'" + req + "/>";
  } else if (f.type === 'long') {
    input = "<textarea name='" + nm + "' class='hj-input' placeholder='" + ph + "' rows='3'" + req + "></textarea>";
  } else if (f.type === 'dropdown') {
    input = "<select name='" + nm + "' class='hj-input'" + req + "><option value=''>Select...</option>" + (f.options || []).map(o => "<option value='" + o.replace(/'/g, '&#39;') + "'>" + o + "</option>").join('') + "</select>";
  } else if (f.type === 'radio') {
    input = "<div class='hj-radio-group'>" + (f.options || []).map(o => "<label class='hj-radio-label'><input type='radio' name='" + nm + "' value='" + o.replace(/'/g, '&#39;') + "'" + req + "/>" + o + "</label>").join('') + "</div>";
  } else if (f.type === 'multi' || f.type === 'checkbox') {
    input = "<div class='hj-check-group'>" + (f.options || []).map(o => "<label class='hj-check-label'><input type='checkbox' name='" + nm + "' value='" + o.replace(/'/g, '&#39;') + "'/>" + o + "</label>").join('') + "</div>";
  } else if (f.type === 'signature') {
    input = "<div style='position:relative'><canvas id='sig-canvas' width='500' height='120' style='width:100%;height:120px;background:#1a1a1a;border:1px solid #2e2e2e;border-radius:12px;cursor:crosshair;touch-action:none'></canvas><button type='button' onclick='clearSig()' style='position:absolute;bottom:8px;right:12px;font-size:11px;color:#555;background:none;border:none;cursor:pointer;font-weight:700'>Clear</button><input type='hidden' name='" + nm + "' id='sig-data'/></div>";
  } else if (f.type === 'info') {
    input = '';
  }
  return '<div style="margin-bottom:16px">' + lbl + desc + input + '</div>';
}).join('')}
</div>`).join('')}
<div style="margin-top:32px">
<button type="submit" class="hj-btn" id="hj-submit-btn" style="width:100%;justify-content:center;cursor:pointer">Submit Application</button>
</div>
</form>
</div>
<div id="hj-success" style="display:none;text-align:center;padding:60px 20px">
<div style="width:56px;height:56px;border-radius:50%;background:rgba(176,255,3,.12);border:1px solid rgba(176,255,3,.25);display:flex;align-items:center;justify-content:center;margin:0 auto 16px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B0FF03" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
<p style="font-size:20px;font-weight:900;color:#fff;margin:0 0 8px">Application Received!</p>
<p style="font-size:14px;font-weight:700;color:rgba(255,255,255,.6);margin:0">We received your application. We'll get back to you within 48 hours.</p>
</div>
</div>
</div>

<script>
// Signature pad
var sigCanvas=document.getElementById('sig-canvas'),sigCtx,sigDrawing=false;
if(sigCanvas){
sigCtx=sigCanvas.getContext('2d');
function getPos(e){var r=sigCanvas.getBoundingClientRect(),t=e.touches?e.touches[0]:e;return{x:t.clientX-r.left,y:t.clientY-r.top}}
sigCanvas.addEventListener('mousedown',function(e){sigDrawing=true;sigCtx.beginPath();var p=getPos(e);sigCtx.moveTo(p.x,p.y)});
sigCanvas.addEventListener('mousemove',function(e){if(!sigDrawing)return;var p=getPos(e);sigCtx.lineTo(p.x,p.y);sigCtx.strokeStyle='#e5e5e5';sigCtx.lineWidth=2;sigCtx.lineCap='round';sigCtx.stroke()});
sigCanvas.addEventListener('mouseup',function(){sigDrawing=false;document.getElementById('sig-data').value=sigCanvas.toDataURL()});
sigCanvas.addEventListener('mouseleave',function(){sigDrawing=false});
sigCanvas.addEventListener('touchstart',function(e){e.preventDefault();sigDrawing=true;sigCtx.beginPath();var p=getPos(e);sigCtx.moveTo(p.x,p.y)},{passive:false});
sigCanvas.addEventListener('touchmove',function(e){e.preventDefault();if(!sigDrawing)return;var p=getPos(e);sigCtx.lineTo(p.x,p.y);sigCtx.strokeStyle='#e5e5e5';sigCtx.lineWidth=2;sigCtx.lineCap='round';sigCtx.stroke()},{passive:false});
sigCanvas.addEventListener('touchend',function(){sigDrawing=false;document.getElementById('sig-data').value=sigCanvas.toDataURL()});
}
function clearSig(){if(sigCtx){sigCtx.clearRect(0,0,sigCanvas.width,sigCanvas.height);document.getElementById('sig-data').value=''}}

// Form submission
function hjSubmit(e){
e.preventDefault();
var btn=document.getElementById('hj-submit-btn');
btn.textContent='Submitting...';btn.disabled=true;
var form=document.getElementById('hj-apply-form');
var data={};
var inputs=form.querySelectorAll('input,textarea,select');
inputs.forEach(function(el){
if(el.type==='radio'){if(el.checked)data[el.name]=el.value}
else if(el.type==='checkbox'){if(!data[el.name])data[el.name]=[];if(el.checked)data[el.name].push(el.value)}
else{data[el.name]=el.value}
});
var app={id:crypto.randomUUID(),submittedAt:new Date().toISOString(),status:'new',data:data};
fetch('https://hub.heyjudeslawncare.com/api/webhooks/application',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
.then(function(){
document.getElementById('hj-form-wrap').style.display='none';
document.getElementById('hj-success').style.display='block';
})
.catch(function(){
btn.textContent='Submit Application';btn.disabled=false;
alert('Something went wrong. Please try again.');
});
return false;
}
</script>`;

    navigator.clipboard.writeText(html);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border-subtle overflow-hidden">
        <div className="bg-surface-alt px-4 py-2 border-b border-border-subtle flex items-center gap-2">
          <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" /><div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" /><div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" /></div>
          <div className="flex-1 flex items-center justify-center"><span className="text-[10px] text-muted font-mono bg-card px-3 py-0.5 rounded-md border border-border-subtle">heyjudeslawncare.com/grow</span></div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto" data-preview-content>
          <HiringPagePreview content={content} steps={form?.steps} />
        </div>
      </div>

      {/* Copy Page Code */}
      <button
        onClick={copyPageCode}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand text-on-brand font-bold text-sm hover:bg-brand-hover transition-colors cursor-pointer"
      >
        {codeCopied ? <Check size={16} /> : <Copy size={16} />}
        {codeCopied ? 'Copied to clipboard!' : 'Copy Page Code'}
      </button>

      {/* Application Form Builder */}
      <div className="mt-6">
        <h2 className="text-lg font-black text-primary mb-3 flex items-center gap-2">
          <ClipboardList size={18} /> Application Form
        </h2>
        <FormBuilderTab />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FORM BUILDER
   ═══════════════════════════════════════════ */
function FormBuilderTab() {
  const form = useAppStore((s) => s.applicationForm);
  const setForm = useAppStore((s) => s.setApplicationForm);
  const businessSettings = useAppStore((s) => s.businessSettings);
  const [activeStep, setActiveStep] = useState(0);
  const [showEmbed, setShowEmbed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const steps = form.steps || [];
  const settings = form.settings || {};
  const currentStep = steps[activeStep] || steps[0];
  const fields = currentStep?.fields || [];

  const updateForm = (patch) => setForm({ ...form, ...patch });
  const updateSettings = (patch) => updateForm({ settings: { ...settings, ...patch } });

  const updateSteps = (newSteps) => updateForm({ steps: newSteps });

  const updateCurrentStep = (patch) => {
    const n = [...steps];
    n[activeStep] = { ...n[activeStep], ...patch };
    updateSteps(n);
  };

  const updateField = (fi, field) => {
    const newFields = [...fields];
    newFields[fi] = field;
    updateCurrentStep({ fields: newFields });
  };

  const removeField = (fi) => {
    updateCurrentStep({ fields: fields.filter((_, j) => j !== fi) });
    if (editingField === fi) setEditingField(null);
    else if (editingField > fi) setEditingField(editingField - 1);
  };

  const addField = (type) => {
    const typeDef = FIELD_TYPE_MAP[type];
    const newField = {
      id: genId(),
      label: typeDef?.label || 'New Field',
      type,
      required: false,
      placeholder: '',
      ...(HAS_OPTIONS.has(type) ? { options: ['Option 1', 'Option 2'] } : {}),
    };
    updateCurrentStep({ fields: [...fields, newField] });
    setEditingField(fields.length);
  };

  const addStep = () => {
    const newStep = { id: genId(), title: `Step ${steps.length + 1}`, fields: [] };
    updateSteps([...steps, newStep]);
    setActiveStep(steps.length);
  };

  const removeStep = (si) => {
    if (steps.length <= 1) return;
    updateSteps(steps.filter((_, j) => j !== si));
    if (activeStep >= si && activeStep > 0) setActiveStep(activeStep - 1);
  };

  // Drag reorder
  const handleDragStart = (fi) => setDragIdx(fi);
  const handleDragOver = (e, fi) => { e.preventDefault(); setDragOver(fi); };
  const handleDrop = (fi) => {
    if (dragIdx === null || dragIdx === fi) { setDragIdx(null); setDragOver(null); return; }
    const newFields = [...fields];
    const [moved] = newFields.splice(dragIdx, 1);
    newFields.splice(fi, 0, moved);
    updateCurrentStep({ fields: newFields });
    if (editingField === dragIdx) setEditingField(fi);
    else if (editingField !== null) {
      if (dragIdx < editingField && fi >= editingField) setEditingField(editingField - 1);
      else if (dragIdx > editingField && fi <= editingField) setEditingField(editingField + 1);
    }
    setDragIdx(null);
    setDragOver(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOver(null); };

  const embedCode = `<iframe src="${window.location.origin}/apply" style="width:100%;min-height:700px;border:none;border-radius:12px;" title="Job Application - ${businessSettings?.name || 'Apply'}"></iframe>`;
  const copyEmbed = () => { navigator.clipboard.writeText(embedCode); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={() => updateSettings({ active: !settings.active })} className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          {settings.active ? <ToggleRight size={24} className="text-brand" /> : <ToggleLeft size={24} className="text-muted" />}
          <span className={settings.active ? 'text-brand-text' : 'text-muted'}>{settings.active ? 'Accepting applications' : 'Form disabled'}</span>
        </button>
        <button onClick={() => setShowEmbed(!showEmbed)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs font-semibold text-secondary hover:bg-surface-alt cursor-pointer">
          <Code size={14} /> Embed Code
        </button>
      </div>

      {showEmbed && (
        <div className="bg-surface-alt rounded-xl border border-border-subtle p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-tertiary">Paste this on your website</span>
            <button onClick={copyEmbed} className="flex items-center gap-1.5 text-xs font-semibold text-brand-text cursor-pointer">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied!' : 'Copy'}</button>
          </div>
          <pre className="text-xs text-secondary bg-card rounded-lg p-3 border border-border-subtle overflow-x-auto whitespace-pre-wrap">{embedCode}</pre>
        </div>
      )}

      {/* Form settings */}
      <div className="bg-card rounded-xl border border-border-subtle p-4 space-y-3">
        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Settings</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-tertiary mb-1">Submit Button</label><Input value={settings.submitText || ''} onChange={(v) => updateSettings({ submitText: v })} /></div>
          <div><label className="block text-xs font-semibold text-tertiary mb-1">Success Message</label><Input value={settings.successMessage || ''} onChange={(v) => updateSettings({ successMessage: v })} /></div>
        </div>
      </div>

      {/* Step tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {steps.map((step, si) => (
          <button key={step.id} onClick={() => { setActiveStep(si); setEditingField(null); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer group ${
              si === activeStep ? 'bg-brand text-on-brand' : 'bg-card border border-border-subtle text-secondary hover:bg-surface-alt'
            }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${si === activeStep ? 'bg-on-brand/20 text-on-brand' : 'bg-surface-alt text-muted'}`}>{si + 1}</span>
            {step.title}
            {steps.length > 1 && si === activeStep && (
              <button onClick={(e) => { e.stopPropagation(); removeStep(si); }} className="ml-1 p-0.5 rounded hover:bg-on-brand/20 cursor-pointer"><X size={12} /></button>
            )}
          </button>
        ))}
        <button onClick={addStep} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-dashed border-border-default text-xs font-semibold text-muted hover:text-brand-text hover:border-brand/40 cursor-pointer transition-colors whitespace-nowrap">
          <Plus size={14} /> Step
        </button>
      </div>

      {/* Step title editor */}
      <div className="flex items-center gap-2">
        <input value={currentStep?.title || ''} onChange={(e) => updateCurrentStep({ title: e.target.value })} className="bg-transparent text-lg font-black text-primary focus:outline-none flex-1" placeholder="Step title" />
        <span className="text-xs text-muted font-semibold">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Field type palette */}
      <div className="bg-card rounded-xl border border-border-subtle p-3">
        <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Add a field</p>
        <div className="flex flex-wrap gap-1.5">
          {FIELD_TYPES.map((ft) => {
            const Icon = ft.icon;
            return (
              <button
                key={ft.type}
                onClick={() => addField(ft.type)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all hover:scale-[1.02] hover:shadow-sm active:scale-[0.98] ${ft.bg} ${ft.color}`}
              >
                <Icon size={13} />
                {ft.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fields list */}
      <div className="space-y-1">
        {fields.length === 0 && (
          <div className="py-10 text-center text-sm text-muted">No fields yet. Click a field type above to add one.</div>
        )}
        {fields.map((field, fi) => {
          const typeDef = FIELD_TYPE_MAP[field.type] || FIELD_TYPES[0];
          const Icon = typeDef.icon;
          const isEditing = editingField === fi;
          const isDragTarget = dragOver === fi && dragIdx !== fi;

          return (
            <div
              key={field.id}
              draggable
              onDragStart={() => handleDragStart(fi)}
              onDragOver={(e) => handleDragOver(e, fi)}
              onDrop={() => handleDrop(fi)}
              onDragEnd={handleDragEnd}
              className={`bg-card rounded-xl border overflow-hidden transition-all ${
                isDragTarget ? 'border-brand shadow-lg shadow-brand/10' :
                isEditing ? 'border-border-strong' :
                dragIdx === fi ? 'opacity-40 border-border-subtle' :
                'border-border-subtle hover:border-border-default'
              }`}
            >
              {/* Field header */}
              <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => setEditingField(isEditing ? null : fi)}>
                <div className="cursor-grab active:cursor-grabbing p-0.5 text-muted hover:text-secondary" onClick={(e) => e.stopPropagation()}>
                  <GripVertical size={14} />
                </div>
                <div className={`w-6 h-6 rounded-md flex items-center justify-center ${typeDef.bg} ${typeDef.color}`}>
                  <Icon size={12} />
                </div>
                <span className="flex-1 text-[13px] font-semibold text-primary truncate">{field.label || 'Untitled'}</span>
                {field.required && (
                  <span className="text-[9px] font-bold text-brand-text bg-brand-light px-1.5 py-0.5 rounded">Required</span>
                )}
                <button onClick={(e) => { e.stopPropagation(); removeField(fi); }} className="p-1 text-muted hover:text-red-400 cursor-pointer opacity-0 group-hover:opacity-100">
                  <Trash2 size={13} />
                </button>
                <ChevronDown size={14} className={`text-muted transition-transform ${isEditing ? 'rotate-180' : ''}`} />
              </div>

              {/* Field editor (expanded) */}
              {isEditing && (
                <div className="px-4 pb-4 space-y-3 border-t border-border-subtle pt-3">
                  <div>
                    <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Question</label>
                    <Input value={field.label} onChange={(v) => updateField(fi, { ...field, label: v })} placeholder="Enter your question" />
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Type</label>
                      <div className="flex flex-wrap gap-1">
                        {FIELD_TYPES.map((ft) => {
                          const FtIcon = ft.icon;
                          return (
                            <button
                              key={ft.type}
                              onClick={() => {
                                const patch = { ...field, type: ft.type };
                                if (HAS_OPTIONS.has(ft.type) && !field.options) patch.options = ['Option 1', 'Option 2'];
                                updateField(fi, patch);
                              }}
                              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border cursor-pointer transition-colors ${
                                field.type === ft.type ? `${ft.bg} ${ft.color} border-current` : 'bg-surface-alt text-muted border-transparent hover:border-border-default'
                              }`}
                            >
                              <FtIcon size={10} />{ft.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <button type="button" onClick={() => updateField(fi, { ...field, required: !field.required })} className="cursor-pointer">
                        {field.required ? <ToggleRight size={22} className="text-brand" /> : <ToggleLeft size={22} className="text-muted" />}
                      </button>
                      <span className="text-xs font-semibold text-secondary">Required</span>
                    </label>
                  </div>

                  {!HAS_OPTIONS.has(field.type) && field.type !== 'signature' && field.type !== 'video' && field.type !== 'info' && (
                    <div>
                      <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Placeholder</label>
                      <Input value={field.placeholder || ''} onChange={(v) => updateField(fi, { ...field, placeholder: v })} placeholder="Hint text shown in empty field" />
                    </div>
                  )}

                  {field.type === 'video' && (
                    <div>
                      <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Prompt</label>
                      <Input value={field.placeholder || ''} onChange={(v) => updateField(fi, { ...field, placeholder: v })} placeholder="e.g. Record a 30-second intro video" />
                    </div>
                  )}

                  {HAS_OPTIONS.has(field.type) && (
                    <div>
                      <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Options</label>
                      <div className="space-y-1.5">
                        {(field.options || []).map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-${field.type === 'radio' ? 'full' : 'md'} border border-border-strong shrink-0`} />
                            <input
                              value={opt}
                              onChange={(e) => {
                                const newOpts = [...(field.options || [])];
                                newOpts[oi] = e.target.value;
                                updateField(fi, { ...field, options: newOpts });
                              }}
                              className="flex-1 bg-surface-alt border border-border-default rounded-lg px-2.5 py-1.5 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-brand/40"
                              placeholder={`Option ${oi + 1}`}
                            />
                            <button onClick={() => updateField(fi, { ...field, options: field.options.filter((_, j) => j !== oi) })} className="p-0.5 text-muted hover:text-red-400 cursor-pointer">
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => updateField(fi, { ...field, options: [...(field.options || []), ''] })} className="flex items-center gap-1 text-[11px] font-semibold text-brand-text hover:text-brand-text-strong cursor-pointer pl-6">
                          <Plus size={12} /> Add option
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <button onClick={() => removeField(fi)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-500/10 cursor-pointer">
                      <Trash2 size={12} /> Delete field
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   JOB POST TAB
   ═══════════════════════════════════════════ */
function JobPostTab() {
  const jobPost = useAppStore((s) => s.jobPost);
  const setJobPost = useAppStore((s) => s.setJobPost);
  const [copied, setCopied] = useState(false);

  const jp = jobPost || {};
  const u = (key, val) => setJobPost({ ...jp, [key]: val });

  const copyPost = () => {
    const text = `${jp.title || ''}\n\n${jp.body || ''}`;
    navigator.clipboard.writeText(text.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const useSuggestion = () => {
    u('body', `Hey Jude's Lawn Care is the #1 Google-rated lawn care company in Rock Hill, SC. We've tripled every year since we started and we're actively building new crews.

We're hiring a Landscaping Team Member to join a small, tight-knit crew. This is a part-time role (20-40 hrs/week) starting at $16/hr with room to grow into a Team Lead position with higher pay and responsibility.

WHAT YOU'LL DO:
- Mowing, string-trimming, edging, and blowing
- Bush trimming and small tree cutting
- Weed removal and spraying
- Mulch and pine straw installs
- Following property checklists to ensure quality on every job
- Communicating professionally with clients on-site

WHAT WE'RE LOOKING FOR:
- Physical ability to lift 50lb+ and work outdoors in all weather
- 1+ year landscaping experience (with a company, not just personal)
- Reliable, professional, respectful attitude
- Valid driver's license and reliable transportation to our shop in Rock Hill
- Preferred: Own a reliable truck that can haul a trailer (mileage paid)

WHAT WE OFFER:
- Paid trial day
- Raises based on consistent reliability
- Clear growth path: Team Member to Team Lead
- Small crews. Same people, same standards, same accountability
- Respectful leadership. We treat our team right
- Real training from day one: checklists, walkthrough videos, hands-on coaching
- Medical insurance on the roadmap once we have a full team

We're not about being the fastest or cutting corners. We deliver the best lawn care experience. No missed spots, no confusion for the client, and a perfect customer experience from first contact to finished job. If you care about doing things right and treating people well, you'll fit in here.

No resume needed. Apply at heyjudeslawncare.com/grow

We run background checks. If you have a record, just be upfront about it. Honesty won't disqualify you. Lying will.`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted">Write your job post, then copy it for Indeed, Facebook, Craigslist, etc.</p>
        <button onClick={copyPost} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer transition-colors">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy Post'}
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border-subtle p-5 space-y-4">
        <div>
          <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Job Title</label>
          <Input value={jp.title || ''} onChange={(v) => u('title', v)} placeholder="e.g. Landscaping Team Member" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-bold text-muted uppercase tracking-wider">Post Content</label>
            {!jp.body && (
              <button onClick={useSuggestion} className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-text hover:text-brand-text-strong cursor-pointer">
                <Sparkles size={12} /> Use suggested post
              </button>
            )}
          </div>
          <textarea
            value={jp.body || ''}
            onChange={(e) => u('body', e.target.value)}
            rows={20}
            placeholder="Write your full job post here. Include what the role is, what you're looking for, what you offer, and how to apply."
            className="w-full bg-surface-alt border border-border-default rounded-xl px-4 py-3 text-sm text-primary leading-relaxed placeholder:text-placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand resize-y"
          />
        </div>
      </div>

      {jp.body && (
        <div className="bg-surface-alt rounded-xl border border-border-subtle p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><Sparkles size={16} className="text-brand-text-strong" /></div>
          <div>
            <p className="text-xs font-bold text-primary">Want to improve this?</p>
            <p className="text-xs text-muted mt-0.5">Open Claude Code and say something like:</p>
            <code className="block text-xs bg-card text-secondary rounded-lg px-3 py-2 border border-border-subtle mt-1.5">"Make my job post more compelling and add a section about growth opportunities"</code>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   APPLICATIONS TAB — Screening Pipeline
   ═══════════════════════════════════════════ */
const PIPELINE = [
  { id: 'new', label: 'Screening', color: 'text-blue-400', bg: 'bg-blue-500/15', dot: 'bg-blue-400' },
  { id: 'contacted', label: 'Talk To', color: 'text-amber-400', bg: 'bg-amber-500/15', dot: 'bg-amber-400' },
  { id: 'hired', label: 'Hired', color: 'text-green-400', bg: 'bg-green-500/15', dot: 'bg-green-400' },
  { id: 'rejected', label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/15', dot: 'bg-red-400' },
];

// Auto-score an application based on deal-breakers and preferences
function scoreApplication(data) {
  let score = 0;
  let flags = [];
  let greens = [];

  // Deal-breakers (red flags)
  if (data.fulltime_understand === 'No') flags.push('Doesn\'t want full-time');
  if (data.reliable_transport === 'No') flags.push('No reliable transport');
  if (data.drivers_license === 'No') flags.push('No driver\'s license');
  if (data.physical_ability === 'No') flags.push('Can\'t do physical work');
  if (data.background_check === 'Yes') flags.push('Background check issue');

  // Green flags
  if (data.years_landscaping === '3-5 years' || data.years_landscaping === '5+ years') { greens.push('Experienced'); score += 3; }
  else if (data.years_landscaping === '1-2 years') { greens.push('Some experience'); score += 2; }
  else if (data.years_landscaping === 'Less than 1 year') { score += 1; }

  if (data.worked_landscaping_year === 'Yes') { greens.push('1+ yr at a company'); score += 2; }
  if (data.leadership_exp && data.leadership_exp !== 'None') { greens.push('Leadership exp'); score += 1; }
  if (data.how_long === '1+ years' || data.how_long === 'Long-term / as long as it works') { greens.push('Long-term'); score += 2; }
  if (data.how_long === 'Just trying it out') flags.push('Just trying it out');

  const skills = data.skills || [];
  if (Array.isArray(skills) && skills.length > 3 && !skills.includes('NO EXPERIENCE')) { greens.push(skills.length + ' skills'); score += 1; }
  if (Array.isArray(skills) && skills.includes('NO EXPERIENCE')) flags.push('No experience');

  if (data.tobacco_use === 'Yes' && data.tobacco_policy !== 'Yes') flags.push('Tobacco - won\'t follow policy');

  // Score adjustments for flags
  score -= flags.length * 2;

  return { score: Math.max(0, Math.min(10, score)), flags, greens };
}

const statusColor = (s) => s === 'new' ? 'bg-blue-500/15 text-blue-400' : s === 'contacted' ? 'bg-amber-500/15 text-amber-400' : s === 'hired' ? 'bg-green-500/15 text-green-400' : s === 'rejected' ? 'bg-red-500/15 text-red-400' : 'bg-surface-alt text-muted';

function ApplicationsTab() {
  const applications = useAppStore((s) => s.applications) || [];
  const setApplications = useAppStore((s) => s.setApplications);
  const form = useAppStore((s) => s.applicationForm);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('score');

  const [sending, setSending] = useState(null);

  const SMS_TEMPLATES = {
    contacted: (name) => `Hey ${name?.split(' ')[0] || 'there'}, thanks for applying to Hey Jude's Lawn Care! We'd like to set up a time to talk. When works for you?`,
    hired: (name) => `Hey ${name?.split(' ')[0] || 'there'}, great news! We'd like to bring you on board at Hey Jude's Lawn Care. Let's set up your start date. When can you come in?`,
    rejected: (name) => `Hey ${name?.split(' ')[0] || 'there'}, thanks for your interest in Hey Jude's Lawn Care. After reviewing your application, we've decided to move forward with other candidates. We appreciate your time and wish you the best.`,
  };

  const markStatus = async (id, status) => {
    setApplications(applications.map((a) => a.id === id ? { ...a, status } : a));
    if (selected?.id === id) setSelected((s) => ({ ...s, status }));

    // Send SMS
    const app = applications.find((a) => a.id === id);
    const phone = app?.data?.phone;
    if (phone && SMS_TEMPLATES[status]) {
      setSending(status);
      try {
        await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: phone, message: SMS_TEMPLATES[status](app.data?.name) }),
        });
      } catch {}
      setSending(null);
    }
  };

  const deleteApp = (id) => {
    setApplications(applications.filter((a) => a.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  // Enrich apps with scores
  const enriched = applications.map((app) => ({ ...app, ...scoreApplication(app.data || {}) }));

  // Filter + search
  const searchLower = search.toLowerCase();
  const filtered = enriched.filter((app) => {
    if (filter !== 'all' && (app.status || 'new') !== filter) return false;
    if (search) {
      const d = app.data || {};
      if (![d.name, d.phone, d.email, d.city_zip].filter(Boolean).join(' ').toLowerCase().includes(searchLower)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'score') return b.score - a.score;
    return new Date(b.submittedAt) - new Date(a.submittedAt);
  });

  // Counts
  const counts = { all: applications.length };
  for (const app of applications) counts[app.status || 'new'] = (counts[app.status || 'new'] || 0) + 1;

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox size={40} className="text-muted mb-3" />
        <p className="text-sm font-semibold text-primary mb-1">No applications yet</p>
        <p className="text-xs text-muted max-w-xs">When candidates submit the application form, they'll show up here.</p>
      </div>
    );
  }

  // Score bar color
  const scoreBarColor = (s) => s >= 7 ? 'bg-green-400' : s >= 4 ? 'bg-amber-400' : 'bg-red-400';
  const scoreLabel = (s) => s >= 7 ? 'Strong' : s >= 4 ? 'Maybe' : 'Weak';

  return (
    <div className="space-y-3">
      {/* Pipeline counts */}
      <div className="grid grid-cols-4 gap-2">
        {PIPELINE.map((p) => (
          <button key={p.id} onClick={() => setFilter(filter === p.id ? 'all' : p.id)}
            className={`rounded-xl p-3 text-center cursor-pointer transition-all border ${
              filter === p.id ? 'border-brand bg-brand-light' : 'border-border-subtle bg-card hover:bg-surface-alt'
            }`}>
            <p className={`text-xl font-black ${p.color}`}>{counts[p.id] || 0}</p>
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider">{p.label}</p>
          </button>
        ))}
      </div>

      {/* Search + sort */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, email..."
            className="w-full bg-surface-alt border border-border-default rounded-lg pl-9 pr-3 py-2 text-sm text-primary placeholder:text-placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand/40" />
        </div>
        <button onClick={() => setSortBy(sortBy === 'score' ? 'date' : 'score')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-default text-xs font-semibold text-secondary hover:bg-surface-alt cursor-pointer whitespace-nowrap">
          <ArrowUpDown size={13} /> {sortBy === 'score' ? 'Best fit' : 'Newest'}
        </button>
      </div>

      {/* Detail view */}
      {selected ? (
        <div>
          <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-xs font-semibold text-brand-text hover:text-brand-text-strong mb-3 cursor-pointer"><ChevronLeft size={14} /> Back</button>
          {(() => {
            const { score, flags, greens } = scoreApplication(selected.data || {});
            return (
              <div className="space-y-3">
                {/* Header card */}
                <div className="bg-card rounded-xl border border-border-subtle p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-primary">{selected.data?.name || 'Applicant'}</h3>
                        {selected.data?.dob && (() => { const bd = new Date(selected.data.dob); const age = Math.floor((Date.now() - bd.getTime()) / 31557600000); return age > 0 && age < 100 ? <span className="text-sm font-bold text-muted">Age {age}</span> : null; })()}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted">
                        {selected.data?.phone && <span>{selected.data.phone}</span>}
                        {selected.data?.email && <span>{selected.data.email}</span>}
                        {selected.data?.city_zip && <span>{selected.data.city_zip}</span>}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-black ${score >= 7 ? 'text-green-400' : score >= 4 ? 'text-amber-400' : 'text-red-400'}`}>{score}</div>
                      <div className={`text-[9px] font-bold uppercase ${score >= 7 ? 'text-green-400' : score >= 4 ? 'text-amber-400' : 'text-red-400'}`}>{scoreLabel(score)}</div>
                    </div>
                  </div>

                  {/* Flags */}
                  {(greens.length > 0 || flags.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {greens.map((g, i) => <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">{g}</span>)}
                      {flags.map((f, i) => <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">{f}</span>)}
                    </div>
                  )}

                  <p className="text-[10px] text-muted">Submitted {new Date(selected.submittedAt).toLocaleString()}</p>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-2">
                  <button onClick={() => markStatus(selected.id, 'contacted')} disabled={!!sending} className={`flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${selected.status === 'contacted' ? 'bg-amber-400 text-black' : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'}`}>
                    {sending === 'contacted' ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />} Talk To
                  </button>
                  <button onClick={() => markStatus(selected.id, 'hired')} disabled={!!sending} className={`flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${selected.status === 'hired' ? 'bg-green-400 text-black' : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'}`}>
                    {sending === 'hired' ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />} Hire
                  </button>
                  <button onClick={() => markStatus(selected.id, 'rejected')} disabled={!!sending} className={`flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${selected.status === 'rejected' ? 'bg-red-400 text-black' : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'}`}>
                    {sending === 'rejected' ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />} Reject
                  </button>
                  <button onClick={() => deleteApp(selected.id)} className="px-3 py-2.5 rounded-xl text-xs font-bold text-muted hover:text-red-400 hover:bg-red-500/10 cursor-pointer">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Full application data */}
                <div className="bg-card rounded-xl border border-border-subtle p-4 space-y-4">
                  {(form?.steps || []).map((step) => {
                    const stepFields = (step.fields || []).filter((f) => {
                      const val = selected.data?.[f.id];
                      return val !== undefined && val !== null && val !== '';
                    });
                    if (stepFields.length === 0) return null;
                    return (
                      <div key={step.id}>
                        <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2 pb-1 border-b border-border-subtle">{step.title}</p>
                        <div className="space-y-2">
                          {stepFields.map((f) => {
                            const val = selected.data[f.id];
                            // Highlight red flag answers
                            const isRedFlag = (f.id === 'physical_ability' && val === 'No') || (f.id === 'reliable_transport' && val === 'No') || (f.id === 'drivers_license' && val === 'No') || (f.id === 'fulltime_understand' && val === 'No') || (f.id === 'background_check' && val === 'Yes');
                            const isGreen = (f.id === 'years_landscaping' && (val === '3-5 years' || val === '5+ years')) || (f.id === 'worked_landscaping_year' && val === 'Yes') || (f.id === 'how_long' && (val === '1+ years' || val === 'Long-term / as long as it works'));
                            return (
                              <div key={f.id} className={`rounded-lg px-3 py-2 ${isRedFlag ? 'bg-red-500/8 border border-red-500/20' : isGreen ? 'bg-green-500/8 border border-green-500/20' : ''}`}>
                                <span className="text-[11px] font-semibold text-tertiary">{f.label.includes('\n') ? f.label.split('\n')[0].slice(0, 60) + '...' : f.label}</span>
                                {f.type === 'signature' && val?.startsWith('data:') ? (
                                  <img src={val} alt="Signature" className="mt-1 h-16 bg-surface-alt rounded-lg border border-border-subtle p-2" />
                                ) : (
                                  <p className={`text-sm font-semibold mt-0.5 ${isRedFlag ? 'text-red-400' : isGreen ? 'text-green-400' : 'text-primary'}`}>{Array.isArray(val) ? val.join(', ') : val}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        /* Application cards with scores */
        <div className="space-y-1.5">
          {sorted.length === 0 && <p className="text-sm text-muted text-center py-8">No applications match your filters.</p>}
          {sorted.map((app) => (
            <button key={app.id} onClick={() => setSelected(app)} className="w-full flex items-center gap-3 bg-card rounded-xl border border-border-subtle p-3 hover:bg-surface-alt transition-colors cursor-pointer text-left">
              {/* Score circle */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
                app.score >= 7 ? 'bg-green-500/15 text-green-400' : app.score >= 4 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'
              }`}>{app.score}</div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-primary truncate">{app.data?.name || 'Applicant'}</p>
                  {(app.status || 'new') !== 'new' && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${statusColor(app.status)}`}>{app.status}</span>}
                </div>
                <p className="text-xs text-muted truncate">
                  {app.data?.dob && (() => { const bd = new Date(app.data.dob); const age = Math.floor((Date.now() - bd.getTime()) / 31557600000); return age > 0 && age < 100 ? `Age ${age}` : ''; })()}
                  {app.data?.dob && app.data?.city_zip ? ' | ' : ''}{app.data?.city_zip || ''}
                </p>
                {/* Quick flags */}
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {app.greens.slice(0, 3).map((g, i) => <span key={i} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">{g}</span>)}
                  {app.flags.slice(0, 2).map((f, i) => <span key={i} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">{f}</span>)}
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-[10px] text-muted">{new Date(app.submittedAt).toLocaleDateString()}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════ */
export default function Hiring() {
  const [selectedPage, setSelectedPage] = useState(null);
  if (selectedPage) return <PageDetail onBack={() => setSelectedPage(null)} />;
  return <PagesIndex onSelect={setSelectedPage} />;
}
