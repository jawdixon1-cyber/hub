import { useState, useEffect, useRef } from 'react';
import {
  Receipt, Plus, Search, ChevronLeft, ChevronRight,
  Trash2, Check, X, Pencil, ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import ReceiptScanModal from '../components/ReceiptScanModal';
import { genId } from '../data';
import { supabase } from '../lib/supabase';

const PER_PAGE_OPTIONS = [20, 30, 40];

export default function ReceiptTracker() {
  const navigate = useNavigate();
  const { currentUser, ownerMode } = useAuth();

  const receiptLog = useAppStore((s) => s.receiptLog);
  const setReceiptLog = useAppStore((s) => s.setReceiptLog);

  // One-time migration: move base64 images to Supabase Storage
  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current || !receiptLog || receiptLog.length === 0) return;
    const needsMigration = receiptLog.filter((r) => r.imageData && !r.imageUrl);
    if (needsMigration.length === 0) { migrated.current = true; return; }
    migrated.current = true;
    (async () => {
      const toBlob = (dataUrl) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 800 / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.6);
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
      const updated = await Promise.all(
        receiptLog.map(async (r) => {
          if (r.imageData && !r.imageUrl) {
            try {
              const blob = await toBlob(r.imageData);
              if (!blob) return r;
              const fileName = `${r.id || genId()}.jpg`;
              const { error } = await supabase.storage.from('receipts').upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
              if (error) { console.warn('Migration upload failed:', error.message); return r; }
              const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
              return { ...r, imageUrl: urlData.publicUrl, imageData: null };
            } catch { return r; }
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
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [editingReceipt, setEditingReceipt] = useState(null);

  const visibleEntries = receiptLog;

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
  const filteredTotal = filtered.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

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
        imageUrl: form.imageUrl || null,
        imageData: form.imageData || null, // fallback only
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

  const handleSaveEdit = () => {
    if (!editingReceipt) return;
    setReceiptLog(receiptLog.map((e) =>
      e.id === editingReceipt.id ? { ...e, payee: editingReceipt.payee, description: editingReceipt.description, amount: Number(editingReceipt.amount), date: editingReceipt.date, items: editingReceipt.items } : e
    ));
    setViewingReceipt({ ...viewingReceipt, payee: editingReceipt.payee, description: editingReceipt.description, amount: Number(editingReceipt.amount), date: editingReceipt.date, items: editingReceipt.items });
    setEditingReceipt(null);
  };

  const pageNumbers = [];
  const maxVisible = 5;
  let start = Math.max(1, safePage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
  for (let i = start; i <= end; i++) pageNumbers.push(i);

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary cursor-pointer">
        <ArrowLeft size={16} /> Home
      </button>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
            <Receipt size={20} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Receipts</h1>
            <p className="text-sm text-tertiary">
              {sorted.length} {sorted.length === 1 ? 'receipt' : 'receipts'} &middot; ${filteredTotal.toFixed(2)}
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
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
        >
          <option value="pending">Pending ({pendingCount})</option>
          <option value="reviewed">Reviewed</option>
          <option value="all">All</option>
        </select>
      )}

      {/* Per-page selector - only show with many receipts */}
      {sorted.length > 20 && (
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
      )}

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
        <div className="bg-card rounded-xl shadow-sm border border-border-subtle divide-y divide-border-subtle">
          {paginated.map((entry) => (
            <div
              key={entry.id}
              onClick={() => setViewingReceipt(entry)}
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-alt/50 transition-colors"
            >
              {ownerMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleReviewed(entry.id); }}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                    entry.status === 'reviewed'
                      ? 'bg-emerald-500 border-emerald-500'
                      : 'border-border-strong hover:border-violet-400'
                  }`}
                >
                  {entry.status === 'reviewed' && <Check size={12} className="text-white" />}
                </button>
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${entry.status === 'reviewed' ? 'text-muted line-through' : 'text-primary'}`}>
                  {entry.payee || 'Unknown'}
                </p>
                <p className="text-xs text-muted truncate">{entry.date} &middot; {entry.loggedBy}</p>
              </div>
              <span className="text-sm font-bold text-primary shrink-0">
                ${Number(entry.amount).toFixed(2)}
              </span>
              <ChevronRight size={16} className="text-muted shrink-0" />
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

      {/* Receipt Detail / Edit Modal */}
      {viewingReceipt && !editingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewingReceipt(null)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-5 relative rounded-t-2xl">
              <button onClick={() => setViewingReceipt(null)} className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors cursor-pointer">
                <X size={22} />
              </button>
              <h2 className="text-xl font-bold text-white">{viewingReceipt.payee || 'Receipt'}</h2>
              <p className="text-white/70 text-sm mt-0.5">{viewingReceipt.date} &middot; {viewingReceipt.loggedBy}</p>
            </div>
            <div className="p-6 space-y-4">
              {(viewingReceipt.imageUrl || viewingReceipt.imageData) && (
                <img src={viewingReceipt.imageUrl || viewingReceipt.imageData} alt="Receipt" className="w-full rounded-xl border border-border-subtle" loading="lazy" />
              )}
              <div>
                <p className="text-xs text-muted font-medium mb-1">Description</p>
                <p className="text-sm text-primary">{viewingReceipt.description || '—'}</p>
              </div>
              {viewingReceipt.items?.length > 0 && (
                <div>
                  <p className="text-xs text-muted font-medium mb-2">Line Items</p>
                  <div className="space-y-1.5">
                    {viewingReceipt.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-secondary">{item.name}</span>
                        <span className="text-primary font-medium">${Number(item.price).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-border-subtle">
                <span className="text-sm font-bold text-primary">Total</span>
                <span className="text-lg font-bold text-primary">${Number(viewingReceipt.amount).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  viewingReceipt.status === 'reviewed'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                }`}>
                  {viewingReceipt.status === 'reviewed' ? 'Reviewed' : 'Pending'}
                </span>
                <div className="flex items-center gap-2">
                  {ownerMode && (
                    <>
                      <button
                        onClick={() => { handleToggleReviewed(viewingReceipt.id); setViewingReceipt({ ...viewingReceipt, status: viewingReceipt.status === 'reviewed' ? 'pending' : 'reviewed' }); }}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          viewingReceipt.status === 'reviewed'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-200'
                        }`}
                      >
                        <Check size={14} />
                        {viewingReceipt.status === 'reviewed' ? 'Unreview' : 'Reviewed'}
                      </button>
                      <button
                        onClick={() => { setViewingReceipt(null); setConfirmDeleteId(viewingReceipt.id); }}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setEditingReceipt({ ...viewingReceipt, amount: String(viewingReceipt.amount) })}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-alt text-secondary text-sm font-medium hover:text-primary hover:bg-surface transition-colors cursor-pointer"
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Edit Modal */}
      {editingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingReceipt(null)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-5 relative rounded-t-2xl">
              <button onClick={() => setEditingReceipt(null)} className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors cursor-pointer">
                <X size={22} />
              </button>
              <h2 className="text-xl font-bold text-white">Edit Receipt</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Payee</label>
                <input type="text" value={editingReceipt.payee} onChange={(e) => setEditingReceipt({ ...editingReceipt, payee: e.target.value })} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Description</label>
                <input type="text" value={editingReceipt.description} onChange={(e) => setEditingReceipt({ ...editingReceipt, description: e.target.value })} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Total Amount</label>
                <input type="number" step="0.01" value={editingReceipt.amount} onChange={(e) => setEditingReceipt({ ...editingReceipt, amount: e.target.value })} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Date</label>
                <input type="date" value={editingReceipt.date} onChange={(e) => setEditingReceipt({ ...editingReceipt, date: e.target.value })} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-2">Line Items</label>
                <div className="space-y-2">
                  {(editingReceipt.items || []).map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="text" value={item.name} onChange={(e) => { const items = [...editingReceipt.items]; items[i] = { ...items[i], name: e.target.value }; setEditingReceipt({ ...editingReceipt, items }); }} placeholder="Item name" className="flex-1 rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-violet-500" />
                      <input type="number" step="0.01" value={item.price} onChange={(e) => { const items = [...editingReceipt.items]; items[i] = { ...items[i], price: e.target.value }; setEditingReceipt({ ...editingReceipt, items }); }} placeholder="0.00" className="w-24 rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-violet-500 text-right" />
                      <button type="button" onClick={() => { const items = editingReceipt.items.filter((_, idx) => idx !== i); setEditingReceipt({ ...editingReceipt, items }); }} className="p-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setEditingReceipt({ ...editingReceipt, items: [...(editingReceipt.items || []), { name: '', price: '' }] })} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 cursor-pointer">
                  <Plus size={14} /> Add item
                </button>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button onClick={() => setEditingReceipt(null)} className="px-5 py-2.5 rounded-lg border border-border-strong text-secondary font-medium hover:bg-surface transition-colors cursor-pointer">Cancel</button>
                <button onClick={handleSaveEdit} className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium hover:opacity-90 transition-opacity cursor-pointer">Save Changes</button>
              </div>
            </div>
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
