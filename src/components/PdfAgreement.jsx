import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Upload, FileText, Download, Check, Loader2, AlertTriangle } from 'lucide-react';

/* ── Signature Pad ── */
function SignaturePad({ onSignatureChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * (c.width / rect.width), y: (cy - rect.top) * (c.height / rect.height) };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = getPos(e); };
  const move = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    last.current = p;
    if (onSignatureChange) onSignatureChange(canvasRef.current);
  };
  const end = () => { drawing.current = false; };
  const clear = () => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    if (onSignatureChange) onSignatureChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef} width={500} height={160}
        className="w-full border border-border-default rounded-lg bg-white touch-none"
        style={{ height: 140 }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <button type="button" onClick={clear} className="mt-1 text-[11px] text-muted hover:text-primary cursor-pointer">Clear</button>
    </div>
  );
}

/* ── PDF Viewer with Sign Flow ── */
export default function PdfAgreementSigningFlow({ pdf, onClose, onComplete, memberName = '', memberEmail = '' }) {
  const [printedName, setPrintedName] = useState(memberName);
  const [confirmed, setConfirmed] = useState(false);
  const [signature, setSignature] = useState(null);
  const [error, setError] = useState(null);

  const validateSignature = (canvas) => {
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let drawn = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 100 || data[i + 1] < 100) drawn++;
    }
    return drawn > 300;
  };

  const handleSubmit = () => {
    setError(null);
    if (!printedName.trim()) { setError('Print your name'); return; }
    if (!signature || !validateSignature(signature)) { setError('Draw your signature'); return; }
    if (!confirmed) { setError('Check the acknowledgment box'); return; }
    onComplete({
      id: `agree-${Date.now()}`,
      version: pdf.version,
      pdfUrl: pdf.url,
      pdfFileName: pdf.fileName,
      memberEmail,
      memberName: printedName.trim(),
      printedName: printedName.trim(),
      signatureDataUrl: signature.toDataURL('image/png'),
      signedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={onClose}>
      <div className="bg-card border-b border-border-subtle px-4 py-3 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-brand-text" />
          <p className="text-sm font-black text-primary">Team Agreement</p>
          <span className="text-[10px] text-muted">v{pdf.version}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-alt text-muted cursor-pointer"><X size={16} /></button>
      </div>
      <div className="flex-1 flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* PDF */}
        <div className="flex-1 bg-surface-alt min-w-0">
          <iframe src={pdf.url} title="Team Agreement" className="w-full h-full" style={{ border: 0 }} />
        </div>
        {/* Sign panel */}
        <div className="w-[340px] shrink-0 bg-card border-l border-border-subtle overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-[11px] font-black text-muted uppercase tracking-wider">Sign</p>
            <p className="text-xs text-secondary mt-1">Read the document, then complete all three below to sign.</p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 w-4 h-4 accent-brand" />
            <span className="text-xs text-secondary">I have read and agree to the terms of this agreement.</span>
          </label>

          <div>
            <label className="block text-[11px] font-black text-muted uppercase tracking-wider mb-1.5">Printed Name</label>
            <input type="text" value={printedName} onChange={(e) => setPrintedName(e.target.value)} placeholder="Full name"
              className="w-full bg-surface-alt rounded-lg px-3 py-2 text-sm text-primary placeholder:text-placeholder-muted focus:outline-none focus:ring-1 focus:ring-border-default" />
          </div>

          <div>
            <label className="block text-[11px] font-black text-muted uppercase tracking-wider mb-1.5">Signature</label>
            <SignaturePad onSignatureChange={setSignature} />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-muted hover:bg-surface-alt cursor-pointer">Cancel</button>
            <button onClick={handleSubmit} className="flex-1 px-4 py-2 rounded-lg text-xs font-bold bg-brand text-on-brand hover:bg-brand-hover cursor-pointer inline-flex items-center justify-center gap-1.5">
              <Check size={13} /> Sign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Upload UI for the owner ── */
export function PdfAgreementUploader({ current, onUploaded, onClose }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) { setError('PDF files only'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Max 10 MB'); return; }
    setError(null); setUploading(true);
    try {
      const urlRes = await fetch(`/api/messaging?action=get-upload-url&bucket=agreements&filename=${encodeURIComponent(file.name)}`);
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error || 'Upload URL failed');
      const putRes = await fetch(urlData.signedUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file });
      if (!putRes.ok) throw new Error('Upload failed');
      const next = {
        url: urlData.publicUrl,
        fileName: file.name,
        version: (current?.version ? parseFloat(current.version) + 0.1 : 1).toFixed(1),
        uploadedAt: new Date().toISOString(),
      };
      onUploaded(next);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, []);

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className="rounded-xl border-2 border-dashed border-border-default bg-surface-alt/40 hover:bg-surface-alt hover:border-brand transition-colors p-8 text-center cursor-pointer"
      >
        {uploading ? (
          <div className="inline-flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" /> Uploading…</div>
        ) : (
          <>
            <Upload size={20} className="text-muted mx-auto mb-2" />
            <p className="text-sm font-bold text-primary">Drop a PDF here or click to upload</p>
            <p className="text-[11px] text-muted mt-1">Max 10 MB. Replaces the current agreement for everyone.</p>
          </>
        )}
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

/* ── Read-only inline PDF display ── */
export function PdfAgreementView({ pdf, height = 600 }) {
  if (!pdf?.url) return null;
  return (
    <div className="rounded-xl overflow-hidden border border-border-subtle bg-card">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-alt/40">
        <div className="flex items-center gap-2">
          <FileText size={12} className="text-muted" />
          <span className="text-[11px] font-semibold text-secondary truncate">{pdf.fileName}</span>
          <span className="text-[10px] text-muted">v{pdf.version}</span>
        </div>
        <a href={pdf.url} target="_blank" rel="noopener noreferrer" download
          className="inline-flex items-center gap-1 text-[11px] text-brand-text hover:text-brand-text-strong cursor-pointer">
          <Download size={11} /> Download
        </a>
      </div>
      <iframe src={`${pdf.url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`} title="Agreement" style={{ width: '100%', height, border: 0 }} />
    </div>
  );
}

export function NoPdfWarning() {
  return (
    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3">
      <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-bold text-amber-400">No agreement uploaded yet</p>
        <p className="text-xs text-muted mt-1">The owner needs to upload a PDF in Settings → Team → Agreement. Nothing to sign until then.</p>
      </div>
    </div>
  );
}
