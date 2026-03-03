import { useState } from 'react';
import {
  Gauge, Plus, Search, ChevronDown, ChevronLeft, ChevronRight,
  Trash2, X, Link2, Check,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import MileageModal from '../components/MileageModal';
import { genId } from '../data';

const PER_PAGE_OPTIONS = [20, 30, 40];

export default function MileageLog() {
  const { currentUser, ownerMode } = useAuth();

  const vehicles = useAppStore((s) => s.vehicles);
  const setVehicles = useAppStore((s) => s.setVehicles);
  const mileageLog = useAppStore((s) => s.mileageLog);
  const setMileageLog = useAppStore((s) => s.setMileageLog);

  const [showModal, setShowModal] = useState(false);
  const [mileageSuccess, setMileageSuccess] = useState(false);
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [perPage, setPerPage] = useState(20);
  const [page, setPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [trackFilter, setTrackFilter] = useState(ownerMode ? 'untracked' : 'all'); // 'untracked' | 'tracked' | 'all'

  // Vehicle management (owner only)
  const [showManage, setShowManage] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState('');
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [editingVehicleName, setEditingVehicleName] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  // --- Filter entries ---
  const visibleEntries = ownerMode
    ? mileageLog
    : mileageLog.filter((e) => e.loggedBy === currentUser);

  const filtered = visibleEntries.filter((entry) => {
    if (vehicleFilter !== 'all' && entry.vehicleId !== vehicleFilter) return false;
    if (ownerMode && trackFilter === 'untracked' && entry.tracked) return false;
    if (ownerMode && trackFilter === 'tracked' && !entry.tracked) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchName = (entry.vehicleName || '').toLowerCase().includes(q);
      const matchNotes = (entry.notes || '').toLowerCase().includes(q);
      const matchBy = (entry.loggedBy || '').toLowerCase().includes(q);
      if (!matchName && !matchNotes && !matchBy) return false;
    }
    return true;
  });

  const untrackedCount = visibleEntries.filter((e) => !e.tracked).length;

  const sorted = [...filtered].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * perPage, safePage * perPage);

  // Reset page when filters change
  const updateSearch = (v) => { setSearch(v); setPage(1); };
  const updateVehicleFilter = (v) => { setVehicleFilter(v); setPage(1); };
  const updatePerPage = (v) => { setPerPage(v); setPage(1); };

  // --- Mileage submit (same logic as Home.jsx) ---
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

    setShowModal(false);
    setMileageSuccess(true);
    setTimeout(() => setMileageSuccess(false), 2000);
  };

  // --- Vehicle management ---
  const handleSyncFromQB = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/qb-vehicles');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const qbVehicles = data.vehicles || [];
      if (qbVehicles.length === 0) {
        setSyncMsg('No vehicles found in QuickBooks.');
        return;
      }
      const existingNames = new Set(vehicles.map((v) => v.name.toLowerCase()));
      const newOnes = qbVehicles.filter((v) => !existingNames.has(v.name.toLowerCase()));
      if (newOnes.length === 0) {
        setSyncMsg(`All ${qbVehicles.length} QB vehicle(s) already in your list.`);
        return;
      }
      setVehicles([...vehicles, ...newOnes.map((v) => ({ id: v.id || genId(), name: v.name }))]);
      setSyncMsg(`Synced ${newOnes.length} vehicle(s) from QuickBooks!`);
    } catch (err) {
      setSyncMsg('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleAddVehicle = () => {
    const name = newVehicleName.trim();
    if (!name) return;
    setVehicles([...vehicles, { id: genId(), name }]);
    setNewVehicleName('');
  };

  const handleRemoveVehicle = (id) => {
    setVehicles(vehicles.filter((v) => v.id !== id));
  };

  const handleRenameVehicle = (id) => {
    const name = editingVehicleName.trim();
    if (!name) return;
    setVehicles(vehicles.map((v) => v.id === id ? { ...v, name } : v));
    setEditingVehicleId(null);
    setEditingVehicleName('');
  };

  const handleDeleteEntry = (id) => {
    setMileageLog(mileageLog.filter((e) => e.id !== id));
    setConfirmDeleteId(null);
  };

  const handleToggleTracked = (id) => {
    setMileageLog(mileageLog.map((e) => e.id === id ? { ...e, tracked: !e.tracked } : e));
  };

  const handleMarkAllTracked = () => {
    setMileageLog(mileageLog.map((e) => e.tracked ? e : { ...e, tracked: true }));
  };

  // --- Page numbers to display ---
  const pageNumbers = [];
  const maxVisible = 5;
  let start = Math.max(1, safePage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
  for (let i = start; i <= end; i++) pageNumbers.push(i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <Gauge size={20} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Mileage Log</h1>
            <p className="text-sm text-tertiary">
              {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
              {!ownerMode && ' (yours)'}
              {ownerMode && untrackedCount > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-semibold">
                  {untrackedCount} untracked
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ownerMode && untrackedCount > 0 && (
            <button
              onClick={handleMarkAllTracked}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600 font-semibold text-sm hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
            >
              <Check size={16} />
              Mark All Tracked
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Plus size={16} />
            Log Mileage
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder="Search by vehicle, notes, or name..."
          className="w-full rounded-xl border border-border-strong bg-card pl-10 pr-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-placeholder-muted"
        />
      </div>

      {/* Vehicle filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => updateVehicleFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            vehicleFilter === 'all'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shadow-sm'
              : 'text-tertiary hover:text-secondary hover:bg-surface-alt'
          }`}
        >
          All
        </button>
        {vehicles.map((v) => (
          <button
            key={v.id}
            onClick={() => updateVehicleFilter(v.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              vehicleFilter === v.id
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shadow-sm'
                : 'text-tertiary hover:text-secondary hover:bg-surface-alt'
            }`}
          >
            {v.name}
          </button>
        ))}
      </div>

      {/* Tracked filter (owner only) */}
      {ownerMode && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted mr-1">Status:</span>
          {['untracked', 'tracked', 'all'].map((f) => (
            <button
              key={f}
              onClick={() => { setTrackFilter(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                trackFilter === f
                  ? f === 'untracked' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shadow-sm'
                  : f === 'tracked' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shadow-sm'
                  : 'bg-surface-alt text-primary shadow-sm'
                  : 'text-tertiary hover:text-secondary hover:bg-surface-alt'
              }`}
            >
              {f === 'all' ? 'All' : f === 'untracked' ? `Untracked (${untrackedCount})` : 'Tracked'}
            </button>
          ))}
        </div>
      )}

      {/* Per-page selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Per page:</span>
        {PER_PAGE_OPTIONS.map((n) => (
          <button
            key={n}
            onClick={() => updatePerPage(n)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              perPage === n
                ? 'bg-surface-alt text-primary shadow-sm'
                : 'text-tertiary hover:text-secondary'
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Entry list */}
      {paginated.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-8 text-center">
          <Gauge size={32} className="text-muted mx-auto mb-3" />
          <p className="text-sm font-semibold text-secondary mb-1">No entries found</p>
          <p className="text-xs text-muted">
            {search || vehicleFilter !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Tap "Log Mileage" to add your first entry.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map((entry) => (
            <div key={entry.id} className={`bg-card rounded-xl shadow-sm border p-4 transition-colors ${entry.tracked ? 'border-emerald-200 dark:border-emerald-800/50' : 'border-border-subtle'}`}>
              <div className="flex items-start gap-3">
                {ownerMode && (
                  <button
                    onClick={() => handleToggleTracked(entry.id)}
                    className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                      entry.tracked
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-border-strong hover:border-emerald-400'
                    }`}
                    title={entry.tracked ? 'Click to mark untracked' : 'Click to mark tracked'}
                  >
                    {entry.tracked && <Check size={14} className="text-white" />}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`text-sm font-bold ${entry.tracked ? 'text-muted line-through' : 'text-primary'}`}>{entry.vehicleName}</h3>
                    {ownerMode && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        entry.tracked
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}>
                        {entry.tracked ? 'Tracked' : 'Untracked'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-secondary mt-1">
                    Odometer: <span className="font-semibold">{Number(entry.odometer).toLocaleString()}</span>
                  </p>
                  {entry.notes && (
                    <p className="text-xs text-tertiary mt-1 line-clamp-2">{entry.notes}</p>
                  )}
                  <p className="text-xs text-muted mt-1.5">
                    {entry.date} &middot; Logged by {entry.loggedBy}
                  </p>
                </div>
                {ownerMode && (
                  <button
                    onClick={() => setConfirmDeleteId(entry.id)}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer shrink-0"
                    title="Delete entry"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="p-2 rounded-lg text-secondary hover:bg-surface-alt transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          {pageNumbers.map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                n === safePage
                  ? 'bg-brand text-on-brand'
                  : 'text-secondary hover:bg-surface-alt'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="p-2 rounded-lg text-secondary hover:bg-surface-alt transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Vehicle management (owner only) */}
      {ownerMode && (
        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle">
          <button
            onClick={() => setShowManage((v) => !v)}
            className="w-full flex items-center justify-between p-5 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-primary">Manage Vehicles</h2>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {vehicles.length}
              </span>
            </div>
            <ChevronDown size={18} className={`text-muted transition-transform duration-200 ${showManage ? 'rotate-180' : ''}`} />
          </button>

          {showManage && (
            <div className="px-5 pb-5 space-y-3">
              <div className="flex items-center justify-end">
                <button
                  onClick={handleSyncFromQB}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2ca01c] text-white text-xs font-semibold hover:bg-[#238a17] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Link2 size={12} />
                  {syncing ? 'Syncing...' : 'Sync from QB'}
                </button>
              </div>
              {syncMsg && (
                <p className="text-xs text-secondary bg-surface-alt rounded-lg p-2">{syncMsg}</p>
              )}
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2">
                  {editingVehicleId === v.id ? (
                    <input
                      type="text"
                      value={editingVehicleName}
                      onChange={(e) => setEditingVehicleName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameVehicle(v.id); if (e.key === 'Escape') setEditingVehicleId(null); }}
                      onBlur={() => handleRenameVehicle(v.id)}
                      autoFocus
                      className="flex-1 rounded-lg border border-border-strong bg-card px-3 py-1.5 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <span
                      className="text-sm text-secondary cursor-pointer hover:text-primary transition-colors"
                      onClick={() => { setEditingVehicleId(v.id); setEditingVehicleName(v.name); }}
                      title="Click to rename"
                    >
                      {v.name}
                    </span>
                  )}
                  <button
                    onClick={() => handleRemoveVehicle(v.id)}
                    className="p-1 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                    title="Remove vehicle"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newVehicleName}
                  onChange={(e) => setNewVehicleName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddVehicle()}
                  placeholder="New vehicle name..."
                  className="flex-1 rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={handleAddVehicle}
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mileage Modal */}
      {showModal && (
        <MileageModal
          vehicles={vehicles}
          currentUser={currentUser}
          onSubmit={handleMileageSubmit}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Success toast */}
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

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary mb-2">Delete Entry?</h3>
            <p className="text-sm text-secondary mb-5">This will permanently remove this mileage entry. This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteEntry(confirmDeleteId)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
