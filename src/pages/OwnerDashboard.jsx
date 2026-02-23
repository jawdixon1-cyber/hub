import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ClipboardList,
  AlertTriangle,
  CircleCheck,
  Eye,
  X,
  ExternalLink,
  Trash2,
  Plus,
  Calculator,
  Calendar,
  Gauge,
  Lightbulb,
  UserCog,
  Megaphone,
} from 'lucide-react';
import { EQUIPMENT_TYPES, genId, getActiveRepairs } from '../data';
import ManagementSection from '../components/owner/ManagementSection';
import AnnouncementEditorModal from '../components/AnnouncementEditorModal';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function parseMMDDYYYY(str) {
  const parts = str.split('/');
  return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
}

export default function OwnerDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const timeOffRequests = useAppStore((s) => s.timeOffRequests);
  const setTimeOffRequests = useAppStore((s) => s.setTimeOffRequests);
  const equipment = useAppStore((s) => s.equipment);
  const setEquipment = useAppStore((s) => s.setEquipment);
  const suggestions = useAppStore((s) => s.suggestions);
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const equipmentRepairLog = useAppStore((s) => s.equipmentRepairLog);
  const setEquipmentRepairLog = useAppStore((s) => s.setEquipmentRepairLog);
  const quotes = useAppStore((s) => s.quotes) || [];
  const permissions = useAppStore((s) => s.permissions);
  const announcements = useAppStore((s) => s.announcements);
  const setAnnouncements = useAppStore((s) => s.setAnnouncements);
  const archivedAnnouncements = useAppStore((s) => s.archivedAnnouncements);
  const setArchivedAnnouncements = useAppStore((s) => s.setArchivedAnnouncements);

  const equipmentCategories = useAppStore((s) => s.equipmentCategories);
  const allTypes = equipmentCategories?.length > 0 ? equipmentCategories : EQUIPMENT_TYPES;

  const pendingPTO = timeOffRequests.filter((r) => r.status === 'pending');
  const repairEquipment = equipment.filter((e) => e.status === 'needs-repair');
  const newSuggestions = suggestions.filter((s) => s.status === 'New' && s.type !== 'onboarding');

  const hasActionItems = repairEquipment.length > 0 || pendingPTO.length > 0 || newSuggestions.length > 0;
  const [showActionRequired, setShowActionRequired] = useState(false);
  const [showManagement, setShowManagement] = useState(false);
  const [viewingRepair, setViewingRepair] = useState(null);
  const [fixingRepairId, setFixingRepairId] = useState(null);
  const [fixDescription, setFixDescription] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAnnouncementEditor, setShowAnnouncementEditor] = useState(false);

  // Auto-open announcement editor from query param
  useEffect(() => {
    if (searchParams.get('announce') === '1') {
      setShowAnnouncementEditor(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // ─── Greeting ───
  const firstName = currentUser?.split(' ')[0] || 'Boss';
  const formattedDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // ─── Team out today ───
  const today = new Date();
  const teamOutToday = timeOffRequests.filter((r) => {
    if (r.status !== 'approved') return false;
    const start = parseMMDDYYYY(r.startDate);
    const end = parseMMDDYYYY(r.endDate);
    return start <= today && end >= today;
  });

  // ─── Team availability (this week / next week) ───
  const getWeekBounds = (weekOffset) => {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + weekOffset * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  };

  const getApprovedPTOForWeek = (weekOffset) => {
    const { start, end } = getWeekBounds(weekOffset);
    return timeOffRequests.filter((r) => {
      if (r.status !== 'approved') return false;
      const ptoStart = parseMMDDYYYY(r.startDate);
      const ptoEnd = parseMMDDYYYY(r.endDate);
      return ptoStart <= end && ptoEnd >= start;
    });
  };

  const formatWeekRange = (weekOffset) => {
    const { start, end } = getWeekBounds(weekOffset);
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    return `${fmt(start)} - ${fmt(end)}`;
  };

  // ─── Action items ───
  const handleApprove = (id) => {
    setTimeOffRequests(timeOffRequests.map((r) => (r.id === id ? { ...r, status: 'approved' } : r)));
  };

  const handleDeny = (id) => {
    setTimeOffRequests(timeOffRequests.map((r) => (r.id === id ? { ...r, status: 'denied' } : r)));
  };

  const handleMarkRepairFixed = (eqId, repairId, fixDesc) => {
    const today = new Date().toLocaleDateString('en-US');
    const eq = equipment.find((e) => e.id === eqId);
    if (!eq) return;

    const repairs = getActiveRepairs(eq);
    const repair = repairs.find((r) => r.id === repairId);
    if (repair) {
      const logEntry = {
        id: genId(),
        equipmentId: eq.id,
        equipmentName: eq.name,
        issue: repair.issue,
        fixDescription: fixDesc || '',
        reportedBy: repair.reportedBy || 'Unknown',
        reportedDate: repair.reportedDate || today,
        repairedDate: today,
        urgency: repair.urgency || 'maintenance',
      };
      setEquipmentRepairLog((prev) => [logEntry, ...prev]);
    }

    const remaining = repairs.filter((r) => r.id !== repairId);
    setEquipment(
      equipment.map((e) =>
        e.id === eqId
          ? {
              ...e,
              activeRepairs: remaining,
              status: remaining.length > 0 ? 'needs-repair' : 'operational',
              reportedIssue: undefined,
              reportedBy: undefined,
              reportedDate: undefined,
              urgency: undefined,
              photo: undefined,
            }
          : e
      )
    );
  };

  const handleDeleteRepair = (eqId, repairId) => {
    const eq = equipment.find((e) => e.id === eqId);
    if (!eq) return;
    const remaining = getActiveRepairs(eq).filter((r) => r.id !== repairId);
    setEquipment(
      equipment.map((e) =>
        e.id === eqId
          ? {
              ...e,
              activeRepairs: remaining,
              status: remaining.length > 0 ? 'needs-repair' : 'operational',
              reportedIssue: undefined,
              reportedBy: undefined,
              reportedDate: undefined,
              urgency: undefined,
              photo: undefined,
            }
          : e
      )
    );
  };

  const handleIdeaStatus = (id, status) => {
    setSuggestions(suggestions.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const parseUSDate = (str) => {
    if (!str) return 0;
    const parts = str.split('/');
    if (parts.length === 3) return new Date(parts[2], parts[0] - 1, parts[1]).getTime();
    return new Date(str).getTime() || 0;
  };
  const getItemDate = (item) => {
    if (item.kind === 'repair') {
      return item.repairs.reduce((latest, r) => {
        const d = parseUSDate(r.reportedDate);
        return d > parseUSDate(latest) ? r.reportedDate : latest;
      }, item.repairs[0]?.reportedDate || '');
    }
    if (item.kind === 'pto') return item.data.requestedDate;
    if (item.kind === 'idea') return item.data.date;
    return '';
  };

  const actionItems = [];
  repairEquipment.forEach((eq) => {
    const repairs = getActiveRepairs(eq);
    if (repairs.length > 0) actionItems.push({ kind: 'repair', data: eq, repairs });
  });
  pendingPTO.forEach((req) => actionItems.push({ kind: 'pto', data: req }));
  newSuggestions.forEach((idea) => actionItems.push({ kind: 'idea', data: idea }));
  actionItems.sort((a, b) => parseUSDate(getItemDate(b)) - parseUSDate(getItemDate(a)));
  const totalActionCount = actionItems.reduce((n, item) => n + (item.kind === 'repair' ? item.repairs.length : 1), 0);

  // ─── Recent quotes ───
  const recentQuotes = quotes.slice(0, 3);
  const fmtDollar = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-8">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold text-primary">Manage</h1>
        <p className="text-sm text-muted">{formattedDate}</p>
      </div>

      {/* ─── Quick Actions ─── */}
      <div className="flex gap-3">
        <button onClick={() => setShowAnnouncementEditor(true)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border-default text-sm font-semibold text-secondary hover:bg-surface-alt transition-colors cursor-pointer">
          <Megaphone size={16} />
          Announcement
        </button>
        <button onClick={() => navigate('/quoting')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border-default text-sm font-semibold text-secondary hover:bg-surface-alt transition-colors cursor-pointer">
          <Plus size={16} />
          New Quote
        </button>
      </div>

      {/* ─── At a Glance ─── */}
      <div className="flex gap-6">
        <div>
          <p className="text-xs text-muted">Actions</p>
          <p className={`text-lg font-bold ${totalActionCount > 0 ? 'text-amber-600' : 'text-muted'}`}>{totalActionCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Equipment Down</p>
          <p className={`text-lg font-bold ${repairEquipment.length > 0 ? 'text-red-600' : 'text-muted'}`}>{repairEquipment.length}</p>
        </div>
      </div>

      {/* ─── Action Required (auto-expanded when items exist) ─── */}
      <button
        onClick={() => setShowActionRequired((v) => !v)}
        className="flex items-center gap-3 pt-2 w-full cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          {totalActionCount > 0 ? <AlertTriangle size={20} className="text-amber-500" /> : <CircleCheck size={20} className="text-emerald-500" />}
          <h2 className="text-xl font-bold text-primary">Action Required</h2>
          {totalActionCount > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {totalActionCount}
            </span>
          )}
        </div>
        <div className="flex-1 h-px bg-border-default" />
        <ChevronDown
          size={20}
          className={`text-muted group-hover:text-secondary transition-transform duration-200 ${showActionRequired ? '' : '-rotate-90'}`}
        />
      </button>

      {showActionRequired && (
        actionItems.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 p-5 flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-emerald-400" />
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">All clear — nothing needs your attention right now</p>
          </div>
        ) : (
          <div className="space-y-3">
            {actionItems.map((item) => {
              if (item.kind === 'repair') {
                const eq = item.data;
                const repairs = item.repairs;
                const typeLabel = allTypes.find((t) => t.value === eq.type)?.label || eq.type;
                return (
                  <div key={`repair-eq-${eq.id}`} className="rounded-xl border-2 border-red-400 bg-red-50 dark:bg-red-950/40 dark:border-red-700 p-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Equipment Repair</span>
                      {repairs.length > 1 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-200 text-red-700 dark:bg-red-800 dark:text-red-200">
                          {repairs.length} issues
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-primary mt-1">{eq.name}</h4>
                    <p className="text-xs text-muted">{typeLabel}</p>

                    <div className={`mt-3 ${repairs.length > 1 ? 'space-y-3' : ''}`}>
                      {repairs.map((r) => (
                        <div key={r.id} className={repairs.length > 1 ? 'pt-3 border-t border-red-200 dark:border-red-800' : ''}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-secondary">{r.issue}</p>
                              <p className="text-xs text-muted mt-0.5">Reported by {r.reportedBy} on {r.reportedDate}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => setViewingRepair({ eq, repair: r })}
                                className="px-3 py-1.5 rounded-lg border border-border-strong text-secondary text-xs font-semibold hover:bg-surface transition-colors cursor-pointer"
                              >
                                <Eye size={14} className="inline -mt-0.5 mr-1" />
                                View
                              </button>
                              <button
                                onClick={() => { if (confirm('Delete this repair report?')) handleDeleteRepair(eq.id, r.id); }}
                                className="p-1.5 rounded-lg text-muted hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                title="Delete repair"
                              >
                                <Trash2 size={14} />
                              </button>
                              {fixingRepairId !== r.id && (
                                <button
                                  onClick={() => { setFixingRepairId(r.id); setFixDescription(''); }}
                                  className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
                                >
                                  Mark Fixed
                                </button>
                              )}
                            </div>
                          </div>
                          {fixingRepairId === r.id && (
                            <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800 space-y-2">
                              <label className="block text-xs font-semibold text-secondary">What was fixed?</label>
                              <textarea
                                value={fixDescription}
                                onChange={(e) => setFixDescription(e.target.value)}
                                placeholder="e.g. Replaced spark plug, cleaned carburetor..."
                                rows={2}
                                className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                                autoFocus
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => setFixingRepairId(null)}
                                  className="px-3 py-1.5 rounded-lg border border-border-strong text-secondary text-xs font-semibold hover:bg-surface transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => {
                                    handleMarkRepairFixed(eq.id, r.id, fixDescription);
                                    setFixingRepairId(null);
                                    setFixDescription('');
                                  }}
                                  disabled={!fixDescription.trim()}
                                  className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  Save & Mark Fixed
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              if (item.kind === 'pto') {
                const req = item.data;
                return (
                  <div key={`pto-${req.id}`} className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/40 p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Time Off Request</span>
                    <h4 className="font-bold text-primary mt-1">{req.name}</h4>
                    <p className="text-sm text-secondary mt-0.5">
                      {req.startDate} - {req.endDate} ({req.days} day{req.days > 1 ? 's' : ''}) &middot; {req.reason}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleApprove(req.id)}
                        className="px-4 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleDeny(req.id)}
                        className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors cursor-pointer"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                );
              }
              if (item.kind === 'idea') {
                const idea = item.data;
                return (
                  <div key={`idea-${idea.id}`} className="rounded-xl border border-purple-300 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/40 p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Team Idea</span>
                    <h4 className="font-bold text-primary mt-1">{idea.title}</h4>
                    <p className="text-sm text-secondary mt-0.5">{idea.description}</p>
                    <p className="text-xs text-muted mt-1">By {idea.submittedBy} &middot; {idea.date}</p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleIdeaStatus(idea.id, 'Approved')}
                        className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs font-semibold hover:opacity-80 transition-colors cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleIdeaStatus(idea.id, 'Implemented')}
                        className="px-3 py-1.5 rounded-lg bg-brand-light text-brand-text-strong text-xs font-semibold hover:opacity-80 transition-colors cursor-pointer"
                      >
                        Implemented
                      </button>
                      <button
                        onClick={() => handleIdeaStatus(idea.id, 'Rejected')}
                        className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-xs font-semibold hover:opacity-80 transition-colors cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        )
      )}

      {/* ─── Recent Quotes ─── */}
      {recentQuotes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Recent Quotes</p>
            <button onClick={() => navigate('/quoting')} className="text-xs font-medium text-brand-text-strong hover:underline cursor-pointer">
              View all
            </button>
          </div>
          <div className="space-y-2">
            {recentQuotes.map((q) => (
              <div key={q.id} className="flex items-center justify-between py-1.5">
                <div>
                  <p className="text-sm font-medium text-primary">{q.clientName}</p>
                  <p className="text-xs text-muted">{q.date}</p>
                </div>
                <p className="text-sm font-semibold text-primary">${fmtDollar(q.total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── View Repair Equipment Modal ─── */}
      {viewingRepair && (() => {
        const eq = viewingRepair.eq;
        const repair = viewingRepair.repair;
        const typeLabel = allTypes.find((t) => t.value === eq.type)?.label || eq.type;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-red-500 to-orange-500 px-8 py-6 relative shrink-0">
                <button
                  onClick={() => setViewingRepair(null)}
                  className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={24} />
                </button>
                <h2 className="text-2xl font-bold text-white">{eq.name}</h2>
                <p className="text-white/80 text-sm mt-1">{typeLabel}</p>
              </div>
              <div className="p-6 overflow-y-auto space-y-4">
                <div>
                  <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-1">Problem</p>
                  <p className="text-sm text-primary bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg p-3">{repair.issue}</p>
                </div>
                {repair.reportedBy && (
                  <div className="flex gap-6">
                    <div>
                      <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-1">Reported By</p>
                      <p className="text-sm text-primary">{repair.reportedBy}</p>
                    </div>
                    {repair.reportedDate && (
                      <div>
                        <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-1">Date</p>
                        <p className="text-sm text-primary">{repair.reportedDate}</p>
                      </div>
                    )}
                  </div>
                )}
                {eq.serialNumber && (
                  <div>
                    <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-1">Serial Number</p>
                    <p className="text-sm text-primary font-mono">{eq.serialNumber}</p>
                  </div>
                )}
                {eq.manualUrl && eq.manualUrl !== 'unknown' && (
                  <div>
                    <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-1">Manual</p>
                    <a
                      href={eq.manualUrl.startsWith('http') ? eq.manualUrl : `https://${eq.manualUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-brand-text font-medium hover:underline"
                    >
                      <ExternalLink size={14} />
                      Open Manual
                    </a>
                  </div>
                )}
                {eq.manualUrl === 'unknown' && (
                  <div>
                    <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-1">Manual</p>
                    <p className="text-sm text-muted italic">Unknown</p>
                  </div>
                )}
                {repair.photo && (
                  <div>
                    <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-1">Photo</p>
                    <img src={repair.photo} alt="Issue" className="rounded-lg max-h-48 object-cover" />
                  </div>
                )}
                {eq.notes && (
                  <div>
                    <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-1">Notes</p>
                    <p className="text-sm text-primary">{eq.notes}</p>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-border-default shrink-0 flex justify-end">
                <button
                  onClick={() => setViewingRepair(null)}
                  className="px-5 py-2.5 rounded-lg border border-border-strong text-secondary font-medium hover:bg-surface transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Announcement Editor Modal ─── */}
      {showAnnouncementEditor && (
        <AnnouncementEditorModal
          onClose={() => setShowAnnouncementEditor(false)}
          announcements={announcements}
          setAnnouncements={setAnnouncements}
          archivedAnnouncements={archivedAnnouncements}
          setArchivedAnnouncements={setArchivedAnnouncements}
          currentUser={currentUser}
          permissions={permissions}
        />
      )}
    </div>
  );
}
