import { useState } from 'react';
import {
  Wrench,
  AlertCircle,
  CheckCircle,
  Plus,
  X,
  Trash2,
  Search,
  ExternalLink,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react';
import { genId, EQUIPMENT_TYPES } from '../data';
import AddEquipmentModal from '../components/AddEquipmentModal';
import ReportRepairModal from '../components/ReportRepairModal';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';

const TYPE_LABEL = Object.fromEntries(EQUIPMENT_TYPES.map((t) => [t.value, t.label]));

export default function EquipmentIdeas() {
  const { ownerMode, currentUser } = useAuth();
  const equipment = useAppStore((s) => s.equipment);
  const setEquipment = useAppStore((s) => s.setEquipment);
  const equipmentRepairLog = useAppStore((s) => s.equipmentRepairLog);
  const setEquipmentRepairLog = useAppStore((s) => s.setEquipmentRepairLog);

  const [addingEquipment, setAddingEquipment] = useState(false);
  const [reportingRepair, setReportingRepair] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [historyItem, setHistoryItem] = useState(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');

  const handleAddEquipment = (form) => {
    setEquipment([...equipment, { id: genId(), ...form }]);
    setAddingEquipment(false);
  };

  const handleRepairSubmit = (form) => {
    const today = new Date().toLocaleDateString('en-US');
    setEquipment(
      equipment.map((eq) =>
        eq.id === form.equipmentId
          ? {
              ...eq,
              status: 'needs-repair',
              reportedIssue: form.problemDescription,
              reportedBy: form.reportedBy,
              reportedDate: today,
              urgency: form.urgency,
              photo: form.photo,
            }
          : eq
      )
    );
    setReportingRepair(false);
  };

  const handleMarkRepaired = (id) => {
    const today = new Date().toLocaleDateString('en-US');
    const eq = equipment.find((e) => e.id === id);
    if (eq && eq.reportedIssue) {
      const logEntry = {
        id: genId(),
        equipmentId: eq.id,
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
          ? {
              ...e,
              status: 'operational',
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

  const handleDeleteEquipment = (id) => {
    setEquipment(equipment.filter((eq) => eq.id !== id));
    if (historyItem && historyItem.id === id) setHistoryItem(null);
    setConfirmDelete(null);
    setConfirmDeleteText('');
  };

  // Filter equipment
  const filtered = equipment.filter((item) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.serialNumber && item.serialNumber.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Recurring issues
  const repairCounts = {};
  equipmentRepairLog.forEach((e) => {
    repairCounts[e.equipmentName] = (repairCounts[e.equipmentName] || 0) + 1;
  });
  const recurring = Object.entries(repairCounts).filter(([, c]) => c >= 2);

  // Get repair history for a specific equipment
  const getRepairHistory = (eq) =>
    equipmentRepairLog.filter(
      (r) => r.equipmentId === eq.id || r.equipmentName === eq.name
    );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-primary">Equipment Log</h1>
        <p className="text-tertiary mt-1">Equipment tracking and maintenance history</p>
      </div>

      {/* Type Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setTypeFilter('all')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
            typeFilter === 'all'
              ? 'bg-brand text-on-brand'
              : 'bg-card border border-border-default text-secondary hover:bg-surface'
          }`}
        >
          All ({equipment.length})
        </button>
        {EQUIPMENT_TYPES.map((t) => {
          const count = equipment.filter((e) => e.type === t.value).length;
          return (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                typeFilter === t.value
                  ? 'bg-brand text-on-brand'
                  : 'bg-card border border-border-default text-secondary hover:bg-surface'
              }`}
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search & Actions */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search equipment by name or serial..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border-default text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          {ownerMode && (
            <button
              onClick={() => setAddingEquipment(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-on-brand text-sm font-semibold rounded-xl hover:bg-brand-hover transition-colors cursor-pointer"
            >
              <Plus size={16} />
              Add Equipment
            </button>
          )}
          <button
            onClick={() => setReportingRepair(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
          >
            <AlertCircle size={16} />
            Report Repair
          </button>
        </div>
      </div>

      {/* Recurring Issues Warning */}
      {recurring.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-amber-600" />
            <h3 className="font-bold text-amber-800">Recurring Issues</h3>
          </div>
          <ul className="space-y-1.5">
            {recurring.map(([name, count]) => (
              <li key={name} className="text-sm text-amber-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {name} — {count} repairs logged
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Equipment List */}
      <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6">
        <h2 className="text-xl font-bold text-primary mb-6">
          Equipment Log
          <span className="text-sm font-normal text-muted ml-2">
            {filtered.length} of {equipment.length}
          </span>
        </h2>

        <div className="space-y-4">
          {filtered.length === 0 && (
            <p className="text-muted text-sm py-4 text-center">No equipment matches your filters</p>
          )}
          {filtered.map((item) => {
            const needsRepair = item.status === 'needs-repair';
            const repairs = getRepairHistory(item);

            return (
              <div
                key={item.id}
                className={`rounded-xl border-l-4 p-5 ${
                  needsRepair
                    ? 'border-l-red-500 bg-red-50/50 border border-red-200'
                    : 'border-l-emerald-500 bg-card border border-border-subtle'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-primary">{item.name}</h3>
                      {item.type && (
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {TYPE_LABEL[item.type] || item.type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                          needsRepair
                            ? 'bg-red-100 text-red-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {needsRepair ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
                        {needsRepair ? 'Needs Repair' : 'Operational'}
                      </span>
                      {needsRepair && item.urgency && (
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            item.urgency === 'critical'
                              ? 'bg-red-600 text-white'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.urgency === 'critical' ? 'CRITICAL' : 'Maintenance'}
                        </span>
                      )}
                    </div>

                    {/* Serial row */}
                    {item.serialNumber && (
                      <div className="mt-3 text-xs">
                        <span className="text-muted">S/N:</span>{' '}
                        <span className="font-medium text-secondary">{item.serialNumber}</span>
                      </div>
                    )}

                    {needsRepair && item.reportedIssue && (
                      <div className="mt-3">
                        <p className="text-xs text-muted">Reported Issue</p>
                        <p className="text-sm text-red-600 mt-0.5">{item.reportedIssue}</p>
                        <p className="text-xs text-muted mt-1">
                          Reported by {item.reportedBy} on {item.reportedDate}
                        </p>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      <button
                        onClick={() => { setHistoryItem(item); setEditingNotes(false); setNotesText(item.notes || ''); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-semibold hover:bg-surface-strong transition-colors cursor-pointer"
                      >
                        <ExternalLink size={14} />
                        View
                      </button>
                      {item.manualUrl && (
                        <a
                          href={item.manualUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-light text-brand-text-strong text-xs font-semibold hover:bg-brand-light transition-colors"
                        >
                          <ExternalLink size={14} />
                          Manual
                        </a>
                      )}
                      {ownerMode && needsRepair && (
                        <button
                          onClick={() => handleMarkRepaired(item.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
                        >
                          <CheckCircle size={14} />
                          Mark Repaired
                        </button>
                      )}
                      {ownerMode && (
                        <button
                          onClick={() => { setConfirmDelete(item); setConfirmDeleteText(''); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors cursor-pointer"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <Wrench size={22} className={`shrink-0 ml-4 ${needsRepair ? 'text-red-400' : 'text-emerald-400'}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {addingEquipment && (
        <AddEquipmentModal
          onSave={handleAddEquipment}
          onClose={() => setAddingEquipment(false)}
        />
      )}

      {reportingRepair && (
        <ReportRepairModal
          equipment={equipment}
          currentUser={currentUser}
          onSubmit={handleRepairSubmit}
          onClose={() => setReportingRepair(false)}
        />
      )}

      {/* Repair History Modal */}
      {historyItem && (() => {
        const repairs = getRepairHistory(historyItem);
        const needsRepair = historyItem.status === 'needs-repair';
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setHistoryItem(null)}
          >
            <div
              className="bg-card rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-gray-700 to-gray-900 px-8 py-6 relative shrink-0">
                <button
                  onClick={() => setHistoryItem(null)}
                  className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={24} />
                </button>
                <h2 className="text-xl font-bold text-white">{historyItem.name}</h2>
                <div className="flex items-center gap-2 mt-2">
                  {historyItem.type && (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                      {TYPE_LABEL[historyItem.type] || historyItem.type}
                    </span>
                  )}
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      needsRepair ? 'bg-red-400/30 text-red-100' : 'bg-emerald-400/30 text-emerald-100'
                    }`}
                  >
                    {needsRepair ? 'Needs Repair' : 'Operational'}
                  </span>
                </div>
              </div>

              <div className="overflow-y-auto p-6 space-y-5">
                {/* Equipment Details */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {historyItem.serialNumber && (
                    <div>
                      <p className="text-xs text-muted">Serial Number</p>
                      <p className="font-medium text-primary">{historyItem.serialNumber}</p>
                    </div>
                  )}
                  {historyItem.manualUrl && (
                    <div>
                      <p className="text-xs text-muted">Manual</p>
                      <a
                        href={historyItem.manualUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-text hover:text-brand-text-strong font-medium"
                      >
                        <ExternalLink size={13} />
                        View Manual
                      </a>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-secondary uppercase tracking-wide">Notes</p>
                    {ownerMode && !editingNotes && (
                      <button
                        onClick={() => { setEditingNotes(true); setNotesText(historyItem.notes || ''); }}
                        className="text-xs text-brand-text hover:text-brand-text-strong font-medium cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {editingNotes ? (
                    <div className="space-y-2">
                      <textarea
                        value={notesText}
                        onChange={(e) => setNotesText(e.target.value)}
                        placeholder="Specific oils, parts, maintenance notes..."
                        rows={3}
                        className="w-full rounded-lg border border-border-default px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition resize-none"
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingNotes(false)}
                          className="px-3 py-1.5 rounded-lg border border-border-default text-xs font-medium text-secondary hover:bg-surface transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            setEquipment(equipment.map((e) => e.id === historyItem.id ? { ...e, notes: notesText } : e));
                            setHistoryItem({ ...historyItem, notes: notesText });
                            setEditingNotes(false);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-secondary whitespace-pre-wrap">
                      {historyItem.notes || <span className="text-muted">No notes yet</span>}
                    </p>
                  )}
                </div>

                {/* Current Issue */}
                {needsRepair && historyItem.reportedIssue && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                    <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Current Issue</p>
                    <p className="text-sm text-red-600">{historyItem.reportedIssue}</p>
                    {historyItem.photo && (
                      <img
                        src={historyItem.photo}
                        alt="Repair photo"
                        className="mt-2 rounded-lg max-h-40 object-cover"
                      />
                    )}
                    <p className="text-xs text-muted mt-2">
                      Reported by {historyItem.reportedBy} on {historyItem.reportedDate}
                    </p>
                  </div>
                )}

                {/* Repair History */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardList size={16} className="text-tertiary" />
                    <h3 className="font-bold text-primary">Repair History</h3>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-alt text-secondary">
                      {repairs.length} record{repairs.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {repairs.length === 0 ? (
                    <p className="text-sm text-muted py-4 text-center">No repair history for this equipment</p>
                  ) : (
                    <div className="space-y-2">
                      {repairs.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-lg border border-border-subtle p-3 bg-surface/50"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-secondary">{r.issue}</p>
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                                r.urgency === 'critical'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {r.urgency === 'critical' ? 'CRITICAL' : 'MAINT'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                              <span>Reported: {r.reportedDate}</span>
                              <span>Fixed: {r.repairedDate}</span>
                              <span>By: {r.reportedBy}</span>
                            </div>
                            {ownerMode && (
                              <button
                                onClick={() => {
                                  if (confirm('Delete this repair record?')) {
                                    setEquipmentRepairLog((prev) => prev.filter((entry) => entry.id !== r.id));
                                  }
                                }}
                                className="p-1 rounded text-muted hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                                title="Delete record"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { setConfirmDelete(null); setConfirmDeleteText(''); }}
        >
          <div
            className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-primary mb-2">Delete Equipment</h3>
            <p className="text-sm text-secondary mb-4">
              Type <span className="font-bold text-red-600">{confirmDelete.name}</span> to confirm deletion.
            </p>
            <input
              type="text"
              value={confirmDeleteText}
              onChange={(e) => setConfirmDeleteText(e.target.value)}
              placeholder="Type equipment name..."
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition mb-4"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setConfirmDelete(null); setConfirmDeleteText(''); }}
                className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmDeleteText !== confirmDelete.name}
                onClick={() => handleDeleteEquipment(confirmDelete.id)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
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
