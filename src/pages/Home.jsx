import { useState } from 'react';
import { Megaphone, ChevronRight, ClipboardCheck, AlertCircle, Lightbulb, Gauge, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ChecklistPanel from '../components/ChecklistPanel';
import MileageModal from '../components/MileageModal';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';
import { genId } from '../data';


export default function Home() {
  const navigate = useNavigate();
  const { user, currentUser } = useAuth();
  const userEmail = user?.email;

  const [showMileageModal, setShowMileageModal] = useState(false);
  const [mileageSuccess, setMileageSuccess] = useState(false);

  const announcements = useAppStore((s) => s.announcements);
  const setAnnouncements = useAppStore((s) => s.setAnnouncements);
  const teamChecklist = useAppStore((s) => s.teamChecklist);
  const teamEndChecklist = useAppStore((s) => s.teamEndChecklist);
  const checklistLog = useAppStore((s) => s.checklistLog);
  const setChecklistLog = useAppStore((s) => s.setChecklistLog);
  const vehicles = useAppStore((s) => s.vehicles);
  const mileageLog = useAppStore((s) => s.mileageLog);
  const setMileageLog = useAppStore((s) => s.setMileageLog);

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

  const handleMileageSubmit = (form) => {
    const vehicle = vehicles.find((v) => v.id === form.vehicleId);
    const odometerNum = Number(form.odometer);
    const vehicleName = vehicle?.name || 'Unknown';

    const prevEntry = [...mileageLog]
      .filter((e) => e.vehicleId === form.vehicleId)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      [0];

    setMileageLog([
      ...mileageLog,
      {
        id: genId(),
        vehicleId: form.vehicleId,
        vehicleName,
        odometer: odometerNum,
        date: form.date,
        notes: form.notes,
        loggedBy: form.loggedBy,
        createdAt: new Date().toISOString(),
      },
    ]);

    // Push to QuickBooks
    fetch('/api/qb-mileage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleName,
        odometer: odometerNum,
        date: form.date,
        notes: form.notes,
        loggedBy: form.loggedBy,
        previousOdometer: prevEntry?.odometer || null,
      }),
    }).catch(() => {});

    setShowMileageModal(false);
    setMileageSuccess(true);
    setTimeout(() => setMileageSuccess(false), 2000);
  };

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

      <div className="flex items-center gap-2 mb-2 sm:mb-6">
        <ClipboardCheck size={20} className="text-brand-text sm:w-[22px] sm:h-[22px]" />
        <h2 className="text-xl sm:text-2xl font-bold text-primary">Daily Checklists</h2>
      </div>

      <div className="grid gap-2 sm:gap-4 md:grid-cols-2">
        <ChecklistPanel title="Start of Day" items={teamChecklist} checklistType="team-start" checklistLog={checklistLog} setChecklistLog={setChecklistLog} />
        <ChecklistPanel title="End of Day" items={teamEndChecklist} checklistType="team-end" checklistLog={checklistLog} setChecklistLog={setChecklistLog} />
      </div>

      <div className="flex flex-col gap-2 sm:gap-3 mt-3 md:mt-6">
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
          onClick={() => navigate('/equipment?report=1')}
          className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 px-5 py-3 sm:px-6 sm:py-4 text-white text-left hover:opacity-90 transition-opacity cursor-pointer"
        >
          <div>
            <h3 className="text-base font-bold">Report Repair</h3>
            <p className="text-sm text-white/80">Equipment needs repair</p>
          </div>
          <AlertCircle size={22} className="shrink-0" />
        </button>
        <button
          onClick={() => setShowMileageModal(true)}
          className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 px-5 py-3 sm:px-6 sm:py-4 text-white text-left hover:opacity-90 transition-opacity cursor-pointer"
        >
          <div>
            <h3 className="text-base font-bold">Log Mileage</h3>
            <p className="text-sm text-white/80">Record vehicle odometer reading</p>
          </div>
          <Gauge size={22} className="shrink-0" />
        </button>
        <button
          onClick={() => navigate('/ideas?submit=1')}
          className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-purple-500 to-purple-700 px-5 py-3 sm:px-6 sm:py-4 text-white text-left hover:opacity-90 transition-opacity cursor-pointer"
        >
          <div>
            <h3 className="text-base font-bold">Submit Idea</h3>
            <p className="text-sm text-white/80">Suggest an improvement</p>
          </div>
          <Lightbulb size={22} className="shrink-0" />
        </button>
      </div>

      {showMileageModal && (
        <MileageModal
          vehicles={vehicles}
          currentUser={currentUser}
          onSubmit={handleMileageSubmit}
          onClose={() => setShowMileageModal(false)}
        />
      )}

      {mileageSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-primary mb-1">Mileage Logged!</h3>
            <p className="text-sm text-secondary">Your entry has been saved.</p>
          </div>
        </div>
      )}
    </div>
  );
}
