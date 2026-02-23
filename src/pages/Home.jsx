import { useState, useMemo, useEffect, useRef } from 'react';
import { Megaphone, ChevronRight, AlertCircle, Lightbulb, Check, BookOpen, ClipboardCheck, FlagTriangleRight, PartyPopper, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ChecklistPanel from '../components/ChecklistPanel';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';
import { genId } from '../data';
import { getTodayInTimezone } from '../utils/timezone';


export default function Home() {
  const navigate = useNavigate();
  const { user, currentUser } = useAuth();
  const userEmail = user?.email;

  const announcements = useAppStore((s) => s.announcements);
  const setAnnouncements = useAppStore((s) => s.setAnnouncements);
  const teamChecklist = useAppStore((s) => s.teamChecklist);
  const teamEndChecklist = useAppStore((s) => s.teamEndChecklist);
  const checklistLog = useAppStore((s) => s.checklistLog);
  const setChecklistLog = useAppStore((s) => s.setChecklistLog);
  const vehicles = useAppStore((s) => s.vehicles);
  const mileageLog = useAppStore((s) => s.mileageLog);
  const setMileageLog = useAppStore((s) => s.setMileageLog);

  const [closingMode, setClosingMode] = useState(false);
  const [startedDay, setStartedDay] = useState(false);

  // Derive flow state from checklistLog
  const today = getTodayInTimezone();
  const openingLog = checklistLog.find((e) => e.date === today && e.checklistType === 'team-start');
  const closingLog = checklistLog.find((e) => e.date === today && e.checklistType === 'team-end');
  const openingDone = openingLog && openingLog.completedItems === openingLog.totalItems;
  const closingDone = closingLog && closingLog.completedItems === closingLog.totalItems;

  let flowState;
  if (!openingDone) {
    flowState = 'needs-opening';
  } else if (closingDone) {
    flowState = 'done';
  } else if (closingMode) {
    flowState = 'needs-closing';
  } else {
    flowState = 'working';
  }

  const containerRef = useRef(null);

  // Scroll to top on flow state changes
  useEffect(() => {
    // Immediate + delayed to handle mobile Safari quirks
    const scrollTop = () => {
      if (containerRef.current) containerRef.current.scrollTop = 0;
      window.scrollTo(0, 0);
    };
    scrollTop();
    const t = setTimeout(scrollTop, 50);
    return () => clearTimeout(t);
  }, [flowState, startedDay, closingMode]);

  const firstName = currentUser?.split(' ')[0] || 'Team Member';

  const weeklyQuote = useMemo(() => {
    const quotes = [
      { text: 'Whatever you do, work at it with all your heart.', ref: 'Colossians 3:23' },
      { text: 'Commit to the Lord whatever you do, and he will establish your plans.', ref: 'Proverbs 16:3' },
      { text: 'The hand of the diligent will rule, while the slothful will be put to forced labor.', ref: 'Proverbs 12:24' },
      { text: 'Do everything in love.', ref: '1 Corinthians 16:14' },
      { text: 'Be strong and courageous. Do not be afraid; do not be discouraged.', ref: 'Joshua 1:9' },
      { text: 'Let us not become weary in doing good, for at the proper time we will reap a harvest.', ref: 'Galatians 6:9' },
      { text: 'Iron sharpens iron, and one man sharpens another.', ref: 'Proverbs 27:17' },
      { text: 'I can do all things through him who strengthens me.', ref: 'Philippians 4:13' },
      { text: 'The plans of the diligent lead surely to abundance.', ref: 'Proverbs 21:5' },
      { text: 'Two are better than one, because they have a good reward for their toil.', ref: 'Ecclesiastes 4:9' },
      { text: 'Whatever your hand finds to do, do it with all your might.', ref: 'Ecclesiastes 9:10' },
      { text: 'He who gathers in summer is a prudent son.', ref: 'Proverbs 10:5' },
      { text: 'As each has received a gift, use it to serve one another.', ref: '1 Peter 4:10' },
      { text: 'Diligent hands will rule, but laziness ends in forced labor.', ref: 'Proverbs 12:24' },
      { text: 'Well done, good and faithful servant. You have been faithful over a little; I will set you over much.', ref: 'Matthew 25:21' },
      { text: 'For we are his workmanship, created for good works.', ref: 'Ephesians 2:10' },
      { text: 'Do not be slothful in zeal, be fervent in spirit, serve the Lord.', ref: 'Romans 12:11' },
      { text: 'In all toil there is profit, but mere talk tends only to poverty.', ref: 'Proverbs 14:23' },
      { text: 'He gives power to the faint, and to him who has no might he increases strength.', ref: 'Isaiah 40:29' },
      { text: 'The Lord will fight for you; you need only to be still.', ref: 'Exodus 14:14' },
      { text: 'Great things are done by a series of small things brought together.', ref: 'Vincent van Gogh' },
      { text: 'The secret of getting ahead is getting started.', ref: 'Mark Twain' },
      { text: 'A generous person will prosper; whoever refreshes others will be refreshed.', ref: 'Proverbs 11:25' },
      { text: 'Let your light shine before others, that they may see your good deeds.', ref: 'Matthew 5:16' },
      { text: 'Trust in the Lord with all your heart and lean not on your own understanding.', ref: 'Proverbs 3:5' },
      { text: 'And let us consider how to stir up one another to love and good works.', ref: 'Hebrews 10:24' },
    ];
    // Pick based on week number of the year
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.floor(((now - start) / 86400000 + start.getDay()) / 7);
    return quotes[weekNum % quotes.length];
  }, []);

  const unacknowledged = announcements.filter((a) => !a.acknowledgedBy?.[userEmail]);

  const handleAcknowledge = (id) => {
    setAnnouncements(
      announcements.map((a) =>
        a.id === id
          ? {
              ...a,
              acknowledgedBy: {
                ...a.acknowledgedBy,
                [userEmail]: { name: currentUser, at: new Date().toISOString() },
              },
            }
          : a
      )
    );
  };

  const handleInlineMileage = ({ vehicleId, odometer }) => {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    const odometerNum = Number(odometer);
    const vehicleName = vehicle?.name || 'Unknown';
    const todayISO = new Date().toISOString().slice(0, 10);

    const prevEntry = [...mileageLog]
      .filter((e) => e.vehicleId === vehicleId)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      [0];

    setMileageLog([
      ...mileageLog,
      {
        id: genId(),
        vehicleId,
        vehicleName,
        odometer: odometerNum,
        date: todayISO,
        notes: '',
        loggedBy: currentUser,
        createdAt: new Date().toISOString(),
      },
    ]);

    fetch('/api/qb-mileage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleName,
        odometer: odometerNum,
        date: todayISO,
        notes: '',
        loggedBy: currentUser,
        previousOdometer: prevEntry?.odometer || null,
      }),
    }).catch(() => {});
  };

  const quickLinks = (
    <div className="space-y-3">
      {/* Daily Ops card */}
      <div className="bg-card rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Daily Ops</h3>
        </div>
        <div className="p-2 space-y-1">
          <a
            href="jobber://"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-alt transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
              <ChevronRight size={18} className="text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary">Open Jobber</p>
              <p className="text-xs text-muted">View today's schedule and jobs</p>
            </div>
          </a>
          <button
            onClick={() => navigate('/guides')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-alt transition-colors text-left cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
              <BookOpen size={18} className="text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary">Playbooks</p>
              <p className="text-xs text-muted">Follow the standards for every job</p>
            </div>
          </button>
        </div>
      </div>

      {/* Report Something card */}
      <div className="bg-card rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Report Something</h3>
        </div>
        <div className="p-2 space-y-1">
          <button
            onClick={() => navigate('/equipment?report=1')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-alt transition-colors text-left cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center shrink-0">
              <AlertCircle size={18} className="text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary">Report Repair</p>
              <p className="text-xs text-muted">Equipment needs repair</p>
            </div>
          </button>
          <button
            onClick={() => navigate('/ideas?submit=1')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-alt transition-colors text-left cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
              <Lightbulb size={18} className="text-purple-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary">Submit Idea</p>
              <p className="text-xs text-muted">Suggest an improvement</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="flex flex-col h-[calc(100svh-9rem)] overflow-y-auto md:h-auto md:overflow-visible">
      {/* Blocking announcement modal */}
      {unacknowledged.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-border-subtle shrink-0">
              <Megaphone size={18} className="text-brand-text" />
              <h2 className="text-lg font-bold text-primary">New Announcements</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {unacknowledged.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {unacknowledged.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-xl border p-5 ${
                    a.priority === 'high'
                      ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/40'
                      : 'border-border-subtle bg-surface'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-base font-bold text-primary">{a.title}</h3>
                    {a.priority === 'high' && (
                      <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        HIGH
                      </span>
                    )}
                    {a.priority === 'normal' && (
                      <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-alt text-secondary">
                        NORMAL
                      </span>
                    )}
                  </div>
                  <p className="text-secondary text-sm leading-relaxed mb-4">{a.message}</p>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted">
                      <span>Posted by {a.postedBy}</span>
                      <span className="ml-3">{a.date}</span>
                    </div>
                    <button
                      onClick={() => handleAcknowledge(a.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
                    >
                      <Check size={14} />
                      Got it
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Day progress bar — hidden on initial splash and done state */}
      {!(flowState === 'needs-opening' && !startedDay) && flowState !== 'done' && (
        <div className="flex items-center gap-1.5 mb-4">
          {[
            { label: 'Opening', done: openingDone, active: flowState === 'needs-opening' },
            { label: 'Working', done: flowState === 'needs-closing' || closingDone, active: flowState === 'working' },
            { label: 'Wrap Up', done: closingDone, active: flowState === 'needs-closing' },
          ].map((step, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-full h-1.5 rounded-full transition-colors ${
                step.done
                  ? 'bg-brand'
                  : step.active
                    ? 'bg-brand/50'
                    : 'bg-border-subtle'
              }`} />
              <span className={`text-[10px] font-semibold transition-colors ${
                step.done
                  ? 'text-brand-text'
                  : step.active
                    ? 'text-primary'
                    : 'text-muted'
              }`}>{step.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Flow State: needs-opening */}
      {flowState === 'needs-opening' && !startedDay && (
        <div className="flex flex-col items-center justify-center text-center flex-1 py-12 sm:py-20">
          <ClipboardCheck size={56} className="text-brand-text mb-4" />
          <h2 className="text-2xl sm:text-3xl font-bold text-primary mb-2">Good morning, {firstName}!</h2>
          <p className="text-secondary text-sm italic mb-1">"{weeklyQuote.text}"</p>
          <p className="text-xs text-muted mb-8">— {weeklyQuote.ref}</p>
          <button
            onClick={() => setStartedDay(true)}
            className="px-10 py-4 rounded-2xl bg-brand text-on-brand font-bold text-lg hover:bg-brand-hover transition-colors cursor-pointer shadow-lg"
          >
            Start My Day
          </button>
        </div>
      )}

      {/* Flow State: needs-opening — checklist */}
      {flowState === 'needs-opening' && startedDay && (
        <>
          <p className="text-xs text-secondary italic leading-relaxed mb-3">"{weeklyQuote.text}" <span className="not-italic text-muted">— {weeklyQuote.ref}</span></p>
          <ChecklistPanel title="Opening" items={teamChecklist} checklistType="team-start" checklistLog={checklistLog} setChecklistLog={setChecklistLog} />
        </>
      )}

      {/* Flow State: working */}
      {flowState === 'working' && (
        <>
          <p className="text-xs text-secondary italic leading-relaxed mb-3">"{weeklyQuote.text}" <span className="not-italic text-muted">— {weeklyQuote.ref}</span></p>
          {quickLinks}

          <button
            onClick={() => setClosingMode(true)}
            className="mt-4 flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-brand-light text-brand-text font-bold text-base hover:bg-brand-light/80 transition-colors cursor-pointer border border-brand/20 shadow-sm"
          >
            <FlagTriangleRight size={18} />
            <span className="flex flex-col items-start leading-tight">
              <span>Done for the day? Wrap Up</span>
              <span className="text-xs font-normal opacity-70">Complete your closing checklist</span>
            </span>
          </button>
        </>
      )}

      {/* Flow State: needs-closing */}
      {flowState === 'needs-closing' && (
        <>
          <p className="text-xs text-secondary italic leading-relaxed mb-3">"{weeklyQuote.text}" <span className="not-italic text-muted">— {weeklyQuote.ref}</span></p>
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <FlagTriangleRight size={24} className="text-indigo-500" />
            <h2 className="text-xl sm:text-2xl font-bold text-primary">Closing Checklist</h2>
          </div>
          <button
            onClick={() => setClosingMode(false)}
            className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary mb-3 cursor-pointer"
          >
            <ArrowLeft size={16} />
            Back to dashboard
          </button>
          <ChecklistPanel title="Closing" items={teamEndChecklist} checklistType="team-end" checklistLog={checklistLog} setChecklistLog={setChecklistLog} mileage={{ vehicles, onSubmit: handleInlineMileage }} />
        </>
      )}

      {/* Flow State: done */}
      {flowState === 'done' && (
        <>
          <div className="flex flex-col items-center text-center py-6 sm:py-10 mb-4 sm:mb-6">
            <PartyPopper size={48} className="text-amber-500 mb-3" />
            <h2 className="text-2xl sm:text-3xl font-bold text-primary mb-2">Great work today!</h2>
            <p className="text-xs text-secondary italic leading-relaxed mt-3">"{weeklyQuote.text}" <span className="not-italic text-muted">— {weeklyQuote.ref}</span></p>
          </div>
          {quickLinks}
        </>
      )}

      {/* DEV: Reset daily flow for testing */}
      <button
        onClick={() => {
          setChecklistLog(checklistLog.filter((e) => e.date !== today));
          setClosingMode(false);
          setStartedDay(false);
        }}
        className="mt-6 self-center text-xs text-muted hover:text-secondary underline cursor-pointer"
      >
        Reset daily flow (testing)
      </button>
    </div>
  );
}
