import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lightbulb,
  ClipboardList,
  CalendarOff,
  Megaphone,
} from 'lucide-react';
import AnnouncementEditorModal from '../AnnouncementEditorModal';
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

  const [showAnnouncementEditor, setShowAnnouncementEditor] = useState(false);

  const teamEmails = Object.keys(permissions || {});
  const totalUnacknowledged = teamEmails.reduce((sum, email) => {
    return sum + announcements.filter((a) => !a.acknowledgedBy?.[email]).length;
  }, 0);

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
