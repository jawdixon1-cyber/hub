import { useState, useRef, useCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
  Upload,
  Search,
  ArrowUpDown,
  MessageSquare,
  Loader2,
  Target,
  BookOpen,
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
  { type: 'file',     label: 'File Upload',   icon: Upload,     color: 'text-teal-400',   bg: 'bg-teal-500/10 border-teal-500/20' },
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
const PreviewCheckIcon = () => (
  <span className="w-[20px] h-[20px] rounded-md bg-[#B0FF03] inline-flex items-center justify-center shrink-0 mt-0.5">
    <svg width="13" height="13" viewBox="0 0 24 24"><path fill="#111" d="M9.2 16.6 4.9 12.3l1.6-1.6 2.7 2.7 8-8 1.6 1.6z"/></svg>
  </span>
);
const PreviewXIcon = () => (
  <span className="w-[18px] h-[18px] rounded-md bg-[rgba(255,80,80,.08)] border border-[rgba(255,80,80,.20)] inline-flex items-center justify-center shrink-0 mt-0.5">
    <svg width="12" height="12" viewBox="0 0 24 24"><path fill="rgba(255,100,100,.70)" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
  </span>
);
const PreviewChecklist = ({ items, neg }) => (
  <ul className="space-y-0">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2.5 items-start py-2.5 border-t border-[rgba(255,255,255,.07)] first:border-0 text-[rgba(255,255,255,.78)] font-[760] text-[14.5px] leading-[1.35]">
        {neg ? <PreviewXIcon /> : <PreviewCheckIcon />}
        <span>{item}</span>
      </li>
    ))}
  </ul>
);
const PreviewCard = ({ children }) => (
  <div className="rounded-[22px] p-[18px] overflow-hidden border-2 border-[#B0FF03] bg-[rgba(176,255,3,.06)]">
    {children}
  </div>
);
const PreviewCardTitle = ({ children }) => (
  <h3 className="text-[16px] font-black tracking-[.2px] text-[rgba(255,255,255,.92)] mb-2.5">{children}</h3>
);
const PreviewCallout = ({ children, feature }) => (
  <div className={`mt-3.5 px-3.5 py-3 rounded-2xl font-[850] text-[14.5px] ${
    feature
      ? 'border border-[rgba(176,255,3,.20)] bg-[rgba(176,255,3,.06)] text-[rgba(255,255,255,.92)]'
      : 'border border-[rgba(255,255,255,.10)] bg-[rgba(255,255,255,.02)] text-[rgba(255,255,255,.86)]'
  }`}>
    {children}
  </div>
);
const PreviewSH = ({ children }) => (
  <h2 className="text-[clamp(24px,4.6vw,32px)] leading-[1.1] font-black tracking-[-0.3px] text-white mb-2.5">{children}</h2>
);
const PreviewSP = ({ children }) => (
  <p className="text-[rgba(255,255,255,.74)] font-[720] mb-3 max-w-[78ch]">{children}</p>
);
const PreviewSec = ({ children }) => (
  <div className="py-12 border-t border-[rgba(255,255,255,.08)]">{children}</div>
);

export function HiringPagePreview({ content, steps, hideApplySection = false }) {
  const [previewValues, setPreviewValues] = useState({});
  const setPreviewValue = (id, v) => setPreviewValues((p) => ({ ...p, [id]: v }));
  const togglePreviewMulti = (id, opt) => setPreviewValues((p) => {
    const cur = p[id] || [];
    return { ...p, [id]: cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt] };
  });
  const isPreviewVisible = (field) => {
    if (!field.showIf) return true;
    return previewValues[field.showIf.field] === field.showIf.equals;
  };
  const c = content;

  const Checklist = PreviewChecklist;
  const Card = PreviewCard;
  const CardTitle = PreviewCardTitle;
  const Callout = PreviewCallout;
  const SH = PreviewSH;
  const SP = PreviewSP;
  const Sec = PreviewSec;

  const allSteps = steps || [];

  const groupHalfWidth = (fields = []) => {
    const rows = [];
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const next = fields[i + 1];
      if (f.halfWidth && next?.halfWidth) {
        rows.push([f, next]);
        i++;
      } else {
        rows.push([f]);
      }
    }
    return rows;
  };

  // Render a single field in the preview style (interactive)
  const renderField = (field) => {
    const val = previewValues[field.id];
    return (
    <div key={field.id}>
      {field.type === 'info' && !field.label.includes('\n') ? (
        <h3 className="text-[15px] font-black text-white mt-2 mb-1">{field.label}</h3>
      ) : field.label.includes('\n') ? (
        <div className="text-[13px] text-[rgba(255,255,255,.7)] mb-2 whitespace-pre-line leading-relaxed font-semibold">{field.label}</div>
      ) : (
        <label className="block text-[13px] font-semibold text-[rgba(255,255,255,.8)] mb-1.5">
          {field.label} {field.required && <span className="text-red-400">*</span>}
        </label>
      )}
      {field.description && <p className="text-[11px] text-[rgba(255,255,255,.4)] mb-1.5 font-semibold">{field.description}</p>}
      {(field.type === 'short' || field.type === 'text' || field.type === 'email' || field.type === 'phone') && (
        <input
          type="text"
          value={val || ''}
          onChange={(e) => setPreviewValue(field.id, e.target.value)}
          placeholder={field.placeholder}
          className="w-full bg-[#1a1a1a] border border-[#2e2e2e] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#B0FF03]"
        />
      )}
      {(field.type === 'long') && (
        <textarea
          value={val || ''}
          onChange={(e) => setPreviewValue(field.id, e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="w-full bg-[#1a1a1a] border border-[#2e2e2e] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#B0FF03]"
        />
      )}
      {field.type === 'dropdown' && (
        <select
          value={val || ''}
          onChange={(e) => setPreviewValue(field.id, e.target.value)}
          className="w-full bg-[#1a1a1a] border border-[#2e2e2e] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#B0FF03]"
        >
          <option value="">Select...</option>
          {(field.options || []).map((o, i) => <option key={i} value={o}>{o}</option>)}
        </select>
      )}
      {field.type === 'radio' && (
        <div className={(field.options || []).length === 2 ? 'grid grid-cols-2 gap-2' : 'space-y-1.5'}>
          {(field.options || []).map((opt, i) => {
            const selected = val === opt;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPreviewValue(field.id, opt)}
                className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl border text-left transition-colors ${selected ? 'border-[#B0FF03] bg-[rgba(176,255,3,.06)]' : 'border-[#2e2e2e] bg-[#1a1a1a] hover:border-[#444]'}`}
              >
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? 'border-[#B0FF03]' : 'border-[#444]'}`}>
                  {selected && <div className="w-2 h-2 rounded-full bg-[#B0FF03]" />}
                </div>
                <span className={`text-[13px] font-semibold ${selected ? 'text-white' : 'text-[rgba(255,255,255,.7)]'}`}>{opt}</span>
              </button>
            );
          })}
        </div>
      )}
      {(field.type === 'multi' || field.type === 'checkbox') && (
        <div className="space-y-1.5">
          {(field.options || []).map((opt, i) => {
            const checked = Array.isArray(val) && val.includes(opt);
            return (
              <button
                key={i}
                type="button"
                onClick={() => togglePreviewMulti(field.id, opt)}
                className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl border text-left transition-colors ${checked ? 'border-[#B0FF03] bg-[rgba(176,255,3,.06)]' : 'border-[#2e2e2e] bg-[#1a1a1a] hover:border-[#444]'}`}
              >
                <div className={`w-4 h-4 rounded-md border-2 shrink-0 flex items-center justify-center ${checked ? 'border-[#B0FF03] bg-[#B0FF03]' : 'border-[#444]'}`}>
                  {checked && <svg width="10" height="10" viewBox="0 0 24 24"><path fill="#111" d="M9.2 16.6 4.9 12.3l1.6-1.6 2.7 2.7 8-8 1.6 1.6z"/></svg>}
                </div>
                <span className={`text-[13px] font-semibold ${checked ? 'text-white' : 'text-[rgba(255,255,255,.7)]'}`}>{opt}</span>
              </button>
            );
          })}
        </div>
      )}
      {field.type === 'file' && (
        <div className="w-full bg-[#1a1a1a] border-2 border-dashed border-[#2e2e2e] rounded-xl py-5 flex flex-col items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span className="text-[11px] text-[#555] font-semibold mt-1.5">Tap to upload a file</span>
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
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#000', color: 'rgba(255,255,255,.92)', fontFamily: "'Montserrat', system-ui, sans-serif", lineHeight: 1.55, WebkitFontSmoothing: 'antialiased' }}>
      {/* LOGO BANNER */}
      <div className="flex items-center justify-center py-3 px-4" style={{ background: '#000', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <img src="https://assets.cdn.filesafe.space/Umlo2UnfqbijiGqNU6g2/media/69a0cc399185ff63f8649cd6.png" alt="Hey Jude's Lawn Care" style={{ height: 44 }} />
      </div>

      {/* HERO */}
      <div className="relative text-center overflow-hidden" style={{ padding: '60px 16px 70px', backgroundImage: "url('https://assets.cdn.filesafe.space/Umlo2UnfqbijiGqNU6g2/media/69a769bab869781ecca8ec56.png')", backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.78) 0%, rgba(0,0,0,.45) 45%, rgba(0,0,0,.92) 100%)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 45%, rgba(176,255,3,.20) 0%, transparent 65%)' }} />
        <div className="relative z-10 max-w-[720px] mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.07] border border-white/[0.12] backdrop-blur mb-5">
            <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map(s => <svg key={s} width="10" height="10" viewBox="0 0 24 24"><path fill="#FBBC05" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>)}
            </div>
            <span className="text-[11px] font-black text-white">5.0</span>
            <span className="text-[10px] font-bold text-[rgba(255,255,255,.55)]">· 150+ reviews · Rock Hill</span>
          </div>
          <h1 className="leading-[0.95] font-black tracking-[-0.035em] mb-4">
            {(() => {
              const parts = c.hero.title.split('\n');
              return <>
                <span className="block text-[clamp(18px,4.8vw,42px)] text-white mb-1.5">{parts[0]}</span>
                {parts[1] && (
                  <span className="block text-[clamp(26px,7.5vw,64px)] uppercase text-[#B0FF03]" style={{ textShadow: '0 0 40px rgba(176,255,3,.55), 0 0 80px rgba(176,255,3,.25)' }}>{parts[1]}</span>
                )}
              </>;
            })()}
          </h1>
          {c.hero.subtitle && (
            <p className="text-[clamp(18px,5.2vw,26px)] font-black italic text-white mb-6" style={{ textShadow: '0 2px 20px rgba(0,0,0,.6)' }}>{c.hero.subtitle.split('\n').map((line, i) => <span key={i}>{i > 0 && <br />}{line}</span>)}</p>
          )}
          <a href="#apply" className="inline-flex items-center justify-center h-14 px-10 rounded-2xl bg-[#B0FF03] text-[#111] font-black text-[16px] border border-[rgba(0,0,0,.22)] shadow-[0_0_40px_rgba(176,255,3,.55),0_10px_30px_rgba(0,0,0,.4)] tracking-wide no-underline">{c.hero.cta} →</a>
          {c.hero.note && <p className="mt-3 text-[11px] font-[750] text-[rgba(255,255,255,.45)]">{c.hero.note}</p>}
        </div>
      </div>

      <div className="max-w-[1020px] mx-auto px-4">
        {/* 1. WHAT YOU GET — lead with what they care about */}
        {c.whatYouGet && (
          <Sec>
            <SH>What You Get</SH>
            <Checklist items={c.whatYouGet.items} />
            {c.whatYouGet.callout && <p className="text-[15px] font-black mt-4" style={{ color: '#B0FF03' }}>{c.whatYouGet.callout}</p>}
          </Sec>
        )}

        {/* 2. WHO WE ARE — company + values */}
        {c.whatWeDo && (
          <Sec>
            <SH>Culture</SH>
            <SP>{c.whatWeDo.intro.split('\n').map((line, i) => <span key={i}>{i > 0 && <br />}{line}</span>)}</SP>
            {c.whatWeDo.items?.length > 0 && <Card feature><Checklist items={c.whatWeDo.items} /></Card>}
            {c.coreValues && (
              <div className={c.whatWeDo.items?.length > 0 ? 'mt-5' : 'mt-2'}>
                <p className="text-[14px] font-black text-[rgba(255,255,255,.7)] mb-3">{c.coreValues.intro}</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {c.coreValues.values.map((v, i) => (
                    <div key={i} className="rounded-xl border border-[#B0FF03] bg-[rgba(176,255,3,.10)] px-2 py-2.5 text-center flex items-center justify-center min-h-[44px]">
                      <span className="text-[11px] sm:text-[12px] font-black text-[rgba(255,255,255,.85)] leading-tight">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {c.whatWeDo.detail && <p className="text-[14px] font-bold text-[rgba(255,255,255,.65)] leading-[1.65] mt-4">{c.whatWeDo.detail}</p>}
            {c.whatWeDo.callout && <p className="text-[clamp(16px,3.5vw,18px)] font-black italic mt-5" style={{ color: '#B0FF03', textShadow: '0 0 20px rgba(176,255,3,.25)' }}>{c.whatWeDo.callout}</p>}
          </Sec>
        )}

        {/* 3. PAY */}
        {c.payProgression && (
          <Sec>
            <SH>Pay</SH>
            <div className="flex flex-col sm:flex-row items-stretch gap-0 mt-4">
              {/* Starting Pay */}
              <div className="flex-1 rounded-xl bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] p-5 text-center">
                <p className="text-[10px] font-bold text-[rgba(255,255,255,.4)] uppercase tracking-wider">{c.payProgression.start.label}</p>
                <p className="text-3xl font-black text-[rgba(255,255,255,.7)] mt-2">{c.payProgression.start.amount}</p>
                <p className="text-[11px] text-[rgba(255,255,255,.35)] mt-1">{c.payProgression.start.note}</p>
              </div>
              {/* Arrow */}
              <div className="flex items-center justify-center px-2 py-2 sm:py-0">
                <span className="text-2xl text-[rgba(255,255,255,.2)] rotate-90 sm:rotate-0">→</span>
              </div>
              {/* Raises */}
              <div className="flex-[1.15] rounded-xl bg-[rgba(176,255,3,.04)] border border-[rgba(176,255,3,.15)] p-5 text-center">
                <p className="text-[11px] font-bold text-[rgba(176,255,3,.6)] uppercase tracking-wider">{c.payProgression.raises.label}</p>
                <p className="text-[14px] font-bold text-[rgba(255,255,255,.8)] mt-3 leading-relaxed">{c.payProgression.raises.note}</p>
              </div>
              {/* Arrow */}
              <div className="flex items-center justify-center px-2 py-2 sm:py-0">
                <span className="text-2xl text-[rgba(176,255,3,.3)] rotate-90 sm:rotate-0">→</span>
              </div>
              {/* Team Lead */}
              <div className="flex-[1.2] rounded-xl bg-[rgba(176,255,3,.08)] border border-[rgba(176,255,3,.3)] p-6 text-center shadow-[0_0_30px_rgba(176,255,3,.08)]">
                <p className="text-[12px] font-black text-[#B0FF03] uppercase tracking-wider">{c.payProgression.lead.label}</p>
                {c.payProgression.lead.amount && <p className="text-3xl font-black text-white mt-2">{c.payProgression.lead.amount}</p>}
                <p className="text-[13px] font-bold text-[rgba(255,255,255,.8)] mt-2 leading-relaxed">{c.payProgression.lead.note}</p>
              </div>
            </div>
          </Sec>
        )}

        {/* 3. WHAT YOU'LL DO — Team Member → Team Lead */}
        <Sec>
          <SH>What You'll Do</SH>
          <SP>{c.whatYoullDo.intro}</SP>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
            <Card feature>
              <CardTitle>Team Member</CardTitle>
              <Checklist items={[...c.whatYoullDo.dailyWork, ...c.whatYoullDo.howYoullLearn]} />
            </Card>
            <Card>
              <CardTitle>Team Lead</CardTitle>
              <p className="text-[12px] font-bold text-[rgba(255,255,255,.45)] mb-2 italic">Everything a team member does, plus:</p>
              <Checklist items={c.teamLead.items} />
            </Card>
          </div>
          {c.teamLead.callout && <p className="text-[15px] font-black mt-4" style={{ color: '#B0FF03' }}>{c.teamLead.callout}</p>}
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

        {/* 6. FIT CHECK */}
        {c.goodFit?.length > 0 && (
          <Sec>
            <SH>Good Fit?</SH>
            <Card feature><Checklist items={c.goodFit} /></Card>
          </Sec>
        )}

        {/* REQUIREMENTS — filter */}
        <Sec>
          <SH>Requirements</SH>
          <Card><Checklist items={c.requirements.mustHave} /></Card>
          {c.requirements.callouts.map((text, i) => <Callout key={i} feature={i === 0}>{text}</Callout>)}
        </Sec>

        {/* FULL APPLICATION FORM */}
        {!hideApplySection && <div data-apply-section>
        <div className="py-14 border-t border-[rgba(255,255,255,.08)] text-center relative">
          <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(176,255,3,.5), transparent)' }} />
          <p className="text-[11px] font-black text-[#B0FF03] uppercase tracking-[0.3em] mb-3">The next step</p>
          <h2 className="text-[clamp(32px,8vw,52px)] leading-[0.95] font-black tracking-[-0.03em] text-white mb-3" style={{ textShadow: '0 2px 30px rgba(0,0,0,.5)' }}>{c.bottomCta.title}</h2>
          <p className="text-[clamp(14px,3.8vw,16px)] font-bold text-[rgba(255,255,255,.6)] mb-10 max-w-[420px] mx-auto px-4">{c.bottomCta.subtitle}</p>
          <div className="max-w-lg mx-auto text-left px-4">
            {allSteps.map((step, si) => (
              <div key={step.id} className={si > 0 ? 'mt-10' : ''}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-7 h-7 rounded-full bg-[#B0FF03] text-[#111] flex items-center justify-center text-xs font-black shrink-0">{si + 1}</div>
                  <h3 className="text-[18px] font-black text-white">{step.title}</h3>
                </div>
                <div className="space-y-4">
                  {groupHalfWidth((step.fields || []).filter(isPreviewVisible)).map((row, ri) => (
                    row.length === 2 ? (
                      <div key={ri} className="grid grid-cols-2 gap-3">
                        {row.map((field) => renderField(field))}
                      </div>
                    ) : (
                      renderField(row[0])
                    )
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-8">
              <span className="inline-flex items-center justify-center w-full h-14 rounded-2xl bg-[#B0FF03] text-[#111] font-black text-[15px] border border-[rgba(0,0,0,.22)] shadow-[0_0_40px_rgba(176,255,3,.45),0_10px_30px_rgba(0,0,0,.3)] tracking-wide">
                Submit Application →
              </span>
            </div>
          </div>
        </div>
        </div>}
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
function PageDetail() {
  return <ApplicationsTab />;
}

/* ─── Preview Tab ─── */
function PreviewTab({ content, form }) {
  const [codeCopied, setCodeCopied] = useState(false);

  const getHiringHtml = () => {
    const c = content;
    const ck = '<svg viewBox="0 0 24 24"><path fill="#B0FF03" d="M9.2 16.6 4.9 12.3l1.6-1.6 2.7 2.7 8-8 1.6 1.6z"/></svg>';
    const xk = '<svg viewBox="0 0 24 24"><path fill="rgba(255,100,100,.70)" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    const chk = (items, neg) => items.map(t => '<li><span class="check' + (neg ? ' neg' : '') + '">' + (neg ? xk : ck) + '</span>' + t + '</li>').join('');
    const crd = (inner, feat) => '<div class="card' + (feat ? ' feature' : '') + '">' + inner + '</div>';
    const titleLines = c.hero.title.split('\n');

    const html = `<style>
.hj-page{background:#000;color:rgba(255,255,255,.92);font-family:'Montserrat',system-ui,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased;max-width:1020px;margin:0 auto;padding:0 16px}
.hj-page *{box-sizing:border-box}
.hj-hero{padding:100px 16px 60px;text-align:center;position:relative;overflow:hidden;background:url('https://assets.cdn.filesafe.space/Umlo2UnfqbijiGqNU6g2/media/69a769bab869781ecca8ec56.png') center/cover no-repeat;width:100vw;margin-left:calc(-50vw + 50%)}
.hj-hero::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.82) 0%,rgba(0,0,0,.6) 50%,rgba(0,0,0,.85) 100%)}
.hj-hero::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:400px;background:radial-gradient(circle,rgba(176,255,3,.12) 0%,transparent 60%);pointer-events:none}
.hj-hero>*{position:relative;z-index:1}
.star-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(176,255,3,.06);border:1px solid rgba(176,255,3,.25);font-weight:900;font-size:11px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:16px}
.star-badge svg{width:12px;height:12px;color:#B0FF03}
.hj-page h1{font-size:clamp(19px,4.5vw,46px);line-height:1.1;margin:0 0 16px;font-weight:900;letter-spacing:-.5px;max-width:700px;margin-left:auto;margin-right:auto}
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
.hj-radio-group-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pay-progression{display:flex;flex-direction:row;align-items:stretch;gap:0;margin-top:16px;flex-wrap:nowrap}
.pay-card{flex:1;border-radius:12px;padding:20px;text-align:center;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04)}
.pay-card-raises{flex:1.15;border:1px solid rgba(176,255,3,.15);background:rgba(176,255,3,.04)}
.pay-card-lead{flex:1.2;border:1px solid rgba(176,255,3,.3);background:rgba(176,255,3,.08);box-shadow:0 0 30px rgba(176,255,3,.08);padding:24px 20px}
.pay-label{font-size:10px;font-weight:900;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.1em;margin:0}
.pay-label-accent{font-size:11px;color:rgba(176,255,3,.6)}
.pay-label-lead{font-size:12px;color:#B0FF03}
.pay-amount{font-size:30px;font-weight:900;color:rgba(255,255,255,.7);margin:8px 0 4px;line-height:1}
.pay-amount-lead{color:#fff}
.pay-note{font-size:11px;color:rgba(255,255,255,.35);margin:0}
.pay-note-body{font-size:13px;font-weight:700;color:rgba(255,255,255,.8);margin:10px 0 0;line-height:1.5}
.pay-arrow{display:flex;align-items:center;justify-content:center;padding:0 8px;font-size:22px;color:rgba(255,255,255,.2)}
.pay-arrow-accent{color:rgba(176,255,3,.3)}
@media(max-width:720px){.pay-progression{flex-direction:column}.pay-arrow{padding:8px 0;transform:rotate(90deg)}}
.hj-apply-sec{padding:56px 16px;text-align:center;position:relative}
.hj-apply-divider{position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(176,255,3,.5),transparent)}
.hj-apply-kicker{font-size:11px;font-weight:900;color:#B0FF03;text-transform:uppercase;letter-spacing:0.3em;margin:0 0 12px}
.hj-apply-title{font-size:clamp(32px,8vw,52px);line-height:0.95;font-weight:900;letter-spacing:-0.03em;color:#fff;margin:0 0 12px;text-shadow:0 2px 30px rgba(0,0,0,.5)}
.hj-apply-subtitle{font-size:clamp(14px,3.8vw,16px);font-weight:700;color:rgba(255,255,255,.6);margin:0 auto 40px;max-width:420px;padding:0 16px}
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
${c.hero.badge ? '<div class="star-badge"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ' + c.hero.badge + '</div>' : ''}
<h1>${titleLines[0]}${titleLines[1] ? '<br><span class="green">' + titleLines[1] + '</span>' : ''}</h1>
${(() => {
  if (!c.hero.subtitle) return '';
  const lines = c.hero.subtitle.split('\n');
  const textLines = lines.filter(l => !l.includes('stars across'));
  const googleLine = lines.find(l => l.includes('stars across'));
  const text = textLines.length ? '<p style="font-size:15px;font-weight:700;color:rgba(255,255,255,.65);max-width:480px;margin:0 auto 16px">' + textLines.map(l => l).join('<br>') + '</p>' : '';
  const pill = googleLine ? '<div style="display:inline-flex;align-items:center;gap:10px;padding:10px 16px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);margin-bottom:20px;backdrop-filter:blur(8px)"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg><div style="display:flex;gap:2px">' + [1,2,3,4,5].map(() => '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="#FBBC05" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>').join('') + '</div><span style="font-size:12px;font-weight:900;color:#fff">5.0</span><span style="font-size:11px;font-weight:700;color:rgba(255,255,255,.5)">150+ reviews · #1 in Rock Hill</span></div><br>' : '';
  return text + pill;
})()}
<a class="hj-btn" href="#apply">${c.hero.cta}</a>
${c.hero.note ? '<p style="margin-top:8px;font-size:11px;font-weight:750;color:rgba(255,255,255,.45)">' + c.hero.note + '</p>' : ''}
</div>

<div class="hj-sec"><h2>What You Get</h2>
${crd('<ul class="checklist">' + chk(c.whatYouGet?.items || []) + '</ul>', true)}
<div class="callout feature">${c.whatYouGet?.callout || ''}</div>
</div>

<div class="hj-sec"><h2>Culture</h2>
<p class="intro">${c.whatWeDo?.intro?.replace(/\n/g, '<br>') || ''}</p>
<p style="font-size:14px;font-weight:900;color:rgba(255,255,255,.7);margin:20px 0 12px">${c.coreValues?.intro || 'Our Core Values'}</p>
<div class="grid-values">${(c.coreValues?.values || []).map(v => '<div class="value-chip">' + v + '</div>').join('')}</div>
${c.whatWeDo?.detail ? '<p style="font-size:14px;font-weight:700;color:rgba(255,255,255,.65);line-height:1.65;margin-top:16px">' + c.whatWeDo.detail + '</p>' : ''}
${c.whatWeDo?.callout ? '<div class="callout feature" style="margin-top:14px">' + c.whatWeDo.callout + '</div>' : ''}
</div>

${c.payProgression ? `<div class="hj-sec"><h2>Pay</h2>
<div class="pay-progression">
  <div class="pay-card pay-card-start">
    <p class="pay-label">${c.payProgression.start?.label || 'Starting Pay'}</p>
    <p class="pay-amount">${c.payProgression.start?.amount || ''}</p>
    ${c.payProgression.start?.note ? '<p class="pay-note">' + c.payProgression.start.note + '</p>' : ''}
  </div>
  <div class="pay-arrow">→</div>
  <div class="pay-card pay-card-raises">
    <p class="pay-label pay-label-accent">${c.payProgression.raises?.label || 'Raises'}</p>
    ${c.payProgression.raises?.note ? '<p class="pay-note-body">' + c.payProgression.raises.note + '</p>' : ''}
  </div>
  <div class="pay-arrow pay-arrow-accent">→</div>
  <div class="pay-card pay-card-lead">
    <p class="pay-label pay-label-lead">${c.payProgression.lead?.label || 'Team Lead'}</p>
    ${c.payProgression.lead?.amount ? '<p class="pay-amount pay-amount-lead">' + c.payProgression.lead.amount + '</p>' : ''}
    ${c.payProgression.lead?.note ? '<p class="pay-note-body">' + c.payProgression.lead.note + '</p>' : ''}
  </div>
</div></div>` : ''}

<div class="hj-sec"><h2>What You'll Do</h2>
<p class="intro">${c.whatYoullDo?.intro || ''}</p>
<div class="grid-2">
${crd('<h3>Team Member</h3><ul class="checklist">' + chk([...(c.whatYoullDo?.dailyWork || []), ...(c.whatYoullDo?.howYoullLearn || [])]) + '</ul>', true)}
${crd('<h3>Team Lead</h3><p style="font-size:12px;font-weight:700;color:rgba(255,255,255,.45);margin-bottom:8px;font-style:italic">Everything a team member does, plus:</p><ul class="checklist">' + chk(c.teamLead?.items || []) + '</ul>')}
</div>
${c.teamLead?.callout ? '<p style="font-size:15px;font-weight:900;color:#B0FF03;margin-top:14px">' + c.teamLead.callout + '</p>' : ''}
</div>

<div class="hj-sec"><h2>How We Run Jobs</h2>
<p class="intro">${c.howWeRun?.intro || ''}</p>
<div class="grid-3">${(c.howWeRun?.cards || []).map(cd => crd('<h3>' + cd.title + '</h3><p>' + cd.body + '</p>')).join('')}</div>
</div>

<div class="hj-sec"><h2>Good Fit?</h2>
${crd('<ul class="checklist">' + chk(c.goodFit || []) + '</ul>', true)}
</div>

<div class="hj-sec"><h2>Requirements</h2>
${crd('<ul class="checklist">' + chk(c.requirements?.mustHave || []) + '</ul>')}
${(c.requirements?.callouts || []).map((t, i) => '<div class="callout' + (i === 0 ? ' feature' : '') + '" style="margin-top:14px">' + t + '</div>').join('')}
</div>

<div class="hj-sec hj-apply-sec" id="apply">
<div class="hj-apply-divider"></div>
<p class="hj-apply-kicker">The next step</p>
<h2 class="hj-apply-title">${c.bottomCta?.title || 'Ready to apply?'}</h2>
<p class="hj-apply-subtitle">${c.bottomCta?.subtitle || ''}</p>
<div id="hj-form-wrap" style="max-width:520px;margin:0 auto;text-align:left">
<form id="hj-apply-form" novalidate onsubmit="return hjSubmit(event)">
${(form?.steps || []).map((step, si) => `
<div style="${si > 0 ? 'margin-top:40px' : ''}">
<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
<div style="width:28px;height:28px;border-radius:50%;background:#B0FF03;color:#111;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;flex-shrink:0">${si + 1}</div>
<h3 style="margin:0;font-size:18px;font-weight:900;color:#fff">${step.title}</h3>
</div>
${(() => {
  const renderField = (f) => {
    const lbl = (f.type === 'info' && !f.label.includes('\n'))
      ? '<h3 style="font-size:15px;font-weight:900;color:#fff;margin:8px 0 4px">' + f.label + '</h3>'
      : f.label.includes('\n')
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
      const cls = (f.options || []).length === 2 ? 'hj-radio-group hj-radio-group-2' : 'hj-radio-group';
      input = "<div class='" + cls + "'>" + (f.options || []).map(o => "<label class='hj-radio-label'><input type='radio' name='" + nm + "' value='" + o.replace(/'/g, '&#39;') + "'" + req + "/>" + o + "</label>").join('') + "</div>";
    } else if (f.type === 'multi' || f.type === 'checkbox') {
      input = "<div class='hj-check-group'>" + (f.options || []).map(o => "<label class='hj-check-label'><input type='checkbox' name='" + nm + "' value='" + o.replace(/'/g, '&#39;') + "'/>" + o + "</label>").join('') + "</div>";
    } else if (f.type === 'signature') {
      input = "<div style='position:relative'><canvas id='sig-canvas' width='500' height='120' style='width:100%;height:120px;background:#1a1a1a;border:1px solid #2e2e2e;border-radius:12px;cursor:crosshair;touch-action:none'></canvas><button type='button' onclick='clearSig()' style='position:absolute;bottom:8px;right:12px;font-size:11px;color:#555;background:none;border:none;cursor:pointer;font-weight:700'>Clear</button><input type='hidden' name='" + nm + "' id='sig-data'/></div>";
    } else if (f.type === 'file') {
      const accept = (f.accept || '.pdf,.doc,.docx,.jpg,.jpeg,.png').replace(/'/g, '&#39;');
      input = "<label class='hj-file-label' data-field='" + nm + "' style='display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;border:2px dashed #2e2e2e;border-radius:12px;background:#1a1a1a;cursor:pointer'><svg width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='#555' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='17 8 12 3 7 8'/><line x1='12' y1='3' x2='12' y2='15'/></svg><span id='hj-file-label-" + nm + "' style='font-size:12px;color:#888;font-weight:700;margin-top:8px'>Tap to upload a file</span><input type='file' name='" + nm + "' accept='" + accept + "' class='hj-file-input' data-field='" + nm + "' style='position:absolute;width:1px;height:1px;opacity:0'" + req + "/></label><input type='hidden' name='" + nm + "_url' class='hj-file-url'/>";
    } else if (f.type === 'info') {
      input = '';
    }
    return lbl + desc + input;
  };
  const fields = step.fields || [];
  const condAttrs = (f) => f.showIf
    ? ' data-show-if="' + f.showIf.field + '" data-show-if-equals="' + (f.showIf.equals + '').replace(/"/g, '&quot;') + '" style="display:none;margin-bottom:16px"'
    : ' style="margin-bottom:16px"';
  const out = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const next = fields[i + 1];
    if (f.halfWidth && next?.halfWidth) {
      out.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px"><div' + (f.showIf ? ' data-show-if="' + f.showIf.field + '" data-show-if-equals="' + (f.showIf.equals + '').replace(/"/g, '&quot;') + '" style="display:none"' : '') + '>' + renderField(f) + '</div><div' + (next.showIf ? ' data-show-if="' + next.showIf.field + '" data-show-if-equals="' + (next.showIf.equals + '').replace(/"/g, '&quot;') + '" style="display:none"' : '') + '>' + renderField(next) + '</div></div>');
      i++;
    } else {
      out.push('<div' + condAttrs(f) + '>' + renderField(f) + '</div>');
    }
  }
  return out.join('');
})()}
</div>`).join('')}
<div style="margin-top:32px">
<button type="submit" class="hj-btn" id="hj-submit-btn" style="width:100%;height:56px;border-radius:16px;justify-content:center;cursor:pointer;font-size:15px;letter-spacing:0.03em;box-shadow:0 0 40px rgba(176,255,3,.45),0 10px 30px rgba(0,0,0,.3)">Submit Application →</button>
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

// File upload → Supabase Storage
var HJ_SB_URL=${JSON.stringify(import.meta.env.VITE_SUPABASE_URL || '')};
var HJ_SB_KEY=${JSON.stringify(import.meta.env.VITE_SUPABASE_ANON_KEY || '')};
fetch('https://hub.heyjudeslawncare.com/api/messaging?action=ensure-bucket&name=resumes').catch(function(){});
var hjFilePromises={};
(function(){
  var loaded=false;
  function ensureSdk(cb){
    if(loaded){cb();return;}
    var s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.onload=function(){loaded=true;cb();};
    document.head.appendChild(s);
  }
  var inputs=document.querySelectorAll('.hj-file-input');
  inputs.forEach(function(inp){
    inp.addEventListener('change',function(e){
      var f=e.target.files&&e.target.files[0];if(!f)return;
      var fid=inp.getAttribute('data-field');
      var lab=document.getElementById('hj-file-label-'+fid);
      var urlField=inp.parentNode.parentNode.querySelector('input[name="'+fid+'_url"]');
      if(f.size>10*1024*1024){if(lab)lab.textContent='File too large (max 10 MB)';return;}
      if(lab)lab.textContent='Uploading '+f.name+'…';
      hjFilePromises[fid]=new Promise(function(resolve,reject){
        ensureSdk(function(){
          fetch('https://hub.heyjudeslawncare.com/api/messaging?action=get-upload-url&bucket=resumes&filename='+encodeURIComponent(f.name))
            .then(function(r){return r.json();})
            .then(function(info){
              if(!info||!info.token||!info.path){throw new Error('bad signed url');}
              var client=window.supabase.createClient(HJ_SB_URL,HJ_SB_KEY);
              client.storage.from('resumes').uploadToSignedUrl(info.path,info.token,f).then(function(r){
                if(r.error){if(lab)lab.textContent='Upload failed. Try again.';reject(r.error);return;}
                if(urlField)urlField.value=info.publicUrl;
                if(lab)lab.textContent=f.name+' ✓';
                resolve(info.publicUrl);
              }).catch(function(err){if(lab)lab.textContent='Upload failed. Try again.';reject(err);});
            })
            .catch(function(err){if(lab)lab.textContent='Upload failed. Try again.';reject(err);});
        });
      });
    });
  });
})();

// Conditional visibility
(function(){
  var form=document.getElementById('hj-apply-form');
  if(!form)return;
  var conds=form.querySelectorAll('[data-show-if]');
  function isWrapVisible(el){return el.style.display!=='none'}
  function currentValue(name){
    var els=form.querySelectorAll('[name="'+name+'"]');
    for(var i=0;i<els.length;i++){
      var el=els[i];
      if(el.type==='radio'){if(el.checked)return el.value}
      else if(el.type==='checkbox'){}
      else{return el.value}
    }
    return '';
  }
  function findWrapFor(el){
    var n=el;
    while(n&&n!==form){if(n.hasAttribute&&n.hasAttribute('data-show-if'))return n;n=n.parentNode;}
    return null;
  }
  function reevaluate(){
    // Iterate multiple passes for chained conditions
    for(var pass=0;pass<4;pass++){
      conds.forEach(function(wrap){
        var dep=wrap.getAttribute('data-show-if');
        var want=wrap.getAttribute('data-show-if-equals');
        var depEls=form.querySelectorAll('[name="'+dep+'"]');
        // if dep field is itself hidden, hide this one too
        var depHidden=false;
        for(var i=0;i<depEls.length;i++){
          var w=findWrapFor(depEls[i]);
          if(w&&w.style.display==='none'){depHidden=true;break;}
        }
        var show=!depHidden&&currentValue(dep)===want;
        wrap.style.display=show?'':'none';
        if(!show){
          // clear values in hidden fields
          wrap.querySelectorAll('input,textarea,select').forEach(function(el){
            if(el.type==='radio'||el.type==='checkbox')el.checked=false;
            else el.value='';
          });
        }
      });
    }
  }
  form.addEventListener('change',reevaluate);
  form.addEventListener('input',reevaluate);
  reevaluate();
})();

// Form submission
function hjSubmit(e){
e.preventDefault();
var btn=document.getElementById('hj-submit-btn');
btn.textContent='Submitting...';btn.disabled=true;
var form=document.getElementById('hj-apply-form');
// skip hidden conditional fields for data and required check
var hiddenWraps=form.querySelectorAll('[data-show-if]');
hiddenWraps.forEach(function(w){
  if(w.style.display==='none'){
    w.querySelectorAll('[required]').forEach(function(el){el.removeAttribute('required');el.setAttribute('data-was-required','1')});
  }
});
if(!form.checkValidity()){form.reportValidity();btn.textContent='Submit Application';btn.disabled=false;return false;}
Promise.all(Object.values(hjFilePromises||{})).then(function(){
var data={};
var inputs=form.querySelectorAll('input,textarea,select');
inputs.forEach(function(el){
var wrap=el.closest('[data-show-if]');
if(wrap&&wrap.style.display==='none')return;
if(el.type==='file')return;
if(el.classList&&el.classList.contains('hj-file-url')){
  var fid=el.name.replace(/_url$/,'');
  if(el.value)data[fid]=el.value;
  return;
}
if(el.type==='radio'){if(el.checked)data[el.name]=el.value}
else if(el.type==='checkbox'){if(!data[el.name])data[el.name]=[];if(el.checked)data[el.name].push(el.value)}
else{data[el.name]=el.value}
});
var app={id:crypto.randomUUID(),submittedAt:new Date().toISOString(),status:'new',data:data};
fetch('https://hub.heyjudeslawncare.com/api/messaging?action=application',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
.then(function(){
document.getElementById('hj-form-wrap').style.display='none';
document.getElementById('hj-success').style.display='block';
})
.catch(function(){
btn.textContent='Submit Application';btn.disabled=false;
alert('Something went wrong. Please try again.');
});
}).catch(function(){
btn.textContent='Submit Application';btn.disabled=false;
alert('File upload failed. Please try again.');
});
return false;
}
</script>`;

    return html;
  };

  const copyPageCode = () => {
    const previewMarkup = renderToStaticMarkup(
      <HiringPagePreview content={content} steps={form?.steps} />
    );

    const staticHtml = getHiringHtml();
    const styleMatch = staticHtml.match(/<style>[\s\S]*?<\/style>/);
    const styleBlock = styleMatch ? styleMatch[0] : '';
    const applyStart = staticHtml.indexOf('id="apply"');
    const adjustedStart = applyStart >= 0 ? staticHtml.lastIndexOf('<div', applyStart) : -1;
    const applyPlusScript = adjustedStart >= 0 ? staticHtml.slice(adjustedStart) : '';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = previewMarkup;
    const applyNode = wrapper.querySelector('[data-apply-section]');
    if (applyNode) applyNode.remove();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hey Jude's Lawn Care — Hiring</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
${styleBlock}
<style>
html,body{margin:0;padding:0;background:#000;color:rgba(255,255,255,.92);font-family:'Montserrat',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
</style>
</head>
<body>
<div style="background:#000;min-height:100vh">
${wrapper.innerHTML}
</div>
${applyPlusScript}
</body>
</html>`;

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
                    <label className="flex items-center gap-2 cursor-pointer">
                      <button type="button" onClick={() => updateField(fi, { ...field, halfWidth: !field.halfWidth })} className="cursor-pointer">
                        {field.halfWidth ? <ToggleRight size={22} className="text-brand" /> : <ToggleLeft size={22} className="text-muted" />}
                      </button>
                      <span className="text-xs font-semibold text-secondary">Half width (pairs with next half-width field)</span>
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
  { id: 'new', label: 'Applied', color: 'text-blue-400', bg: 'bg-blue-500/15', dot: 'bg-blue-400' },
  { id: 'contacted', label: 'Phone Screen', color: 'text-amber-400', bg: 'bg-amber-500/15', dot: 'bg-amber-400' },
  { id: 'onboarding', label: 'Trial Scheduled', color: 'text-cyan-400', bg: 'bg-cyan-500/15', dot: 'bg-cyan-400' },
  { id: 'trial_day', label: 'Trial Day', color: 'text-purple-400', bg: 'bg-purple-500/15', dot: 'bg-purple-400' },
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

  if (data.tobacco_use === 'Yes') { flags.push('Uses nicotine'); score -= 2; }
  if (data.tobacco_use === 'Yes' && data.tobacco_policy !== 'Yes') flags.push('Won\'t follow substance policy');

  // Score adjustments for flags
  score -= flags.length * 2;

  return { score: Math.max(0, Math.min(10, score)), flags, greens };
}

const statusColor = (s) => s === 'new' ? 'bg-blue-500/15 text-blue-400' : s === 'contacted' ? 'bg-amber-500/15 text-amber-400' : s === 'onboarding' ? 'bg-cyan-500/15 text-cyan-400' : s === 'trial_day' ? 'bg-purple-500/15 text-purple-400' : s === 'hired' ? 'bg-green-500/15 text-green-400' : s === 'rejected' ? 'bg-red-500/15 text-red-400' : 'bg-surface-alt text-muted';

function ApplicationsTab() {
  const applications = useAppStore((s) => s.applications) || [];
  const setApplications = useAppStore((s) => s.setApplications);
  const form = useAppStore((s) => s.applicationForm);
  const phoneScreenQuestions = useAppStore((s) => s.phoneScreenQuestions) || [];
  const setPhoneScreenQuestions = useAppStore((s) => s.setPhoneScreenQuestions);
  const onboardingSteps = useAppStore((s) => s.onboardingSteps) || [];
  const setOnboardingSteps = useAppStore((s) => s.setOnboardingSteps);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('new');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [editingQuestions, setEditingQuestions] = useState(false);
  const [editingOnboarding, setEditingOnboarding] = useState(false);

  const [sending, setSending] = useState(null);

  const saveAnswer = (qid, value) => {
    setApplications(applications.map((a) => a.id === selected.id
      ? { ...a, phoneScreen: { ...(a.phoneScreen || {}), [qid]: value } }
      : a));
    setSelected((s) => ({ ...s, phoneScreen: { ...(s.phoneScreen || {}), [qid]: value } }));
  };

  const toggleOnboardingStep = (stepId) => {
    const current = selected.onboarding?.[stepId];
    const next = current?.done
      ? { done: false, completedAt: null }
      : { done: true, completedAt: new Date().toISOString() };
    setApplications(applications.map((a) => a.id === selected.id
      ? { ...a, onboarding: { ...(a.onboarding || {}), [stepId]: next } }
      : a));
    setSelected((s) => ({ ...s, onboarding: { ...(s.onboarding || {}), [stepId]: next } }));
  };

  const setOnboardingNote = (stepId, note) => {
    const current = selected.onboarding?.[stepId] || {};
    const next = { ...current, note };
    setApplications(applications.map((a) => a.id === selected.id
      ? { ...a, onboarding: { ...(a.onboarding || {}), [stepId]: next } }
      : a));
    setSelected((s) => ({ ...s, onboarding: { ...(s.onboarding || {}), [stepId]: next } }));
  };

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
        await fetch('/api/messaging?action=send', {
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

  const scoreColor = (s) => s >= 7 ? '#22c55e' : s >= 4 ? '#f59e0b' : '#ef4444';
  const scoreTone = (s) => s >= 7 ? 'text-green-400' : s >= 4 ? 'text-amber-400' : 'text-red-400';
  const fullName = (d) => d?.name || [d?.first_name, d?.last_name].filter(Boolean).join(' ') || 'Applicant';
  const location = (d) => d?.city_zip || [d?.city, d?.zip].filter(Boolean).join(', ') || '';
  const fmtPhone = (v) => {
    if (!v) return '';
    const digits = String(v).replace(/\D/g, '');
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length === 11 && digits.startsWith('1')) return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    return v;
  };
  const isImageUrl = (v) => typeof v === 'string' && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(v);
  const isPdfUrl = (v) => typeof v === 'string' && /\.pdf(\?|$)/i.test(v);
  const isHttpUrl = (v) => typeof v === 'string' && /^https?:\/\//.test(v);

  const parseEndDate = (raw) => {
    if (!raw) return null;
    const str = String(raw).trim();
    if (!str) return null;
    if (/\b(present|currently|current|now|ongoing|till\s*now|til\s*now|still\s*work(ing)?|still\s*there|still\s*employed)\b/i.test(str)) return 'present';
    const MONTHS = { jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11 };
    const now = Date.now();
    const currentYear = new Date().getFullYear();
    const candidates = [];
    let m;
    // "Month [day,] year" — e.g. "March 2024", "Mar 15, 2024", "March 15 2024"
    const mYearRe = /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?(\d{4}|\d{2})\b/gi;
    while ((m = mYearRe.exec(str)) !== null) {
      const mon = MONTHS[m[1].toLowerCase()];
      const day = m[2] ? parseInt(m[2]) : 15;
      let yr = parseInt(m[3]);
      if (yr < 100) yr += 2000;
      if (yr < 1990 || yr > currentYear + 1) continue;
      const d = new Date(yr, mon, day);
      if (d.getTime() <= now) candidates.push(d);
    }
    // "MM/DD/YYYY" or "M/D/YY"
    const dmySlashRe = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
    const used = new Set();
    while ((m = dmySlashRe.exec(str)) !== null) {
      used.add(m.index);
      const mon = parseInt(m[1]) - 1;
      const day = parseInt(m[2]);
      let yr = parseInt(m[3]);
      if (yr < 100) yr += 2000;
      if (mon < 0 || mon > 11 || yr < 1990 || yr > currentYear + 1) continue;
      const d = new Date(yr, mon, day);
      if (d.getTime() <= now) candidates.push(d);
    }
    // "MM/YYYY" or "M/YY" (month-year only, not part of M/D/Y)
    const mySlashRe = /\b(\d{1,2})\/(\d{2,4})\b/g;
    while ((m = mySlashRe.exec(str)) !== null) {
      if (used.has(m.index)) continue;
      const mon = parseInt(m[1]) - 1;
      let yr = parseInt(m[2]);
      if (yr < 100) yr += 2000;
      if (mon < 0 || mon > 11 || yr < 1990 || yr > currentYear + 1) continue;
      const d = new Date(yr, mon, 15);
      if (d.getTime() <= now) candidates.push(d);
    }
    // ISO-like "YYYY-MM-DD" or "YYYY/MM"
    const isoRe = /\b(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?\b/g;
    while ((m = isoRe.exec(str)) !== null) {
      const yr = parseInt(m[1]);
      const mon = parseInt(m[2]) - 1;
      const day = m[3] ? parseInt(m[3]) : 15;
      if (mon < 0 || mon > 11 || yr < 1990 || yr > currentYear + 1) continue;
      const d = new Date(yr, mon, day);
      if (d.getTime() <= now) candidates.push(d);
    }
    // Bare 4-digit year
    const yearRe = /\b(19[9]\d|20\d{2})\b/g;
    while ((m = yearRe.exec(str)) !== null) {
      const yr = parseInt(m[1]);
      if (yr > currentYear + 1) continue;
      const d = new Date(yr, 11, 15);
      if (d.getTime() <= now) candidates.push(d);
    }
    if (candidates.length === 0) return null;
    return new Date(Math.max(...candidates.map((d) => d.getTime())));
  };

  const formatLookingDuration = (endDate) => {
    if (!endDate) return null;
    if (endDate === 'present') return 'still working there';
    const now = new Date();
    const days = Math.floor((now - endDate) / 86400000);
    if (days < 0) return null;
    if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
    if (days < 60) { const w = Math.floor(days / 7); return `${w} week${w === 1 ? '' : 's'}`; }
    if (days < 365) { const mo = Math.floor(days / 30); return `${mo} month${mo === 1 ? '' : 's'}`; }
    const yrs = Math.floor(days / 365);
    const rem = Math.floor((days - yrs * 365) / 30);
    return rem === 0 ? `${yrs} year${yrs === 1 ? '' : 's'}` : `${yrs} year${yrs === 1 ? '' : 's'}, ${rem} month${rem === 1 ? '' : 's'}`;
  };

  return (
    <div className="space-y-4">
      {/* Pipeline segmented tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-alt">
        {PIPELINE.map((p) => (
          <button
            key={p.id}
            onClick={() => setFilter(p.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filter === p.id ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'
            }`}
          >
            <span>{p.label}</span>
            <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black ${filter === p.id ? p.bg + ' ' + p.color : 'bg-surface-strong text-muted'}`}>{counts[p.id] || 0}</span>
          </button>
        ))}
      </div>

      {!selected && (
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full bg-surface-alt rounded-xl pl-9 pr-3 py-2.5 text-sm text-primary placeholder:text-placeholder-muted focus:outline-none focus:bg-card focus:ring-1 focus:ring-border-default"
            />
          </div>
          <div className="relative">
            <ArrowUpDown size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none pl-8 pr-8 py-2.5 rounded-xl bg-surface-alt text-xs font-semibold text-secondary hover:bg-surface-strong cursor-pointer focus:outline-none"
            >
              <option value="date">Newest</option>
              <option value="score">Best fit</option>
            </select>
          </div>
          <a
            href="https://employers.indeed.com/messages?threadType=highQualityMarketplace"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-surface-alt text-xs font-semibold text-secondary hover:bg-surface-strong cursor-pointer whitespace-nowrap"
          >
            <ExternalLink size={13} />
            Indeed Messages
          </a>
        </div>
      )}

      {selected ? (
        <div>
          <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-primary mb-4 cursor-pointer">
            <ChevronLeft size={16} /> Applicants
          </button>
          {(() => {
            const { score, flags, greens } = scoreApplication(selected.data || {});
            const d = selected.data || {};
            const age = d.dob ? (() => { const bd = new Date(d.dob); const a = Math.floor((Date.now() - bd.getTime()) / 31557600000); return a > 0 && a < 100 ? a : null; })() : null;

            return (
              <div className="space-y-5">
                {/* Hero header */}
                <div className="flex items-center gap-5">
                  <div
                    className="relative w-20 h-20 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `conic-gradient(${scoreColor(score)} ${score * 36}deg, var(--color-surface-alt) 0)` }}
                  >
                    <div className="absolute inset-1.5 rounded-full bg-card flex flex-col items-center justify-center">
                      <span className={`text-2xl font-black leading-none ${scoreTone(score)}`}>{score}</span>
                      <span className="text-[8px] font-bold text-muted uppercase tracking-wider mt-0.5">/10</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-black text-primary leading-tight">{fullName(d)}</h2>
                      {age && <span className="text-sm font-semibold text-muted">{age}</span>}
                      {(selected.status || 'new') !== 'new' && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(selected.status)}`}>{PIPELINE.find(p => p.id === selected.status)?.label || selected.status}</span>}
                    </div>
                    <p className="text-xs text-muted mt-1">{new Date(selected.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                  </div>
                </div>

                {/* Contact quick-row */}
                {(d.phone || d.email || location(d)) && (
                  <div className="flex flex-wrap gap-2">
                    {d.phone && <a href={`tel:${d.phone}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-alt text-xs font-semibold text-primary hover:bg-surface-strong"><Phone size={11} />{fmtPhone(d.phone)}</a>}
                    {d.email && <a href={`mailto:${d.email}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-alt text-xs font-semibold text-primary hover:bg-surface-strong"><Mail size={11} />{d.email}</a>}
                    {location(d) && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-alt text-xs font-semibold text-muted">{location(d)}</span>}
                    <a href="https://publicindex.sccourts.org/york/publicindex/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-400 hover:bg-amber-500/15">
                      <ExternalLink size={11} /> Check record (York County)
                    </a>
                  </div>
                )}

                {/* Flags row */}
                {(greens.length > 0 || flags.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {greens.map((g, i) => <span key={'g' + i} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-500/10 text-green-400">{g}</span>)}
                    {flags.map((f, i) => <span key={'f' + i} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-500/10 text-red-400">{f}</span>)}
                  </div>
                )}

                {/* Actions — pipeline stage buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <button onClick={() => markStatus(selected.id, 'contacted')} disabled={!!sending} className={`py-3 rounded-xl text-[12px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${selected.status === 'contacted' ? 'bg-amber-400 text-black' : 'bg-amber-500/12 text-amber-400 hover:bg-amber-500/20'}`}>
                    {sending === 'contacted' ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />} Phone Screen
                  </button>
                  <button onClick={() => markStatus(selected.id, 'onboarding')} disabled={!!sending} className={`py-3 rounded-xl text-[12px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${selected.status === 'onboarding' ? 'bg-cyan-400 text-black' : 'bg-cyan-500/12 text-cyan-400 hover:bg-cyan-500/20'}`}>
                    {sending === 'onboarding' ? <Loader2 size={13} className="animate-spin" /> : <ClipboardList size={13} />} Schedule Trial
                  </button>
                  <button onClick={() => markStatus(selected.id, 'trial_day')} disabled={!!sending} className={`py-3 rounded-xl text-[12px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${selected.status === 'trial_day' ? 'bg-purple-400 text-black' : 'bg-purple-500/12 text-purple-400 hover:bg-purple-500/20'}`}>
                    {sending === 'trial_day' ? <Loader2 size={13} className="animate-spin" /> : <Target size={13} />} Trial Day
                  </button>
                  <button onClick={() => markStatus(selected.id, 'hired')} disabled={!!sending} className={`py-3 rounded-xl text-[12px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${selected.status === 'hired' ? 'bg-green-400 text-black' : 'bg-green-500/12 text-green-400 hover:bg-green-500/20'}`}>
                    {sending === 'hired' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Hire
                  </button>
                  <button onClick={() => markStatus(selected.id, 'rejected')} disabled={!!sending} className={`py-3 rounded-xl text-[12px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${selected.status === 'rejected' ? 'bg-red-400 text-black' : 'bg-red-500/12 text-red-400 hover:bg-red-500/20'}`}>
                    {sending === 'rejected' ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Reject
                  </button>
                </div>

                {/* Answers — all questions in form order with N/A for unanswered */}
                {(() => {
                  const humanize = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                  const knownIds = new Set();
                  (form?.steps || []).forEach((s) => (s.fields || []).forEach((f) => knownIds.add(f.id)));
                  const extraKeys = Object.keys(selected.data || {}).filter((k) => !knownIds.has(k));
                  let qNum = 0;
                  const renderAnswer = (f, k, val, labelOverride) => {
                    const label = labelOverride || (f ? (f.label.includes('\n') ? f.label.split('\n')[0].slice(0, 80) : f.label) : humanize(k));
                    const hasVal = val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
                    const isRedFlag = hasVal && ((k === 'physical_ability' && val === 'No') || (k === 'drivers_license' && val === 'No') || (k === 'fulltime_understand' && val === 'No') || (k === 'background_check' && val === 'Yes') || (k === 'tobacco_use' && val === 'Yes') || (k === 'tobacco_policy' && val === 'No') || (k === 'injuries' && val === 'Yes'));
                    const isGreen = hasVal && ((k === 'years_landscaping' && (val === '3-5 years' || val === '5+ years')) || (k === 'landscaping_experience' && val === 'Yes') || (k === 'leadership_exp' && val === 'Yes') || (k === 'how_long' && (val === '1+ years' || val === 'Long-term / as long as it works')));
                    let displayVal = Array.isArray(val) ? val.join(', ') : (val == null ? '' : String(val));
                    if (f?.type === 'phone' || /phone/i.test(k)) {
                      const digits = displayVal.replace(/\D/g, '');
                      if (digits.length === 10) displayVal = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
                      else if (digits.length === 11 && digits.startsWith('1')) displayVal = `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
                    }
                    qNum += 1;
                    return (
                      <div key={k} className="py-3 flex items-start gap-3">
                        <span className="text-[10px] font-black text-muted shrink-0 w-5 pt-1 tabular-nums">{qNum}.</span>
                        <span className="text-xs text-muted shrink-0 w-[36%] pt-0.5">{label}</span>
                        <div className="flex-1 min-w-0">
                          {!hasVal ? (
                            <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-alt text-muted italic">N/A</span>
                          ) : f?.type === 'signature' && typeof val === 'string' && val.startsWith('data:') ? (
                            <img src={val} alt="Signature" className="h-16 bg-surface-alt rounded-lg p-2" />
                          ) : f?.type === 'file' || isImageUrl(val) || (isHttpUrl(val) && /resume|id|upload/i.test(k)) ? (
                            <div className="space-y-2">
                              {isImageUrl(val) ? (
                                <a href={val} target="_blank" rel="noopener noreferrer">
                                  <img src={val} alt={label} className="max-h-80 w-auto rounded-lg border border-border-subtle" />
                                </a>
                              ) : isPdfUrl(val) ? (
                                <iframe src={val} title={label} className="w-full h-80 rounded-lg border border-border-subtle bg-white" />
                              ) : (
                                <iframe src={`https://docs.google.com/viewer?url=${encodeURIComponent(val)}&embedded=true`} title={label} className="w-full h-80 rounded-lg border border-border-subtle bg-white" />
                              )}
                              <a href={val} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted hover:text-primary">
                                <ExternalLink size={11} /> Open in new tab
                              </a>
                            </div>
                          ) : isHttpUrl(val) ? (
                            <a href={val} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-alt text-xs font-semibold text-primary hover:bg-surface-strong">
                              <FileText size={12} /> Open link <ExternalLink size={10} />
                            </a>
                          ) : (
                            <p className={`text-sm font-semibold break-words whitespace-pre-wrap ${isRedFlag ? 'text-red-400' : isGreen ? 'text-green-400' : 'text-primary'}`}>{displayVal}</p>
                          )}
                        </div>
                      </div>
                    );
                  };
                  return (
                    <div className="space-y-5">
                      {(form?.steps || []).map((step) => {
                        const fields = (step.fields || []).filter((f) => f.type !== 'info');
                        if (fields.length === 0) return null;
                        return (
                          <div key={step.id}>
                            <p className="text-[10px] font-black text-muted uppercase tracking-[0.15em] mb-2">{step.title}</p>
                            <div className="divide-y divide-border-subtle">
                              {fields.map((f) => renderAnswer(f, f.id, selected.data?.[f.id]))}
                            </div>
                          </div>
                        );
                      })}
                      {extraKeys.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-muted uppercase tracking-[0.15em] mb-2">Other Answers</p>
                          <div className="divide-y divide-border-subtle">
                            {extraKeys.map((k) => renderAnswer(null, k, selected.data[k]))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Trial Agreement — show at Trial Scheduled + Trial Day */}
                {(selected.status === 'onboarding' || selected.status === 'trial_day') && (
                  <TrialAgreementPanel
                    applicant={selected}
                    onUpdate={(next) => {
                      setApplications(applications.map((a) => a.id === selected.id ? next : a));
                      setSelected(next);
                    }}
                  />
                )}

                {/* Trial Day Playbook — your script for the day */}
                {(selected.status === 'onboarding' || selected.status === 'trial_day') && (
                  <TrialDayPlaybookPanel />
                )}

                {/* Onboarding checklist — shows for onboarding + trial_day + hired status */}
                {(selected.status === 'onboarding' || selected.status === 'trial_day' || selected.status === 'hired') && (() => {
                  const PHASE_META = {
                    before: { label: 'Before trial day', sub: 'Online — they do these the day before' },
                    morning: { label: 'Morning of trial', sub: 'In person — you hand these off' },
                    after: { label: 'After trial (if hired)', sub: 'Only when you decide to keep them' },
                  };
                  const phases = ['before', 'morning', 'after'];
                  const stepsByPhase = phases.map(p => ({ phase: p, steps: onboardingSteps.filter(s => s.phase === p) }));
                  const totalSteps = onboardingSteps.length;
                  const doneCount = onboardingSteps.filter(s => selected.onboarding?.[s.id]?.done).length;
                  return (
                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ClipboardList size={14} className="text-cyan-400" />
                          <p className="text-sm font-black text-primary">Onboarding</p>
                          <span className="text-[11px] text-muted font-semibold">{doneCount}/{totalSteps}</span>
                        </div>
                        <button onClick={() => setEditingOnboarding(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-primary cursor-pointer">
                          <Pencil size={11} /> Edit steps
                        </button>
                      </div>
                      {stepsByPhase.map(({ phase, steps }) => steps.length === 0 ? null : (
                        <div key={phase} className="space-y-2">
                          <div>
                            <p className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">{PHASE_META[phase].label}</p>
                            <p className="text-[10px] text-muted italic">{PHASE_META[phase].sub}</p>
                          </div>
                          <div className="space-y-1.5">
                            {steps.map((s) => {
                              const state = selected.onboarding?.[s.id] || {};
                              const done = !!state.done;
                              return (
                                <div key={s.id} className="bg-card rounded-lg border border-border-subtle p-2.5">
                                  <div className="flex items-start gap-2.5">
                                    <button onClick={() => toggleOnboardingStep(s.id)}
                                      className={`w-5 h-5 rounded-md shrink-0 mt-0.5 flex items-center justify-center transition-colors ${done ? 'bg-green-500 border-green-500' : 'border border-border-default hover:border-brand'} cursor-pointer`}>
                                      {done && <Check size={12} className="text-black" />}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-[13px] font-semibold ${done ? 'text-muted line-through' : 'text-primary'}`}>{s.label}</p>
                                      {done && state.completedAt && (
                                        <p className="text-[10px] text-muted mt-0.5">{new Date(state.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                                      )}
                                      <input
                                        type="text"
                                        value={state.note || ''}
                                        onChange={(e) => setOnboardingNote(s.id, e.target.value)}
                                        placeholder="note (optional)"
                                        className="w-full mt-1.5 bg-transparent text-[11px] text-secondary placeholder:text-placeholder-muted focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Phone Screen questionnaire */}
                <div className="rounded-xl border border-border-subtle bg-surface-alt/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-blue-400" />
                      <p className="text-sm font-black text-primary">Phone Screen</p>
                    </div>
                    <button onClick={() => setEditingQuestions(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-primary cursor-pointer">
                      <Pencil size={11} /> Edit questions
                    </button>
                  </div>
                  {phoneScreenQuestions.length === 0 ? (
                    <p className="text-xs text-muted">No questions yet. Click "Edit questions" to add some.</p>
                  ) : (
                    <div className="space-y-3">
                      {phoneScreenQuestions.map((q) => {
                        const firstName = (selected.data?.first_name || (selected.data?.name || '').split(' ')[0] || '').trim();
                        const rawDates = selected.data?.recent_dates;
                        const duration = formatLookingDuration(parseEndDate(rawDates));
                        let label = q.label || '';
                        let hint = null;
                        if (firstName) label = label.replace(/\[name\]/gi, firstName);
                        if (q.id === 'why_looking') {
                          if (duration === 'still working there') {
                            label = "Sounds like you're still at your last spot — what's got you looking to move?";
                          } else if (duration) {
                            label = `You've been looking for work for about ${duration} — what's been going on with that?`;
                          } else {
                            label = "How long have you been looking for work, and what's going on with that?";
                            if (rawDates) hint = `They wrote: "${rawDates}"`;
                          }
                        }
                        return q.type === 'info' ? (
                          <div key={q.id} className="rounded-lg bg-brand/10 border border-brand/20 px-3 py-2">
                            <p className="text-xs text-secondary italic leading-relaxed">{label}</p>
                          </div>
                        ) : (
                          <div key={q.id} className="py-1">
                            <p className="text-sm font-semibold text-primary leading-snug">{label}</p>
                            {hint && <p className="text-[10px] text-muted mt-1 italic">{hint}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-4 border-t border-border-subtle">
                  <button onClick={() => deleteApp(selected.id)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-muted hover:text-red-400 hover:bg-red-500/10 cursor-pointer">
                    <Trash2 size={12} /> Delete application
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.length === 0 && <p className="text-sm text-muted text-center py-16">No applicants match.</p>}
          {sorted.map((app) => {
            const d = app.data || {};
            const name = fullName(d);
            const age = d.dob ? (() => { const bd = new Date(d.dob); const a = Math.floor((Date.now() - bd.getTime()) / 31557600000); return a > 0 && a < 100 ? a : null; })() : null;

            // Top 3 pill tags (prioritize red flags first)
            const tags = [];
            if (d.background_check === 'Yes') tags.push({ label: 'Background', bad: true });
            if (d.tobacco_use === 'Yes') tags.push({ label: 'Nicotine', bad: true });
            if (d.injuries === 'Yes') tags.push({ label: 'Injury', bad: true });
            if (d.drivers_license === 'No') tags.push({ label: 'No license', bad: true });
            if (d.physical_ability === 'No') tags.push({ label: "Can't do physical", bad: true });
            if (d.years_landscaping === '5+ years') tags.push({ label: '5+ yrs exp', good: true });
            else if (d.years_landscaping === '3-5 years') tags.push({ label: '3-5 yrs exp', good: true });
            else if (d.years_landscaping === '1-2 years') tags.push({ label: '1-2 yrs exp', good: true });
            if (d.leadership_exp === 'Yes') tags.push({ label: 'Lead exp', good: true });
            if (d.how_long === '1+ years' || d.how_long === 'Long-term / as long as it works') tags.push({ label: 'Long-term', good: true });

            return (
              <button
                key={app.id}
                onClick={() => setSelected(app)}
                className="w-full bg-card rounded-2xl p-4 flex items-center gap-4 hover:bg-surface-alt transition-colors cursor-pointer text-left"
              >
                {/* Score ring */}
                <div
                  className="relative w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `conic-gradient(${scoreColor(app.score)} ${app.score * 36}deg, var(--color-surface-alt) 0)` }}
                >
                  <div className="absolute inset-1 rounded-full bg-card flex items-center justify-center">
                    <span className={`text-sm font-black ${scoreTone(app.score)}`}>{app.score}</span>
                  </div>
                </div>

                {/* Middle */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[15px] font-bold text-primary truncate">{name}</p>
                    {age && <span className="text-xs font-semibold text-muted">{age}</span>}
                    {(app.status || 'new') !== 'new' && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${statusColor(app.status)}`}>{PIPELINE.find(p => p.id === app.status)?.label || app.status}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted truncate">
                    {location(d) && <span className="truncate">{location(d)}</span>}
                    {location(d) && d.phone && <span>·</span>}
                    {d.phone && <span className="truncate">{fmtPhone(d.phone)}</span>}
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tags.slice(0, 4).map((t, i) => (
                        <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.bad ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>{t.label}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Date + chevron */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[11px] text-muted">{new Date(app.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <ChevronRight size={16} className="text-muted" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {editingQuestions && (
        <PhoneScreenEditor
          questions={phoneScreenQuestions}
          onSave={(next) => { setPhoneScreenQuestions(next); setEditingQuestions(false); }}
          onClose={() => setEditingQuestions(false)}
        />
      )}

      {editingOnboarding && (
        <OnboardingStepsEditor
          steps={onboardingSteps}
          onSave={(next) => { setOnboardingSteps(next); setEditingOnboarding(false); }}
          onClose={() => setEditingOnboarding(false)}
        />
      )}
    </div>
  );
}

function OnboardingStepsEditor({ steps, onSave, onClose }) {
  const [items, setItems] = useState(steps);
  const update = (i, patch) => setItems(items.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const remove = (i) => setItems(items.filter((_, idx) => idx !== i));
  const addTo = (phase) => setItems([...items, { id: crypto.randomUUID().slice(0, 8), label: '', phase }]);
  const PHASES = [
    { id: 'before', label: 'Before trial day' },
    { id: 'morning', label: 'Morning of trial' },
    { id: 'after', label: 'After trial (if hired)' },
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border-subtle w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <p className="text-sm font-black text-primary">Onboarding Steps</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-alt text-muted cursor-pointer"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {PHASES.map((phase) => {
            const phaseItems = items.map((s, i) => ({ ...s, idx: i })).filter(s => s.phase === phase.id);
            return (
              <div key={phase.id} className="space-y-2">
                <p className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">{phase.label}</p>
                {phaseItems.map((s) => (
                  <div key={s.id} className="flex items-start gap-2">
                    <input
                      type="text"
                      value={s.label}
                      onChange={(e) => update(s.idx, { label: e.target.value })}
                      placeholder="Step..."
                      className="flex-1 bg-surface-alt rounded-lg px-3 py-2 text-sm text-primary placeholder:text-placeholder-muted focus:outline-none focus:ring-1 focus:ring-border-default"
                    />
                    <button onClick={() => remove(s.idx)} className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 cursor-pointer"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button onClick={() => addTo(phase.id)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border-subtle text-xs font-semibold text-muted hover:text-primary hover:border-border-default cursor-pointer">
                  <Plus size={13} /> Add step
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-subtle">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-xs font-semibold text-muted hover:bg-surface-alt cursor-pointer">Cancel</button>
          <button onClick={() => onSave(items.filter((s) => s.label.trim()))} className="px-3 py-2 rounded-lg text-xs font-bold bg-brand text-on-brand hover:bg-brand-hover cursor-pointer">Save</button>
        </div>
      </div>
    </div>
  );
}

function PhoneScreenEditor({ questions, onSave, onClose }) {
  const [items, setItems] = useState(questions);
  const update = (i, label) => setItems(items.map((q, idx) => idx === i ? { ...q, label } : q));
  const remove = (i) => setItems(items.filter((_, idx) => idx !== i));
  const add = () => setItems([...items, { id: crypto.randomUUID().slice(0, 8), label: '' }]);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border-subtle w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <p className="text-sm font-black text-primary">Phone Screen Questions</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-alt text-muted cursor-pointer"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {items.map((q, i) => (
            <div key={q.id} className="flex items-start gap-2">
              <textarea
                value={q.label}
                onChange={(e) => update(i, e.target.value)}
                rows={2}
                placeholder="Question..."
                className="flex-1 bg-surface-alt rounded-lg px-3 py-2 text-sm text-primary placeholder:text-placeholder-muted focus:outline-none focus:ring-1 focus:ring-border-default resize-none"
              />
              <button onClick={() => remove(i)} className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 cursor-pointer"><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={add} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border-subtle text-xs font-semibold text-muted hover:text-primary hover:border-border-default cursor-pointer">
            <Plus size={13} /> Add question
          </button>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-subtle">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-xs font-semibold text-muted hover:bg-surface-alt cursor-pointer">Cancel</button>
          <button onClick={() => onSave(items.filter((q) => q.label.trim()))} className="px-3 py-2 rounded-lg text-xs font-bold bg-brand text-on-brand hover:bg-brand-hover cursor-pointer">Save</button>
        </div>
      </div>
    </div>
  );
}

/* ── Trial Agreement Panel ── */
function TrialAgreementPanel({ applicant, onUpdate }) {
  const template = useAppStore((s) => s.trialAgreement);
  const [signing, setSigning] = useState(false);
  const [viewingContent, setViewingContent] = useState(false);
  const sig = applicant.trialAgreement;

  const handleSigned = (payload) => {
    onUpdate({ ...applicant, trialAgreement: payload, onboarding: { ...(applicant.onboarding || {}), trial_agreement: { done: true, completedAt: payload.signedAt } } });
    setSigning(false);
  };

  const handleUnsign = () => {
    if (!confirm('Remove this signature?')) return;
    const onb = { ...(applicant.onboarding || {}) };
    delete onb.trial_agreement;
    onUpdate({ ...applicant, trialAgreement: null, onboarding: onb });
  };

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${sig ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/10'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className={sig ? 'text-emerald-400' : 'text-amber-400'} />
          <p className="text-sm font-black text-primary">Trial Agreement</p>
          {sig && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Signed</span>}
          {!sig && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Needs signature</span>}
        </div>
        <button onClick={() => setViewingContent((v) => !v)} className="text-[11px] font-semibold text-muted hover:text-primary cursor-pointer">
          {viewingContent ? 'Hide' : 'View'} text
        </button>
      </div>

      {viewingContent && (
        <div className="bg-card rounded-lg border border-border-subtle p-3 space-y-3 max-h-80 overflow-y-auto">
          {(template?.sections || []).map((s) => (
            <div key={s.id}>
              <p className="text-[11px] font-black text-primary uppercase tracking-wider mb-1">{s.title}</p>
              <div className="text-xs text-secondary prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: s.body }} />
            </div>
          ))}
          <div className="pt-2 border-t border-border-subtle">
            <p className="text-[11px] font-black text-primary uppercase tracking-wider mb-1">Acknowledgment</p>
            <p className="text-xs text-secondary italic">{template?.acknowledgment || ''}</p>
          </div>
        </div>
      )}

      {sig ? (
        <div className="flex items-center justify-between gap-3 bg-card rounded-lg border border-border-subtle p-3">
          <div className="flex items-center gap-3 min-w-0">
            {sig.signatureDataUrl && <img src={sig.signatureDataUrl} alt="signature" className="h-10 w-auto bg-white rounded border border-border-subtle" />}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-primary truncate">{sig.printedName}</p>
              <p className="text-[10px] text-muted">{new Date(sig.signedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · v{sig.version}</p>
            </div>
          </div>
          <button onClick={handleUnsign} className="text-[11px] font-semibold text-muted hover:text-red-400 cursor-pointer shrink-0">Unsign</button>
        </div>
      ) : (
        <button onClick={() => setSigning(true)} className="w-full py-2.5 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer inline-flex items-center justify-center gap-2">
          <PenTool size={14} /> Sign now
        </button>
      )}

      {signing && <TrialSignModal template={template} applicant={applicant} onSigned={handleSigned} onClose={() => setSigning(false)} />}
    </div>
  );
}

function TrialSignModal({ template, applicant, onSigned, onClose }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const [printedName, setPrintedName] = useState(applicant?.data?.name || [applicant?.data?.first_name, applicant?.data?.last_name].filter(Boolean).join(' ') || '');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
  };
  const startDraw = (e) => { e.preventDefault(); drawing.current = true; last.current = getPos(e); };
  const draw = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    last.current = pos;
  };
  const endDraw = () => { drawing.current = false; };
  const clearCanvas = () => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
  };
  const initCanvas = useCallback((el) => {
    canvasRef.current = el;
    if (el) {
      const ctx = el.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, el.width, el.height);
    }
  }, []);

  const handleSubmit = () => {
    setError(null);
    if (!printedName.trim()) { setError('Print your name'); return; }
    if (!confirmed) { setError('Check the confirmation box'); return; }
    const canvas = canvasRef.current;
    if (!canvas) { setError('Signature required'); return; }
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let drawn = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 100 || data[i + 1] < 100) drawn++;
    if (drawn < 300) { setError('Draw a more complete signature'); return; }
    onSigned({
      version: template?.version || '1.0',
      signedAt: new Date().toISOString(),
      printedName: printedName.trim(),
      signatureDataUrl: canvas.toDataURL('image/png'),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border-subtle w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <p className="text-sm font-black text-primary">Sign Trial Agreement</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-alt text-muted cursor-pointer"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="bg-surface-alt rounded-lg p-3 space-y-3">
            {(template?.sections || []).map((s) => (
              <div key={s.id}>
                <p className="text-[11px] font-black text-primary uppercase tracking-wider mb-1">{s.title}</p>
                <div className="text-xs text-secondary prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: s.body }} />
              </div>
            ))}
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 w-4 h-4 accent-brand" />
            <span className="text-xs text-secondary">{template?.acknowledgment || ''}</span>
          </label>

          <div>
            <label className="block text-[11px] font-black text-muted uppercase tracking-wider mb-1.5">Printed Name</label>
            <input type="text" value={printedName} onChange={(e) => setPrintedName(e.target.value)} placeholder="Full name" className="w-full bg-surface-alt rounded-lg px-3 py-2 text-sm text-primary placeholder:text-placeholder-muted focus:outline-none focus:ring-1 focus:ring-border-default" />
          </div>

          <div>
            <label className="block text-[11px] font-black text-muted uppercase tracking-wider mb-1.5">Signature</label>
            <canvas
              ref={initCanvas}
              width={500}
              height={180}
              className="w-full border border-border-default rounded-lg bg-white touch-none"
              style={{ height: 150 }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            <button onClick={clearCanvas} className="mt-1 text-[11px] text-muted hover:text-primary cursor-pointer">Clear</button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-subtle">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-xs font-semibold text-muted hover:bg-surface-alt cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-2 rounded-lg text-xs font-bold bg-brand text-on-brand hover:bg-brand-hover cursor-pointer">Sign</button>
        </div>
      </div>
    </div>
  );
}

/* ── Trial Day Playbook Panel ── */
function TrialDayPlaybookPanel() {
  const playbook = useAppStore((s) => s.trialDayPlaybook) || '';
  const setPlaybook = useAppStore((s) => s.setTrialDayPlaybook);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(playbook);

  const save = () => { setPlaybook(draft); setEditing(false); };

  return (
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-purple-400" />
          <p className="text-sm font-black text-primary">Trial Day Playbook</p>
          <span className="text-[10px] text-muted italic">your script</span>
        </div>
        {editing ? (
          <div className="flex items-center gap-1">
            <button onClick={() => { setDraft(playbook); setEditing(false); }} className="text-[11px] font-semibold text-muted hover:text-primary cursor-pointer">Cancel</button>
            <button onClick={save} className="text-[11px] font-bold text-brand-text hover:text-brand-text-strong cursor-pointer">Save</button>
          </div>
        ) : (
          <button onClick={() => { setDraft(playbook); setEditing(true); }} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-primary cursor-pointer">
            <Pencil size={11} /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={16}
          className="w-full bg-card rounded-lg px-3 py-2 text-xs font-mono text-primary focus:outline-none focus:ring-1 focus:ring-border-default resize-y"
        />
      ) : (
        <div className="bg-card rounded-lg border border-border-subtle p-3 text-sm text-secondary prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: playbook }} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════ */
export default function Hiring() {
  return <PageDetail />;
}
