import { useState, useEffect, useRef } from 'react';
import {
  Receipt, Plus, Search, ChevronLeft, ChevronRight,
  Trash2, Check,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import ReceiptScanModal from '../components/ReceiptScanModal';
import { genId } from '../data';

const PER_PAGE_OPTIONS = [20, 30, 40];

export default function ReceiptTracker() {
  const { currentUser, ownerMode } = useAuth();

  const receiptLog = useAppStore((s) => s.receiptLog);
  const setReceiptLog = useAppStore((s) => s.setReceiptLog);

  // One-time migration: compress any oversized receipt images
  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current || !receiptLog || receiptLog.length === 0) return;
    const oversized = receiptLog.filter((r) => r.imageData && r.imageData.length > 200000); // >200KB
    if (oversized.length === 0) { migrated.current = true; return; }
    migrated.current = true;
    (async () => {
      const compress = (dataUrl) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 800 / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = () => resolve(dataUrl); // keep original if compression fails
        img.src = dataUrl;
      });
      const updated = await Promise.all(
        receiptLog.map(async (r) => {
          if (r.imageData && r.imageData.length > 200000) {
            return { ...r, imageData: await compress(r.imageData) };
          }
          return r;
        })
      );
      setReceiptLog(updated);
    })();
  }, [receiptLog, setReceiptLog]);

  const [showModal, setShowModal] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(ownerMode ? 'pending' : 'all');
  const [perPage, setPerPage] = useState(20);
  const [page, setPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const visibleEntries = ownerMode
    ? receiptLog
    : receiptLog.filter((e) => e.loggedBy === currentUser);

  const filtered = visibleEntries.filter((entry) => {
    if (ownerMode && statusFilter === 'pending' && entry.status !== 'pending') return false;
    if (ownerMode && statusFilter === 'reviewed' && entry.status !== 'reviewed') return false;
    if (search) {
      const q = search.toLowerCase();
      const matchPayee = (entry.payee || '').toLowerCase().includes(q);
      const matchDesc = (entry.description || '').toLowerCase().includes(q);
      const matchBy = (entry.loggedBy || '').toLowerCase().includes(q);
      if (!matchPayee && !matchDesc && !matchBy) return false;
    }
    return true;
  });

  const pendingCount = visibleEntries.filter((e) => e.status === 'pending').length;

  const sorted = [...filtered].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * perPage, safePage * perPage);

  const updateSearch = (v) => { setSearch(v); setPage(1); };
  const updatePerPage = (v) => { setPerPage(v); setPage(1); };

  const handleReceiptSubmit = (form) => {
    setReceiptLog([
      ...receiptLog,
      {
        id: genId(),
        imageData: form.imageData,
        payee: form.payee,
        description: form.description,
        items: form.items || [],
        amount: form.amount,
        date: form.date,
        loggedBy: form.loggedBy,
        createdAt: new Date().toISOString(),
        status: 'pending',
      },
    ]);
    setShowModal(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleDeleteEntry = (id) => {
    setReceiptLog(receiptLog.filter((e) => e.id !== id));
    setConfirmDeleteId(null);
  };

  const handleToggleReviewed = (id) => {
    setReceiptLog(receiptLog.map((e) =>
      e.id === id ? { ...e, status: e.status === 'reviewed' ? 'pending' : 'reviewed' } : e
    ));
  };

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
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
            <Receipt size={20} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Receipts</h1>
            <p className="text-sm text-tertiary">
              {sorted.length} {sorted.length === 1 ? 'receipt' : 'receipts'}
              {!ownerMode && ' (yours)'}
              {ownerMode && pendingCount > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-semibold">
                  {pendingCount} pending
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Plus size={16} />
          Scan Receipt
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder="Search by payee, description, or name..."
          className="w-full rounded-xl border border-border-strong bg-card pl-10 pr-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-placeholder-muted"
        />
      </div>

      {/* Status filter (owner only) */}
      {ownerMode && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted mr-1">Status:</span>
          {['pending', 'reviewed', 'all'].map((f) => (
            <button
              key={f}
              onClick={() => { setStatusFilter(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === f
                  ? f === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shadow-sm'
                  : f === 'reviewed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shadow-sm'
                  : 'bg-surface-alt text-primary shadow-sm'
                  : 'text-tertiary hover:text-secondary hover:bg-surface-alt'
              }`}
            >
              {f === 'all' ? 'All' : f === 'pending' ? `Pending (${pendingCount})` : 'Reviewed'}
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

      {/* Receipt list */}
      {paginated.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-8 text-center">
          <Receipt size={32} className="text-muted mx-auto mb-3" />
          <p className="text-sm font-semibold text-secondary mb-1">No receipts found</p>
          <p className="text-xs text-muted">
            {search || statusFilter !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Tap "Scan Receipt" to add your first receipt.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map((entry) => (
            <div key={entry.id} className={`bg-card rounded-xl shadow-sm border p-4 transition-colors ${entry.status === 'reviewed' ? 'border-emerald-200 dark:border-emerald-800/50' : 'border-border-subtle'}`}>
              <div className="flex items-start gap-3">
                {ownerMode && (
                  <button
                    onClick={() => handleToggleReviewed(entry.id)}
                    className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                      entry.status === 'reviewed'
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-border-strong hover:border-violet-400'
                    }`}
                    title={entry.status === 'reviewed' ? 'Click to mark pending' : 'Click to mark reviewed'}
                  >
                    {entry.status === 'reviewed' && <Check size={14} className="text-white" />}
                  </button>
                )}
                {/* Thumbnail */}
                {entry.imageData && (
                  <img
                    src={entry.imageData}
                    alt="Receipt"
                    className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border-subtle"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`text-sm font-bold ${entry.status === 'reviewed' ? 'text-muted line-through' : 'text-primary'}`}>{entry.payee || 'Unknown'}</h3>
                    {ownerMode && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        entry.status === 'reviewed'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}>
                        {entry.status === 'reviewed' ? 'Reviewed' : 'Pending'}
                      </span>
                    )}
                  </div>
                  {entry.description && (
                    <p className="text-xs text-secondary mt-1 line-clamp-2">{entry.description}</p>
                  )}
                  {entry.items?.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {entry.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs text-tertiary">
                          <span className="truncate mr-2">{item.name}</span>
                          <span className="shrink-0 font-medium">${Number(item.price).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-sm font-semibold text-primary mt-1">
                    Total: ${Number(entry.amount).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {entry.date} &middot; Logged by {entry.loggedBy}
                  </p>
                </div>
                {ownerMode && (
                  <button
                    onClick={() => setConfirmDeleteId(entry.id)}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer shrink-0"
                    title="Delete receipt"
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

      {/* Scan Modal */}
      {showModal && (
        <ReceiptScanModal
          currentUser={currentUser}
          onSubmit={handleReceiptSubmit}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Success toast */}
      {saveSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-violet-600" />
            </div>
            <h3 className="text-lg font-bold text-primary mb-1">Receipt Saved!</h3>
            <p className="text-sm text-secondary">Your receipt has been added.</p>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary mb-2">Delete Receipt?</h3>
            <p className="text-sm text-secondary mb-5">This will permanently remove this receipt. This action cannot be undone.</p>
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
