import { Megaphone, ChevronRight, ClipboardCheck, AlertCircle, Lightbulb, GraduationCap, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ChecklistPanel from '../components/ChecklistPanel';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';


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

  return (
    <div>
      {/* Blocking announcement modal */}
      {unacknowledged.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-border-subtle shrink-0">
              <Megaphone size={18} className="text-brand-text" />
              <h2 className="text-lg font-bold text-primary">New Announcements</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {unacknowledged.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {unacknowledged.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-xl border p-5 ${
                    a.priority === 'high'
                      ? 'border-red-200 bg-red-50/50'
                      : 'border-border-subtle bg-surface'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-base font-bold text-primary">{a.title}</h3>
                    {a.priority === 'high' && (
                      <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
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

      <div className="flex items-center gap-2 mb-6">
        <ClipboardCheck size={22} className="text-brand-text" />
        <h2 className="text-2xl font-bold text-primary">Daily Checklists</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChecklistPanel title="Start of Day" items={teamChecklist} checklistType="team-start" checklistLog={checklistLog} setChecklistLog={setChecklistLog} />
        <ChecklistPanel title="End of Day" items={teamEndChecklist} checklistType="team-end" checklistLog={checklistLog} setChecklistLog={setChecklistLog} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <a
          href="http://heyjudeslawncare.com/app"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 p-6 text-white hover:opacity-90 transition-opacity"
        >
          <div>
            <h3 className="text-lg font-bold">Open Jobber</h3>
            <p className="text-sm text-white/80 mt-1">View today's schedule and jobs</p>
          </div>
          <ChevronRight size={24} />
        </a>
        <button
          onClick={() => navigate('/equipment')}
          className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white text-left hover:opacity-90 transition-opacity cursor-pointer"
        >
          <div>
            <h3 className="text-lg font-bold">Report Issue</h3>
            <p className="text-sm text-white/80 mt-1">Equipment needs repair</p>
          </div>
          <AlertCircle size={24} />
        </button>
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-purple-500 to-purple-700 p-6 text-white text-left hover:opacity-90 transition-opacity cursor-pointer"
        >
          <div>
            <h3 className="text-lg font-bold">Submit Idea</h3>
            <p className="text-sm text-white/80 mt-1">Suggest an improvement</p>
          </div>
          <Lightbulb size={24} />
        </button>
        <button
          onClick={() => navigate('/training')}
          className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 p-6 text-white text-left hover:opacity-90 transition-opacity cursor-pointer"
        >
          <div>
            <h3 className="text-lg font-bold">My Training</h3>
            <p className="text-sm text-white/80 mt-1">View your training path</p>
          </div>
          <GraduationCap size={24} />
        </button>
      </div>
    </div>
  );
}
