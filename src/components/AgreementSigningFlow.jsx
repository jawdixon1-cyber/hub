import { useState, useRef, useEffect } from 'react';
import { X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  AGREEMENT_SECTIONS as DEFAULT_SECTIONS,
  FINAL_AGREEMENT_TEXT as DEFAULT_FINAL_TEXT,
  DEFAULT_AGREEMENT_VERSION,
  getCurrentAgreementConfig,
} from '../data/employmentAgreement';

/* ── Signature Pad (white paper, black ink) ── */
function SignaturePad({ onSignatureChange, label = 'Signature' }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  const reset = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 500;
    canvas.height = 200;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 500, 200);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  useEffect(() => { reset(); }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - rect.left) * (500 / rect.width), y: (t.clientY - rect.top) * (200 / rect.height) };
  };

  const start = (e) => { e.preventDefault(); drawing.current = true; const p = getPos(e); const ctx = canvasRef.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const p = getPos(e); const ctx = canvasRef.current.getContext('2d'); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { drawing.current = false; onSignatureChange?.(canvasRef.current); };
  const clear = () => { reset(); onSignatureChange?.(null); };

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-black/60">{label}</p>
          <button type="button" onClick={clear} className="text-[10px] text-black/60 hover:text-red-600 cursor-pointer">Clear</button>
        </div>
      )}
      {!label && (
        <button type="button" onClick={clear} className="text-[10px] text-black/60 hover:text-red-600 cursor-pointer mb-1 block ml-auto">Clear</button>
      )}
      <canvas ref={canvasRef} className="w-full rounded border border-black/30 cursor-crosshair" style={{ height: 130, touchAction: 'none', background: '#fff' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
    </div>
  );
}

/* ── Plain document section (heading + body) ── */
function AgreementSection({ section }) {
  return (
    <section className="agreement-doc-section">
      <h2>{section.title}</h2>
      <div dangerouslySetInnerHTML={{ __html: section.body }} />
    </section>
  );
}

/* ── Roles block, plain document style ── */
function SigningRolesBlock({ roles, myRoleName }) {
  if (!roles?.length) return null;
  return (
    <section className="agreement-doc-section">
      <h2>Your Role &amp; Responsibilities</h2>
      <p style={{ fontStyle: 'italic', color: '#444' }}>Every role on the crew is laid out below. Your assigned role is highlighted.</p>
      {roles.map((role) => {
        const isMine = (myRoleName || '').toLowerCase() === (role.name || '').toLowerCase() || (myRoleName || '').toLowerCase() === (role.id || '').toLowerCase();
        return (
          <div key={role.id} className={`agreement-doc-role ${isMine ? 'is-mine' : ''}`}>
            <h3>
              {role.name}
              {isMine && <span className="agreement-doc-mine-badge"> · Your role</span>}
            </h3>
            <div dangerouslySetInnerHTML={{ __html: role.body }} />
          </div>
        );
      })}
    </section>
  );
}

/* ── Main Signing Flow ── */
export default function AgreementSigningFlow({ onClose, onComplete, memberName = '', memberEmail = '', configOverride = null, roles = null, myRoleName = '' }) {
  const config = configOverride || getCurrentAgreementConfig(null, DEFAULT_SECTIONS, DEFAULT_FINAL_TEXT);
  const SECTIONS = config.sections;
  const FINAL_TEXT = config.finalText;
  const VERSION = config.version;

  const [printedName, setPrintedName] = useState(memberName);
  const [signature, setSignature] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);

  const validateSignature = (canvas) => {
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let drawn = 0;
    // Count dark pixels (black ink on white background)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) drawn++;
    }
    return drawn > 300;
  };

  const handleSubmit = () => {
    setError(null);
    if (!printedName.trim()) { setError('Print your name'); return; }
    if (!signature || !validateSignature(signature)) { setError('Please sign above — draw your full signature'); return; }
    if (!confirmed) { setError('Check the confirmation box'); return; }

    onComplete({
      id: `agree-${Date.now()}`,
      version: VERSION,
      memberEmail,
      memberName: printedName.trim(),
      printedName: printedName.trim(),
      signatureDataUrl: signature.toDataURL('image/png'),
      signedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto p-4">
      <div className="agreement-doc bg-white text-black rounded-lg max-w-2xl w-full my-8 shadow-2xl">
        {/* Close button */}
        <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/5 hover:bg-black/10 cursor-pointer z-10">
          <X size={16} className="text-black/60" />
        </button>

        <div className="agreement-doc-page px-10 py-10">
          {/* Document title */}
          <header className="agreement-doc-header">
            <h1>Team Member Agreement</h1>
            <p>Hey Jude's Lawn Care · v{VERSION}</p>
          </header>

          {/* Body sections */}
          {SECTIONS.map((section, i) => (
            <AgreementSection key={section.id || i} section={section} />
          ))}

          {/* Role definitions */}
          <SigningRolesBlock roles={roles} myRoleName={myRoleName} />

          {/* Final acknowledgment */}
          <section className="agreement-doc-section">
            <h2>Acknowledgment</h2>
            {FINAL_TEXT && <div dangerouslySetInnerHTML={{ __html: FINAL_TEXT }} />}
          </section>

          {/* Sign block */}
          <section className="agreement-doc-sign">
            <label className="agreement-doc-confirm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>I confirm that I have read, understand, and agree to all standards, policies, and accountability measures in this agreement.</span>
            </label>

            <div className="agreement-doc-name-row">
              <label>Printed Name</label>
              <input type="text" value={printedName} onChange={(e) => setPrintedName(e.target.value)} />
            </div>

            <div className="agreement-doc-sigblock">
              <label>Signature</label>
              <SignaturePad onSignatureChange={setSignature} label="" />
            </div>

            {error && (
              <div className="agreement-doc-error">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            <button onClick={handleSubmit} disabled={!confirmed} className="agreement-doc-submit">
              Sign Agreement
            </button>
          </section>
        </div>
      </div>

      <style>{`
        .agreement-doc { font-family: Georgia, 'Times New Roman', Times, serif; color: #111; line-height: 1.65; position: relative; }
        .agreement-doc-page { font-size: 14px; }
        .agreement-doc-header { text-align: center; padding-bottom: 18px; margin-bottom: 24px; border-bottom: 2px solid #111; }
        .agreement-doc-header h1 { font-size: 26px; font-weight: 900; letter-spacing: 1px; margin: 0; color: #000; text-transform: uppercase; }
        .agreement-doc-header p { font-size: 11px; color: #666; margin: 6px 0 0; letter-spacing: 1px; text-transform: uppercase; font-family: Helvetica, Arial, sans-serif; }
        .agreement-doc-section { margin-bottom: 22px; break-inside: avoid; }
        .agreement-doc-section h2 { font-size: 15px; font-weight: 700; color: #000; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ccc; font-family: Helvetica, Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.5px; }
        .agreement-doc-section h3 { font-size: 13px; font-weight: 700; color: #000; margin: 14px 0 4px; }
        .agreement-doc-section p { margin: 8px 0; }
        .agreement-doc-section ul, .agreement-doc-section ol { margin: 8px 0 8px 20px; padding: 0; }
        .agreement-doc-section li { margin: 4px 0; }
        .agreement-doc-section strong { font-weight: 700; }
        .agreement-doc-role { padding: 10px 14px; border-left: 3px solid #ddd; margin: 14px 0; }
        .agreement-doc-role.is-mine { border-left-color: #000; background: #f6f6f6; }
        .agreement-doc-role h3 { margin-top: 0; font-family: Helvetica, Arial, sans-serif; }
        .agreement-doc-mine-badge { font-size: 11px; color: #000; font-weight: 700; }
        .agreement-doc-sign { margin-top: 32px; padding-top: 24px; border-top: 2px solid #111; }
        .agreement-doc-confirm { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; padding: 10px 12px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; }
        .agreement-doc-confirm input { margin-top: 3px; width: 16px; height: 16px; cursor: pointer; }
        .agreement-doc-confirm span { font-size: 13px; color: #111; }
        .agreement-doc-name-row { margin-top: 16px; }
        .agreement-doc-name-row label, .agreement-doc-sigblock label { display: block; font-family: Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; color: #444; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .agreement-doc-name-row input { width: 100%; padding: 8px 10px; font-family: inherit; font-size: 14px; border: 1px solid #ccc; border-radius: 3px; background: #fff; color: #111; outline: none; }
        .agreement-doc-name-row input:focus { border-color: #000; }
        .agreement-doc-sigblock { margin-top: 16px; }
        .agreement-doc-error { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c00; font-size: 12px; margin-top: 14px; }
        .agreement-doc-submit { width: 100%; margin-top: 18px; padding: 12px; background: #111; color: #fff; font-weight: 700; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; border: none; border-radius: 4px; cursor: pointer; font-family: Helvetica, Arial, sans-serif; }
        .agreement-doc-submit:hover { background: #000; }
        .agreement-doc-submit:disabled { background: #aaa; cursor: not-allowed; }
        .agreement-doc a { color: #111; text-decoration: underline; }
      `}</style>
    </div>
  );
}
