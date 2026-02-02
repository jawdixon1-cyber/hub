import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lightbulb,
  Calendar,
  ClipboardList,
  CalendarOff,
  Megaphone,
} from 'lucide-react';
import AnnouncementEditorModal from '../AnnouncementEditorModal';
import ChecklistTracker from '../ChecklistTracker';
import { useAppStore } from '../../store/AppStoreContext';
import { useAuth } from '../../contexts/AuthContext';

export default function ManagementSection() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const announcements = useAppStore((s) => s.announcements);
  const setAnnouncements = useAppStore((s) => s.setAnnouncements);
  const archivedAnnouncements = useAppStore((s) => s.archivedAnnouncements);
  const setArchivedAnnouncements = useAppStore((s) => s.setArchivedAnnouncements);
  const permissions = useAppStore((s) => s.permissions);
  const timeOffRequests = useAppStore((s) => s.timeOffRequests);
  const teamChecklist = useAppStore((s) => s.teamChecklist);
  const teamEndChecklist = useAppStore((s) => s.teamEndChecklist);
  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist);
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist);
  const checklistLog = useAppStore((s) => s.checklistLog);

  const [showAnnouncementEditor, setShowAnnouncementEditor] = useState(false);

  const teamEmails = Object.keys(permissions || {});
  const totalUnacknowledged = teamEmails.reduce((sum, email) => {
    return sum + announcements.filter((a) => !a.acknowledgedBy?.[email]).length;
  }, 0);

  const getWeekBounds = (weekOffset) => {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + weekOffset * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  };

  const parseMMDDYYYY = (str) => {
    const parts = str.split('/');
    return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
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

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate('/equipment')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-default bg-card text-secondary text-sm font-semibold hover:bg-surface hover:border-border-strong transition-colors cursor-pointer shadow-sm"
        >
          <ClipboardList size={16} className="text-purple-500" />
          Repairs
        </button>
        <button
          onClick={() => navigate('/ideas')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-default bg-card text-secondary text-sm font-semibold hover:bg-surface hover:border-border-strong transition-colors cursor-pointer shadow-sm"
        >
          <Lightbulb size={16} className="text-amber-500" />
          Ideas
        </button>
        <button
          onClick={() => navigate('/hr')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-default bg-card text-secondary text-sm font-semibold hover:bg-surface hover:border-border-strong transition-colors cursor-pointer shadow-sm"
        >
          <CalendarOff size={16} className="text-cyan-500" />
          Time Off
        </button>
        <div className="w-px h-6 bg-border-strong mx-12 hidden sm:block" />
        <button
          onClick={() => setShowAnnouncementEditor(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-default bg-card text-secondary text-sm font-semibold hover:bg-surface hover:border-border-strong transition-colors cursor-pointer shadow-sm"
        >
          <Megaphone size={16} className="text-brand-text" />
          Announcements
          {totalUnacknowledged > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {totalUnacknowledged}
            </span>
          )}
        </button>
      </div>

      {/* Team Availability */}
      <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={16} className="text-blue-500" />
          <h3 className="text-sm font-bold text-primary">Team Availability</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((offset) => {
            const ptoList = getApprovedPTOForWeek(offset);
            return (
              <div key={offset} className="flex items-start gap-3">
                <div className="shrink-0">
                  <p className="text-xs font-semibold text-secondary">{offset === 0 ? 'This Week' : 'Next Week'}</p>
                  <p className="text-[11px] text-muted">{formatWeekRange(offset)}</p>
                </div>
                {ptoList.length === 0 ? (
                  <span className="text-xs text-brand-text font-medium mt-0.5">Full team</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {ptoList.map((r) => (
                      <span key={r.id} className="text-xs bg-blue-50 text-blue-700 font-medium px-2 py-0.5 rounded-full">
                        {r.name} ({r.days}d)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Checklist Tracker */}
      <ChecklistTracker checklistLog={checklistLog} />

      {/* Announcement Editor Modal */}
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
