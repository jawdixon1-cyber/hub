import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  CalendarOff,
  Megaphone,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStoreContext';
import { useAuth } from '../../contexts/AuthContext';

export default function ManagementSection() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const permissions = useAppStore((s) => s.permissions);


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
          onClick={() => navigate('/hr')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-default bg-card text-secondary text-sm font-semibold hover:bg-surface hover:border-border-strong transition-colors cursor-pointer shadow-sm"
        >
          <CalendarOff size={16} className="text-cyan-500" />
          Time Off
        </button>
        <div className="w-px h-6 bg-border-strong mx-12 hidden sm:block" />
      </div>

    </div>
  );
}
