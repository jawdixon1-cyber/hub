import {
  ShieldCheck,
  Flame,
  Sparkles,

  Trophy,
  ClipboardCheck,
  BookOpen,
  Car,
  Clock,
  MessageCircleWarning,
} from 'lucide-react';

const CORE_VALUES = [
  { label: 'Give a Damn', emoji: '🔥', bg: 'bg-rose-500/15', icon: Flame, iconColor: 'text-rose-500' },
  { label: 'Clean Finish, Clean Reset', emoji: '✨', bg: 'bg-sky-500/15', icon: Sparkles, iconColor: 'text-sky-500' },

  { label: 'Go the Extra Mile', emoji: '🏆', bg: 'bg-emerald-500/15', icon: Trophy, iconColor: 'text-emerald-500' },
];

const RESPONSIBILITIES = [
  {
    title: 'Complete your opening & closing checklists every day',
    description: 'No shortcuts. Checklists keep the crew sharp and the trucks ready.',
    icon: ClipboardCheck,
    bg: 'bg-blue-500/15',
    iconColor: 'text-blue-500',
  },
  {
    title: 'Follow the playbook and complete your checklists',
    description: 'The playbook is how you do it right. The checklist is proof you did it.',
    icon: BookOpen,
    bg: 'bg-purple-500/15',
    iconColor: 'text-purple-500',
  },
  {
    title: 'Log mileage and scan receipts same day',
    description: 'Don\'t let it pile up. End of day, log your miles and snap your receipts.',
    icon: Car,
    bg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-500',
  },
  {
    title: 'Show up on time, in uniform, ready to work',
    description: 'Be where you\'re supposed to be, looking professional, with your gear ready.',
    icon: Clock,
    bg: 'bg-amber-500/15',
    iconColor: 'text-amber-500',
  },
  {
    title: 'Communicate issues immediately — don\'t hide problems',
    description: 'Equipment broke? Customer complaint? Running late? Say something right away.',
    icon: MessageCircleWarning,
    bg: 'bg-rose-500/15',
    iconColor: 'text-rose-500',
  },
];

export default function Expectations() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-light flex items-center justify-center">
          <ShieldCheck size={22} className="text-brand-text-strong" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-primary">What's Expected</h1>
          <p className="text-sm text-tertiary">Our values and your 5 key responsibilities</p>
        </div>
      </div>

      {/* Core Values */}
      <div className="bg-card rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Our Core Values</h3>
        </div>
        <div className="p-4 grid grid-cols-3 gap-3">
          {CORE_VALUES.map((v) => (
            <div key={v.label} className="text-center">
              <div className={`w-12 h-12 rounded-xl ${v.bg} flex items-center justify-center mx-auto mb-2`}>
                <span className="text-xl">{v.emoji}</span>
              </div>
              <p className="text-xs font-bold text-primary leading-tight">{v.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 5 Responsibilities */}
      <div className="bg-card rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Your 5 Responsibilities</h3>
        </div>
        <div className="p-4 space-y-3">
          {RESPONSIBILITIES.map((r, i) => {
            const Icon = r.icon;
            return (
              <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-surface-alt/50 border border-border-subtle">
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold text-muted w-5 text-right">{i + 1}</span>
                  <div className={`w-10 h-10 rounded-xl ${r.bg} flex items-center justify-center`}>
                    <Icon size={20} className={r.iconColor} />
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-primary text-sm leading-snug">{r.title}</p>
                  <p className="text-xs text-tertiary mt-1 leading-relaxed">{r.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
