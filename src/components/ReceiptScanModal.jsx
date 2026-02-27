import { useState } from 'react';
import { X, Camera, Loader2 } from 'lucide-react';

export default function ReceiptScanModal({ currentUser, onSubmit, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [imageData, setImageData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [form, setForm] = useState({
    payee: '',
    description: '',
    amount: '',
    date: today,
  });
  const [scanned, setScanned] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setScanError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageData(reader.result);
      setScanned(false);
    };
    reader.readAsDataURL(file);
  };

  const handleScan = async () => {
    if (!imageData) return;
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setForm({
        payee: data.payee || '',
        description: data.description || '',
        amount: data.amount != null ? String(data.amount) : '',
        date: data.date || today,
      });
      setScanned(true);
    } catch (err) {
      setScanError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      imageData,
      payee: form.payee,
      description: form.description,
      amount: Number(form.amount),
      date: form.date,
      loggedBy: currentUser,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-8 py-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X size={24} />
          </button>
          <h2 className="text-2xl font-bold text-white">Scan Receipt</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto space-y-5">
          {/* File input */}
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Receipt Photo</label>
            <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-border-strong cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/30 transition-colors">
              <Camera size={20} className="text-muted" />
              <span className="text-sm text-tertiary">
                {imageData ? 'Photo captured — tap to retake' : 'Take a photo or choose from gallery'}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {imageData && (
              <img src={imageData} alt="Receipt preview" className="mt-2 rounded-lg max-h-48 object-cover" />
            )}
          </div>

          {/* Scan button */}
          {imageData && !scanned && (
            <button
              type="button"
              onClick={handleScan}
              disabled={scanning}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
            >
              {scanning ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Camera size={16} />
                  Scan Receipt
                </>
              )}
            </button>
          )}

          {scanError && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg p-3">{scanError}</p>
          )}

          {/* Editable extracted fields */}
          {scanned && (
            <>
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Payee</label>
                <input
                  type="text"
                  required
                  value={form.payee}
                  onChange={(e) => setForm({ ...form, payee: e.target.value })}
                  className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-primary focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition"
                  placeholder="Store name..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Description</label>
                <input
                  type="text"
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-primary focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition"
                  placeholder="Items purchased..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Amount</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-primary focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-primary focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Logged by</label>
                <input
                  type="text"
                  value={currentUser}
                  readOnly
                  className="w-full rounded-lg border border-border-default px-4 py-2.5 text-tertiary bg-surface cursor-not-allowed"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-lg border border-border-strong text-secondary font-medium hover:bg-surface transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Save Receipt
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
