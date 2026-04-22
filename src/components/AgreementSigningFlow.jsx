import { useState, useRef, useEffect } from 'react';
import { X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import {
  AGREEMENT_SECTIONS as DEFAULT_SECTIONS,
  FINAL_AGREEMENT_TEXT as DEFAULT_FINAL_TEXT,
  DEFAULT_AGREEMENT_VERSION,
  getCurrentAgreementConfig,
} from '../data/employmentAgreement';

/* ── Signature Pad ── */
function SignaturePad({ onSignatureChange, label = 'Signature' }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 500;
    canvas.height = 200;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, 500, 200);
    ctx.strokeStyle = '#B0FF03';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - rect.left) * (500 / rect.width), y: (t.clientY - rect.top) * (200 / rect.height) };
  };

  const start = (e) => { e.preventDefault(); drawing.current = true; const p = getPos(e); canvasRef.current.getContext('2d').beginPath(); canvasRef.current.getContext('2d').moveTo(p.x, p.y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const p = getPos(e); const ctx = canvasRef.current.getContext('2d'); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { drawing.current = false; onSignatureChange?.(canvasRef.current); };
  const clear = () => { const ctx = canvasRef.current.getContext('2d'); ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, 500, 200); ctx.strokeStyle = '#B0FF03'; ctx.lineWidth = 2; ctx.lineCap = 'round'; onSignatureChange?.(null); };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-secondary">{label}</p>
        <button onClick={clear} className="text-[10px] text-muted hover:text-red-400 cursor-pointer">Clear</button>
      </div>
      <canvas ref={canvasRef} className="w-full rounded-lg border border-border-subtle cursor-crosshair" style={{ height: 120, touchAction: 'none' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
    </div>
  );
}

/* ── Collapsible Section ── */
function AgreementSection({ section, index }) {
  const isCollapsible = section.collapsible !== false;
  const [open, setOpen] = useState(!isCollapsible);

  if (!isCollapsible) {
    // Always open — no toggle
    return (
      <div className="rounded-xl border border-border-subtle bg-card p-4">
        <p className="text-xs font-black text-primary uppercase tracking-wide mb-2">{section.title}</p>
        <div className="text-xs text-secondary leading-relaxed prose-sm" dangerouslySetInnerHTML={{ __html: section.body }} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 cursor-pointer">
        <p className="text-xs font-bold text-primary">{section.title}</p>
        {open ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="text-xs text-secondary leading-relaxed prose-sm" dangerouslySetInnerHTML={{ __html: section.body }} />
        </div>
      )}
    </div>
  );
}

/* ── Main Signing Flow ── */
export default function AgreementSigningFlow({ onClose, onComplete, memberName = '', memberEmail = '' }) {
  const storeConfig = useAppStore((s) => s.agreementConfig);
  const config = getCurrentAgreementConfig(storeConfig, DEFAULT_SECTIONS, DEFAULT_FINAL_TEXT);
  const SECTIONS = config.sections;
  const FINAL_TEXT = config.finalText;
  const VERSION = config.version;

  const [formData, setFormData] = useState({
    fullName: memberName,
    phone: '',
    startDate: '',
    printedName: '',
  });
  const [signature, setSignature] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);

  const validateSignature = (canvas) => {
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let drawn = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 100 || data[i + 1] > 100) drawn++;
    }
    return drawn > 500;
  };

  const handleSubmit = () => {
    setError(null);
    if (!formData.fullName.trim()) { setError('Enter your full name at the top'); return; }
    if (!formData.phone.trim()) { setError('Enter your phone number'); return; }
    if (!formData.startDate) { setError('Enter your start date'); return; }
    if (!formData.printedName.trim()) { setError('Print your name in the final section'); return; }
    if (!signature || !validateSignature(signature)) { setError('Please sign above — draw your full signature'); return; }
    if (!confirmed) { setError('Check the confirmation box'); return; }

    onComplete({
      id: `agree-${Date.now()}`,
      version: VERSION,
      memberEmail,
      memberName: formData.fullName.trim(),
      phone: formData.phone.trim(),
      startDate: formData.startDate,
      printedName: formData.printedName.trim(),
      signatureDataUrl: signature.toDataURL('image/png'),
      signedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-surface rounded-2xl border border-border-subtle max-w-lg w-full my-8">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-surface rounded-t-2xl border-b border-border-subtle px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-primary">TEAM MEMBER AGREEMENT</h2>
            <p className="text-[10px] text-muted">Hey Jude's Lawn Care — v{VERSION}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-alt cursor-pointer"><X size={18} className="text-muted" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Team Member Info */}
          <div className="rounded-xl border border-brand/30 bg-card p-4 space-y-3">
            <p className="text-[10px] font-black text-brand uppercase tracking-widest">Team Member Info</p>
            <div>
              <label className="text-[10px] font-bold text-muted uppercase">Full Name</label>
              <input type="text" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand outline-none mt-1" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted uppercase">Phone Number</label>
              <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand outline-none mt-1" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted uppercase">Start Date</label>
              <input type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand outline-none mt-1" />
            </div>
          </div>

          {/* Sections — collapsible standards, always-open key sections */}
          <div className="space-y-3">
            {SECTIONS.map((section, i) => (
              <AgreementSection key={section.id || i} section={section} index={i} />
            ))}
          </div>

          {/* Final Agreement + Signature */}
          <div className="rounded-xl border-2 border-brand/40 bg-card p-4 space-y-4">
            <p className="text-[10px] font-black text-brand uppercase tracking-widest">Final Agreement</p>
            <div className="text-xs text-secondary leading-relaxed prose-sm" dangerouslySetInnerHTML={{ __html: FINAL_TEXT }} />

            <div>
              <label className="text-[10px] font-bold text-muted uppercase">Printed Name</label>
              <input type="text" value={formData.printedName} onChange={(e) => setFormData({ ...formData, printedName: e.target.value })}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand outline-none mt-1" />
            </div>

            <SignaturePad onSignatureChange={setSignature} label="Team Member Signature" />

            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-border-strong" />
              <span className="text-xs text-secondary">I confirm that I have read, understand, and agree to all standards, policies, and accountability measures in this agreement.</span>
            </label>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={!confirmed}
            className="w-full py-3 rounded-xl bg-brand text-on-brand font-bold text-sm hover:bg-brand-hover cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
            Sign Agreement
          </button>
        </div>
      </div>
    </div>
  );
}
