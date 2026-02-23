import { useState } from 'react';
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

  const firstName = currentUser?.split(' ')[0] || 'Team Member';

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

  const dailyOps = (
    <>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Daily Ops</h3>
      <div className="flex flex-col gap-2">
        <a
          href="jobber://"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 sm:px-6 sm:py-4 text-white hover:opacity-90 transition-opacity"
        >
          <div>
            <h3 className="text-base font-bold">Open Jobber</h3>
            <p className="text-sm text-white/80">View today's schedule and jobs</p>
          </div>
          <ChevronRight size={22} className="shrink-0" />
        </a>
        <button
          onClick={() => navigate('/guides')}
          className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-3 sm:px-6 sm:py-4 text-white text-left hover:opacity-90 transition-opacity cursor-pointer"
        >
          <div>
            <h3 className="text-base font-bold">Playbooks</h3>
            <p className="text-sm text-white/80">Follow the standards for every job</p>
          </div>
          <BookOpen size={22} className="shrink-0" />
        </button>
      </div>
    </>
  );

  const reportLinks = (
    <>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Report Something</h3>
      <div className="flex gap-2">
        <button
          onClick={() => navigate('/equipment?report=1')}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 sm:px-5 sm:py-4 text-white text-left hover:opacity-90 transition-opacity cursor-pointer"
        >
          <AlertCircle size={18} className="shrink-0" />
          <span className="font-bold text-sm">Report Repair</span>
        </button>
        <button
          onClick={() => navigate('/ideas?submit=1')}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 to-purple-700 px-4 py-3 sm:px-5 sm:py-4 text-white text-left hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Lightbulb size={18} className="shrink-0" />
          <span className="font-bold text-sm">Submit Idea</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-[calc(100svh-9rem)] overflow-y-auto md:h-auto md:overflow-visible">
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

      {/* Flow State: needs-opening */}
      {flowState === 'needs-opening' && !startedDay && (
        <div className="flex flex-col items-center justify-center text-center flex-1 py-12 sm:py-20">
          <ClipboardCheck size={56} className="text-brand-text mb-4" />
          <h2 className="text-2xl sm:text-3xl font-bold text-primary mb-2">Good morning, {firstName}!</h2>
          <p className="text-secondary text-sm mb-8">Ready to get started?</p>
          <button
            onClick={() => setStartedDay(true)}
            className="px-10 py-4 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold text-lg hover:opacity-90 transition-opacity cursor-pointer shadow-lg"
          >
            Start My Day
          </button>
        </div>
      )}

      {/* Flow State: needs-opening — checklist */}
      {flowState === 'needs-opening' && startedDay && (
        <>
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <ClipboardCheck size={24} className="text-brand-text" />
            <h2 className="text-xl sm:text-2xl font-bold text-primary">Opening Checklist</h2>
          </div>
          <ChecklistPanel title="Opening" items={teamChecklist} checklistType="team-start" checklistLog={checklistLog} setChecklistLog={setChecklistLog} defaultOpen />
        </>
      )}

      {/* Flow State: working */}
      {flowState === 'working' && (
        <>
          <div className="flex items-center justify-between mb-5 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-primary">Have a great day, {firstName}</h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
              <Check size={14} />
              Opening
            </span>
          </div>

          {dailyOps}

          <div className="mt-4 sm:mt-5">
            {reportLinks}
          </div>

          <div className="mt-5 sm:mt-6 pt-5 sm:pt-6 border-t border-border-subtle">
            <button
              onClick={() => setClosingMode(true)}
              className="flex items-center justify-center gap-2 w-full rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-4 text-white font-bold text-base hover:opacity-90 transition-opacity cursor-pointer"
            >
              <FlagTriangleRight size={20} />
              Wrap Up
            </button>
          </div>
        </>
      )}

      {/* Flow State: needs-closing */}
      {flowState === 'needs-closing' && (
        <>
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
          <ChecklistPanel title="Closing" items={teamEndChecklist} checklistType="team-end" checklistLog={checklistLog} setChecklistLog={setChecklistLog} mileage={{ vehicles, onSubmit: handleInlineMileage }} defaultOpen />
        </>
      )}

      {/* Flow State: done */}
      {flowState === 'done' && (
        <>
          <div className="flex flex-col items-center text-center py-6 sm:py-10 mb-4 sm:mb-6">
            <PartyPopper size={48} className="text-amber-500 mb-3" />
            <h2 className="text-2xl sm:text-3xl font-bold text-primary mb-2">Great work today!</h2>
            <p className="text-secondary text-sm">Opening and closing checklists completed.</p>
            <div className="flex items-center gap-3 mt-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                <Check size={14} />
                Opening
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                <Check size={14} />
                Closing
              </span>
            </div>
          </div>
          {dailyOps}
          <div className="mt-4 sm:mt-5">
            {reportLinks}
          </div>
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
