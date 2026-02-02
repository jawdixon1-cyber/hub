import { useState } from 'react';
import {
  ChevronDown,
  ClipboardList,
  AlertTriangle,
  CircleCheck,
} from 'lucide-react';
import ManagementSection from '../components/owner/ManagementSection';
import MyDaySection from '../components/owner/MyDaySection';
import { genId } from '../data';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function OwnerDashboard() {
  const { currentUser } = useAuth();

  const timeOffRequests = useAppStore((s) => s.timeOffRequests);
  const setTimeOffRequests = useAppStore((s) => s.setTimeOffRequests);
  const equipment = useAppStore((s) => s.equipment);
  const setEquipment = useAppStore((s) => s.setEquipment);
  const suggestions = useAppStore((s) => s.suggestions);
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const equipmentRepairLog = useAppStore((s) => s.equipmentRepairLog);
  const setEquipmentRepairLog = useAppStore((s) => s.setEquipmentRepairLog);

  const hasActionItems = equipment.some((e) => e.status === 'needs-repair') || timeOffRequests.some((r) => r.status === 'pending') || suggestions.some((s) => s.status === 'New');
  const [showActionRequired, setShowActionRequired] = useState(hasActionItems);
  const [showManagement, setShowManagement] = useState(false);

  const pendingPTO = timeOffRequests.filter((r) => r.status === 'pending');
  const repairEquipment = equipment.filter((e) => e.status === 'needs-repair');
  const newSuggestions = suggestions.filter((s) => s.status === 'New');

  const handleApprove = (id) => {
    setTimeOffRequests(timeOffRequests.map((r) => (r.id === id ? { ...r, status: 'approved' } : r)));
  };

  const handleDeny = (id) => {
    setTimeOffRequests(timeOffRequests.map((r) => (r.id === id ? { ...r, status: 'denied' } : r)));
  };

  const handleMarkRepaired = (id) => {
    const today = new Date().toLocaleDateString('en-US');
    const eq = equipment.find((e) => e.id === id);
    if (eq && eq.reportedIssue) {
      const logEntry = {
        id: genId(),
        equipmentName: eq.name,
        issue: eq.reportedIssue,
        reportedBy: eq.reportedBy || 'Unknown',
        reportedDate: eq.reportedDate || today,
        repairedDate: today,
        urgency: eq.urgency || 'maintenance',
      };
      setEquipmentRepairLog((prev) => [logEntry, ...prev]);
    }
    setEquipment(
      equipment.map((e) =>
        e.id === id
          ? { ...e, status: 'operational', reportedIssue: undefined, reportedBy: undefined, reportedDate: undefined, urgency: undefined, photo: undefined }
          : e
      )
    );
  };

  const handleIdeaStatus = (id, status) => {
    setSuggestions(suggestions.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const actionItems = [];
  repairEquipment
    .filter((eq) => eq.urgency === 'critical')
    .forEach((eq) => actionItems.push({ kind: 'repair', data: eq }));
  pendingPTO.forEach((req) => actionItems.push({ kind: 'pto', data: req }));
  repairEquipment
    .filter((eq) => eq.urgency !== 'critical')
    .forEach((eq) => actionItems.push({ kind: 'repair', data: eq }));
  newSuggestions.forEach((idea) => actionItems.push({ kind: 'idea', data: idea }));

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-4 sm:p-6">
        <h2 className="text-lg font-bold text-primary mb-3">Business Health</h2>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-surface rounded-xl p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-tertiary font-medium">Labor Efficiency</p>
            <p className="text-xl sm:text-3xl font-bold text-primary mt-1">40%</p>
          </div>
          <div className="bg-surface rounded-xl p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-tertiary font-medium">Sales Efficiency</p>
            <p className="text-xl sm:text-3xl font-bold text-primary mt-1">60%</p>
          </div>
          <div className="bg-surface rounded-xl p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-tertiary font-medium truncate">Revenue / Man-Hr</p>
            <p className="text-xl sm:text-3xl font-bold text-primary mt-1">$70/hr</p>
          </div>
        </div>
      </div>

      {/* Action Required */}
      <button
        onClick={() => setShowActionRequired((v) => !v)}
        className="flex items-center gap-3 pt-4 w-full cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          {actionItems.length > 0 ? <AlertTriangle size={20} className="text-amber-500" /> : <CircleCheck size={20} className="text-emerald-500" />}
          <h2 className="text-xl font-bold text-primary">Action Required</h2>
          {actionItems.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
              {actionItems.length}
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
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-emerald-400" />
            <p className="text-sm font-semibold text-emerald-700">All clear — nothing needs your attention right now</p>
          </div>
        ) : (
          <div className="space-y-3">
            {actionItems.map((item) => {
              if (item.kind === 'repair') {
                const eq = item.data;
                return (
                  <div key={`repair-${eq.id}`} className="rounded-xl border border-red-200 bg-red-50/50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-500">Equipment Repair</span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              eq.urgency === 'critical'
                                ? 'bg-red-600 text-white'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {eq.urgency === 'critical' ? 'CRITICAL' : 'MAINTENANCE'}
                          </span>
                        </div>
                        <h4 className="font-bold text-primary mt-1">{eq.name}</h4>
                        {eq.reportedIssue && <p className="text-sm text-secondary mt-0.5">{eq.reportedIssue}</p>}
                      </div>
                      <button
                        onClick={() => handleMarkRepaired(eq.id)}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
                      >
                        Mark Fixed
                      </button>
                    </div>
                  </div>
                );
              }
              if (item.kind === 'pto') {
                const req = item.data;
                return (
                  <div key={`pto-${req.id}`} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Time Off Request</span>
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
                  <div key={`idea-${idea.id}`} className="rounded-xl border border-purple-300 bg-purple-50 p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Team Idea</span>
                    <h4 className="font-bold text-primary mt-1">{idea.title}</h4>
                    <p className="text-sm text-secondary mt-0.5">{idea.description}</p>
                    <p className="text-xs text-muted mt-1">By {idea.submittedBy} &middot; {idea.date}</p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleIdeaStatus(idea.id, 'Approved')}
                        className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 text-xs font-semibold hover:opacity-80 transition-colors cursor-pointer"
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
                        className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-semibold hover:opacity-80 transition-colors cursor-pointer"
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

      {/* Apps dock — fixed to right edge on desktop */}
      <div className="hidden lg:flex fixed right-4 top-1/2 -translate-y-1/2 z-30 flex-col items-center gap-3 bg-card/90 backdrop-blur-sm rounded-2xl border border-border-subtle shadow-lg p-3">
        {[
          { name: 'Jobber', url: 'https://getjobber.com', bg: 'bg-[#1a3a3a]', icon: 'J', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://getjobber.com&size=128' },
          { name: 'GoHighLevel', url: 'https://app.gohighlevel.com', bg: 'bg-[#1a2332]', icon: 'G', logo: '/logos/ghl-icon.jpg' },
          { name: 'QuickBooks', url: 'https://quickbooks.intuit.com', bg: 'bg-[#2ca01c]', icon: 'QB', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://quickbooks.intuit.com&size=128' },
          { name: 'ADP', url: 'https://my.adp.com', bg: 'bg-[#d0271d]', icon: 'ADP', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://adp.com&size=128' },
          { name: 'Canva', url: 'https://www.canva.com', bg: 'bg-[#00c4cc]', icon: 'C', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://canva.com&size=128' },
          { name: 'ChatGPT', url: 'https://chat.openai.com', bg: 'bg-[#10a37f]', icon: 'AI', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://chat.openai.com&size=128' },
          { name: 'Gemini', url: 'https://gemini.google.com', bg: 'bg-white', icon: 'Ge', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://gemini.google.com&size=128' },
          { name: 'Claude', url: 'https://claude.ai', bg: 'bg-[#d97757]', icon: 'Cl', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://claude.ai&size=128' },
        ].map((app) => (
          <a
            key={app.name}
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            title={app.name}
            className="group relative"
          >
            <div className={`w-10 h-10 rounded-xl ${app.bg} flex items-center justify-center text-white font-bold text-xs shadow-sm hover:scale-110 transition-transform overflow-hidden`}>
              <img
                src={app.logo}
                alt={app.name}
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = ''; }}
              />
              <span style={{ display: 'none' }}>{app.icon}</span>
            </div>
            <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg bg-gray-900 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {app.name}
            </span>
          </a>
        ))}
      </div>

      {/* Management */}
      <button
        onClick={() => setShowManagement((v) => !v)}
        className="flex items-center gap-3 pt-4 w-full cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <ClipboardList size={20} className="text-brand-text" />
          <h2 className="text-xl font-bold text-primary">Management</h2>
        </div>
        <div className="flex-1 h-px bg-border-default" />
        <ChevronDown
          size={20}
          className={`text-muted group-hover:text-secondary transition-transform duration-200 ${showManagement ? '' : '-rotate-90'}`}
        />
      </button>

      {showManagement && <ManagementSection />}

      {/* Daily Checklists */}
      <MyDaySection />

    </div>
  );
}
