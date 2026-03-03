import {
  ShieldCheck,
  Sparkles,
  Trophy,
  Sunrise,
  BookOpenCheck,
  CheckCircle2,
  Navigation,
  Sunset,
  AlertTriangle,
  Handshake,
  ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CORE_VALUES = [
{ label: 'Clean Finish, Clean Reset', desc: 'Leave every job site, truck, and trailer cleaner than you found it.', emoji: '✨', bg: 'bg-sky-500/15', icon: Sparkles, iconColor: 'text-sky-500' },
  { label: 'Go the Extra Mile', desc: 'Do the little things nobody asked for. That\'s what sets us apart.', emoji: '🏆', bg: 'bg-emerald-500/15', icon: Trophy, iconColor: 'text-emerald-500' },
  { label: 'Respect', desc: 'Have each other\'s back. No drama, no ego — we win together.', emoji: '🤝', bg: 'bg-violet-500/15', icon: Handshake, iconColor: 'text-violet-500' },
];

const DAILY_FLOW = [
  {
    phase: 'Start of Day',
    icon: Sunrise,
    bg: 'bg-amber-500/15',
    iconColor: 'text-amber-500',
    items: [
      'Show up on time, in uniform, ready to work',
      'Complete your opening checklist',
    ],
  },
  {
    phase: 'On Every Job',
    icon: BookOpenCheck,
    bg: 'bg-purple-500/15',
    iconColor: 'text-purple-500',
    items: [
      'Have the playbook open during the service',
      'Clean the site before you leave — blow off clippings, clean up mud, leave zero trace',
      'Complete the job checklist when finished',
      'Mark the job complete in Jobber',
    ],
  },
  {
    phase: 'Between Jobs',
    icon: Navigation,
    bg: 'bg-sky-500/15',
    iconColor: 'text-sky-500',
    items: [
      'Hit directions for the next job',
      'Send "On My Way" to notify the client',
    ],
  },
  {
    phase: 'End of Day',
    icon: Sunset,
    bg: 'bg-indigo-500/15',
    iconColor: 'text-indigo-500',
    items: [
      'Complete your closing checklist',
      'Log mileage',
      'Scan any receipts',
    ],
  },
  {
    phase: 'Always',
    icon: AlertTriangle,
    bg: 'bg-rose-500/15',
    iconColor: 'text-rose-500',
    items: [
      'Client complaint? Report it to your General Manager immediately',
      'Equipment breaks? Log a repair in the app and notify your GM',
      'Broke something on a property? Tell your GM right away — don\'t hide it',
      'Running late or need help? Speak up before it becomes a problem',
    ],
  },
];

export default function Standards() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary cursor-pointer"
      >
        <ArrowLeft size={16} />
        Home
      </button>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-light flex items-center justify-center">
          <ShieldCheck size={22} className="text-brand-text-strong" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-primary">What&apos;s Expected</h1>
          <p className="text-sm text-tertiary">Our values & your daily flow</p>
        </div>
      </div>

      {/* Core Values */}
      <div className="bg-card rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Our Core Values</h3>
        </div>
        <div className="p-4 grid grid-cols-3 gap-3">
          {CORE_VALUES.map((v) => (
            <div key={v.label} className="text-center px-2 py-3">
              <div className={`w-12 h-12 rounded-xl ${v.bg} flex items-center justify-center mx-auto mb-2`}>
                <span className="text-xl">{v.emoji}</span>
              </div>
              <p className="text-xs font-bold text-primary leading-tight">{v.label}</p>
              <p className="text-[11px] text-tertiary mt-1 leading-snug">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Flow */}
      <div className="bg-card rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Your Daily Flow</h3>
        </div>
        <div className="p-4 space-y-1">
          {DAILY_FLOW.map((section, si) => {
            const Icon = section.icon;
            return (
              <div key={si} className="relative flex gap-3">
                {/* Timeline line */}
                {si < DAILY_FLOW.length - 1 && (
                  <div className="absolute left-[19px] top-10 bottom-0 w-px bg-border-subtle" />
                )}
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl ${section.bg} flex items-center justify-center shrink-0 z-10`}>
                  <Icon size={18} className={section.iconColor} />
                </div>
                {/* Content */}
                <div className="flex-1 pb-5 min-w-0">
                  <p className="text-sm font-bold text-primary leading-tight mt-2.5">{section.phase}</p>
                  <ul className="mt-2 space-y-1.5">
                    {section.items.map((item, ii) => (
                      <li key={ii} className="flex items-start gap-2">
                        <CheckCircle2 size={14} className="text-muted shrink-0 mt-0.5" />
                        <span className="text-xs text-secondary leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
