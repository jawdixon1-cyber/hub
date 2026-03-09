import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Send, RefreshCw, Loader2, CheckCircle2, XCircle, Phone, MapPin,
  CalendarDays, Settings, X, Bell, BellOff,
} from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';

/* ── Helpers ── */

function getTomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function formatDateNice(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/* ── Settings Modal ── */

function SettingsPanel({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...settings });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-bold text-primary">Message Settings</h2>
          <button onClick={onClose} className="text-muted hover:text-primary cursor-pointer"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-primary mb-1.5">Message Template</label>
            <textarea
              value={draft.messageTemplate}
              onChange={(e) => setDraft({ ...draft, messageTemplate: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-border-strong bg-card px-3 py-2.5 text-sm text-primary outline-none resize-y"
            />
            <p className="text-[10px] text-muted mt-1">
              Variables: {'{{firstName}}'}, {'{{serviceDate}}'}, {'{{companyName}}'}, {'{{address}}'}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Preview</p>
            <div className="bg-surface-alt rounded-lg px-3 py-2 text-sm text-secondary">
              {(draft.messageTemplate || '')
                .replace(/\{\{firstName\}\}/g, 'John')
                .replace(/\{\{serviceDate\}\}/g, 'Monday, March 10')
                .replace(/\{\{companyName\}\}/g, "Hey Jude's Lawn Care")
                .replace(/\{\{address\}\}/g, '123 Main St')}
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-border-subtle">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border-strong text-secondary text-sm font-semibold hover:bg-surface-alt transition-colors cursor-pointer">
            Cancel
          </button>
          <button
            onClick={() => { onSave(draft); onClose(); }}
            className="flex-1 py-2.5 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ── */

export default function MowingSchedule() {
  const mowingSettings = useAppStore(s => s.mowingSettings);
  const setMowingSettings = useAppStore(s => s.setMowingSettings);
  const mowingNotifications = useAppStore(s => s.mowingNotifications);
  const setMowingNotifications = useAppStore(s => s.setMowingNotifications);

  const [allVisits, setAllVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState(null);

  const tomorrowStr = getTomorrowStr();

  // Fetch schedule
  const fetchSchedule = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/mowing?weeks=1${refresh ? '&refresh=1' : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setAllVisits(data.visits || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  // Tomorrow's visits only
  const tomorrowVisits = useMemo(
    () => allVisits.filter(v => v.date === tomorrowStr),
    [allVisits, tomorrowStr]
  );

  // Notification status map
  const notifMap = useMemo(() => {
    const map = {};
    for (const n of mowingNotifications) {
      const key = n.dedupeKey || n.visitId;
      if (!map[key] || n.sentAt > map[key].sentAt) map[key] = n;
    }
    return map;
  }, [mowingNotifications]);

  const getNotifStatus = (visit) => {
    const key = `${visit.jobId}-${visit.date}`;
    return notifMap[key]?.status || null;
  };

  const sentCount = tomorrowVisits.filter(v => getNotifStatus(v) === 'sent').length;
  const allSent = tomorrowVisits.length > 0 && sentCount === tomorrowVisits.length;

  // Send reminders to all tomorrow's visits
  const sendAll = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/mowing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch', visits: tomorrowVisits }),
      });
      const data = await res.json();
      // Refresh notification log
      const logRes = await fetch('/api/mowing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'log' }),
      });
      const logData = await logRes.json();
      setMowingNotifications(logData.log || []);
      setToast(`Sent: ${data.sent} | Skipped: ${data.skipped} | Failed: ${data.failed}`);
    } catch (err) {
      setToast(`Error: ${err.message}`);
    } finally {
      setSending(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">Visit Reminders</h1>
          <p className="text-xs text-muted">Tomorrow &middot; {formatDateNice(tomorrowStr)}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchSchedule(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-secondary hover:bg-surface-alt transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-secondary hover:bg-surface-alt transition-colors cursor-pointer"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Big send button */}
      {!loading && tomorrowVisits.length > 0 && (
        <button
          onClick={sendAll}
          disabled={sending || allSent}
          className={`w-full py-4 rounded-2xl text-base font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
            allSent
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-brand text-on-brand hover:bg-brand-hover'
          } disabled:opacity-60`}
        >
          {sending ? (
            <><Loader2 size={20} className="animate-spin" /> Sending...</>
          ) : allSent ? (
            <><CheckCircle2 size={20} /> All {sentCount} Reminders Sent</>
          ) : sentCount > 0 ? (
            <><Send size={20} /> Send Remaining ({tomorrowVisits.length - sentCount} left)</>
          ) : (
            <><Send size={20} /> Send All Reminders ({tomorrowVisits.length} clients)</>
          )}
        </button>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 size={32} className="text-brand animate-spin mb-3" />
          <p className="text-sm text-muted">Loading from Jobber...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button onClick={() => fetchSchedule(true)} className="text-xs font-semibold text-red-600 mt-2 cursor-pointer hover:underline">
            Retry
          </button>
        </div>
      )}

      {/* No visits */}
      {!loading && !error && tomorrowVisits.length === 0 && (
        <div className="text-center py-12">
          <CalendarDays size={40} className="text-muted mx-auto mb-3" />
          <p className="text-sm text-muted">No visits scheduled for tomorrow</p>
        </div>
      )}

      {/* Client list */}
      {tomorrowVisits.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            {tomorrowVisits.length} visit{tomorrowVisits.length !== 1 ? 's' : ''} tomorrow
          </p>
          {tomorrowVisits.map(v => {
            const status = getNotifStatus(v);
            return (
              <div
                key={v.id}
                className={`bg-card rounded-xl border px-4 py-3 flex items-center gap-3 ${
                  status === 'sent' ? 'border-emerald-200 dark:border-emerald-800' :
                  status === 'failed' ? 'border-red-200 dark:border-red-800' :
                  'border-border-subtle'
                }`}
              >
                {/* Status icon */}
                <div className="shrink-0">
                  {status === 'sent' ? (
                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Bell size={14} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                  ) : status === 'failed' ? (
                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <BellOff size={14} className="text-red-500" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-alt flex items-center justify-center">
                      <Send size={14} className="text-muted" />
                    </div>
                  )}
                </div>

                {/* Client info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary truncate">{v.clientName}</p>
                  <p className="text-xs text-muted truncate flex items-center gap-1">
                    <MapPin size={10} className="shrink-0" />
                    {v.address || 'No address'}
                  </p>
                </div>

                {/* Phone */}
                {v.phone && (
                  <a href={`tel:${v.phone}`} className="shrink-0 text-brand-text-strong hover:underline">
                    <Phone size={14} />
                  </a>
                )}

                {/* Status text */}
                <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${
                  status === 'sent' ? 'text-emerald-600 dark:text-emerald-400' :
                  status === 'failed' ? 'text-red-500' :
                  'text-muted'
                }`}>
                  {status === 'sent' ? 'Sent' : status === 'failed' ? 'Failed' : 'Pending'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsPanel
          settings={mowingSettings}
          onSave={setMowingSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-border-subtle shadow-xl rounded-xl px-5 py-3 text-sm font-semibold text-primary animate-[fadeIn_0.2s]">
          {toast}
        </div>
      )}
    </div>
  );
}
