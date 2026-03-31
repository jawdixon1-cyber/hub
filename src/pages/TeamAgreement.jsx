import { useState, lazy, Suspense, useCallback } from 'react';
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Save, Eye, Edit3, AlertTriangle, Check, FileText, X } from 'lucide-react';

const RichTextEditor = lazy(() => import('../components/RichTextEditor'));
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import {
  AGREEMENT_SECTIONS as DEFAULT_SECTIONS,
  FINAL_AGREEMENT_TEXT as DEFAULT_FINAL_TEXT,
  DEFAULT_AGREEMENT_VERSION,
} from '../data/employmentAgreement';

const AgreementSigningFlow = lazy(() => import('../components/AgreementSigningFlow'));

// Helper to get live agreement config (from store or defaults)
function useAgreementConfig() {
  const config = useAppStore((s) => s.agreementConfig);
  // Always use defaults if stored config has fewer sections than defaults
  if (config && config.sections && config.sections.length >= DEFAULT_SECTIONS.length) return config;
  return {
    version: DEFAULT_AGREEMENT_VERSION,
    sections: DEFAULT_SECTIONS,
    finalText: DEFAULT_FINAL_TEXT,
  };
}

/* ══════════════════════════════════════════════
   Owner: Agreement Editor
   ══════════════════════════════════════════════ */

function SectionEditor({ section, index, total, onChange, onDelete, onMove, onDragStart, onDragOver, onDrop, dragging }) {

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      className={`rounded-xl border bg-card overflow-hidden transition-all ${dragging === index ? 'border-brand opacity-50' : 'border-border-subtle'}`}
    >
      {/* Header — drag handle + title + actions */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="cursor-grab active:cursor-grabbing p-0.5 text-muted hover:text-secondary touch-none">
          <GripVertical size={14} />
        </div>
        <span className="text-[10px] font-bold text-muted w-4 shrink-0">{index + 1}</span>

        <input type="text" value={section.title}
          onChange={(e) => onChange(index, { ...section, title: e.target.value })}
          placeholder="Section title"
          className="flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-xs font-bold text-primary outline-none focus:border-brand focus:bg-surface" />

        <div className="flex items-center gap-0.5 shrink-0">
          {index > 0 && (
            <button onClick={() => onMove(index, index - 1)} className="p-1.5 rounded hover:bg-surface-alt cursor-pointer">
              <ChevronUp size={14} className="text-muted" />
            </button>
          )}
          {index < total - 1 && (
            <button onClick={() => onMove(index, index + 1)} className="p-1.5 rounded hover:bg-surface-alt cursor-pointer">
              <ChevronDown size={14} className="text-muted" />
            </button>
          )}
          <button onClick={() => onDelete(index)} className="p-1.5 rounded hover:bg-red-500/20 cursor-pointer">
            <Trash2 size={12} className="text-red-400" />
          </button>
        </div>
      </div>

      {/* Body — rich text editor */}
      <div className="px-3 pb-3 pl-10">
        <Suspense fallback={<div className="text-muted text-xs py-2">Loading editor...</div>}>
          <RichTextEditor
            content={section.body || ''}
            onChange={(html) => onChange(index, { ...section, body: html })}
          />
        </Suspense>
      </div>
    </div>
  );
}

function AgreementEditor() {
  const config = useAgreementConfig();
  const setAgreementConfig = useAppStore((s) => s.setAgreementConfig);
  const signedAgreements = useAppStore((s) => s.signedAgreements) || [];
  const setSignedAgreements = useAppStore((s) => s.setSignedAgreements);
  const permissions = useAppStore((s) => s.permissions) || {};

  const [sections, setSections] = useState(config.sections);
  const [finalText, setFinalText] = useState(config.finalText);
  const [version, setVersion] = useState(config.version);
  const [mode, setMode] = useState('status'); // 'status' | 'edit' | 'preview'
  const [hasChanges, setHasChanges] = useState(false);
  const [editFinal, setEditFinal] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  const teamMembers = Object.entries(permissions);

  // Group signed agreements by member
  const memberAgreements = {};
  for (const a of signedAgreements) {
    if (!memberAgreements[a.memberEmail]) memberAgreements[a.memberEmail] = [];
    memberAgreements[a.memberEmail].push(a);
  }

  const handleResetMember = (email) => {
    setSignedAgreements(signedAgreements.filter(a => a.memberEmail !== email));
  };

  const handleSectionChange = (index, updated) => {
    const next = [...sections];
    next[index] = updated;
    setSections(next);
    setHasChanges(true);
  };

  const handleDelete = (index) => {
    setSections(sections.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleMove = (from, to) => {
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSections(next);
    setHasChanges(true);
  };

  const handleAddSection = () => {
    setSections([...sections, { id: `section-${Date.now()}`, title: '', body: '', requiresInitials: false }]);
    setHasChanges(true);
  };

  const handleDragStart = (e, index) => { setDragIndex(index); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, index) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (e, toIndex) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === toIndex) { setDragIndex(null); return; }
    const next = [...sections];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(toIndex, 0, moved);
    setSections(next);
    setHasChanges(true);
    setDragIndex(null);
  };

  const bumpVersion = () => {
    const parts = version.split('.');
    const minor = parseInt(parts[1] || '0', 10) + 1;
    return `${parts[0]}.${minor}`;
  };

  const handleSave = () => {
    const newVersion = hasChanges ? bumpVersion() : version;
    const newConfig = { version: newVersion, sections, finalText };
    setAgreementConfig(newConfig);
    setVersion(newVersion);
    setHasChanges(false);
    setMode('status');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-primary tracking-tight">TEAM AGREEMENT</h1>
          <p className="text-xs text-muted">Version {version}</p>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'edit' && hasChanges && (
            <button onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer">
              <Save size={12} /> Save & Bump Version
            </button>
          )}
          {mode !== 'edit' ? (
            <button onClick={() => setMode('edit')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-bold hover:bg-brand-light cursor-pointer">
              <Edit3 size={12} /> Edit
            </button>
          ) : (
            <button onClick={() => { setMode('status'); setSections(config.sections); setFinalText(config.finalText); setHasChanges(false); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-bold hover:bg-brand-light cursor-pointer">
              <X size={12} /> Cancel
            </button>
          )}
          {mode !== 'preview' ? (
            <button onClick={() => setMode('preview')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-bold hover:bg-brand-light cursor-pointer">
              <Eye size={12} /> Preview
            </button>
          ) : (
            <button onClick={() => setMode('status')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-bold hover:bg-brand-light cursor-pointer">
              Back
            </button>
          )}
        </div>
      </div>

      {/* ═══ EDIT MODE ═══ */}
      {mode === 'edit' && (
        <div className="space-y-3">
          {sections.map((section, i) => (
            <SectionEditor key={section.id} section={section} index={i} total={sections.length}
              onChange={handleSectionChange} onDelete={handleDelete} onMove={handleMove}
              onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop} dragging={dragIndex} />
          ))}

          <button onClick={handleAddSection}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border-subtle hover:border-brand text-muted hover:text-brand transition-colors cursor-pointer">
            <Plus size={16} /> Add Section
          </button>

          {/* Final text editor */}
          <div className="rounded-xl border-2 border-brand/30 bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black text-brand uppercase tracking-widest">Final Agreement Text</p>
              <button onClick={() => setEditFinal(!editFinal)} className="text-[10px] text-muted hover:text-brand cursor-pointer">
                {editFinal ? 'Done' : 'Edit'}
              </button>
            </div>
            {editFinal ? (
              <Suspense fallback={<div className="text-muted text-xs py-2">Loading editor...</div>}>
                <RichTextEditor content={finalText} onChange={(html) => { setFinalText(html); setHasChanges(true); }} />
              </Suspense>
            ) : (
              <div className="text-xs text-secondary leading-relaxed prose-sm" dangerouslySetInnerHTML={{ __html: finalText }} />
            )}
          </div>

          {hasChanges && (
            <button onClick={handleSave}
              className="w-full py-3 rounded-xl bg-brand text-on-brand font-bold text-sm hover:bg-brand-hover cursor-pointer">
              Save Changes & Bump to v{bumpVersion()}
            </button>
          )}
        </div>
      )}

      {/* ═══ PREVIEW MODE ═══ */}
      {mode === 'preview' && (
        <div className="space-y-3">
          {sections.map((section, i) => (
            <div key={section.id} className="rounded-xl border border-border-subtle bg-card p-4">
              <p className="text-xs font-bold text-primary mb-2">{i + 1}. {section.title}</p>
              <div className="text-xs text-secondary leading-relaxed prose-sm" dangerouslySetInnerHTML={{ __html: section.body }} />
            </div>
          ))}
          <div className="rounded-xl border-2 border-brand/40 bg-card p-4">
            <p className="text-[10px] font-black text-brand uppercase tracking-widest mb-2">Final Agreement</p>
            <div className="text-xs text-secondary leading-relaxed prose-sm" dangerouslySetInnerHTML={{ __html: finalText }} />
          </div>
        </div>
      )}

      {/* ═══ STATUS MODE ═══ */}
      {mode === 'status' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card rounded-xl border border-border-subtle p-3 text-center">
              <p className="text-[9px] font-bold text-muted uppercase">Sections</p>
              <p className="text-lg font-black text-primary">{sections.length}</p>
            </div>
            <div className="bg-card rounded-xl border border-border-subtle p-3 text-center">
              <p className="text-[9px] font-bold text-muted uppercase">Team</p>
              <p className="text-lg font-black text-primary">{teamMembers.length}</p>
            </div>
            <div className="bg-card rounded-xl border border-border-subtle p-3 text-center">
              <p className="text-[9px] font-bold text-muted uppercase">Signed</p>
              <p className="text-lg font-black text-emerald-500">
                {teamMembers.filter(([email]) => {
                  const agreements = memberAgreements[email] || [];
                  return agreements.some((a) => a.version === version);
                }).length}
              </p>
            </div>
          </div>

          {/* Team Members */}
          <div className="space-y-2">
            <p className="text-[10px] font-black text-muted uppercase tracking-widest">Team Members</p>
            {teamMembers.length === 0 ? (
              <p className="text-xs text-muted">No team members added yet.</p>
            ) : (
              teamMembers.map(([email, info]) => {
                const agreements = memberAgreements[email] || [];
                const latest = agreements[agreements.length - 1];
                const isCurrent = latest?.version === version;
                return (
                  <MemberRow key={email} email={email} name={info.name || email} latest={latest} isCurrent={isCurrent} onReset={handleResetMember} />
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberRow({ email, name, latest, isCurrent, onReset }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="rounded-xl border border-border-subtle bg-card overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-4 py-3 cursor-pointer">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-emerald-500' : latest ? 'bg-amber-500' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-primary">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          {isCurrent ? (
            <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1"><Check size={10} /> Signed v{latest.version}</span>
          ) : latest ? (
            <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1"><AlertTriangle size={10} /> Outdated v{latest.version}</span>
          ) : (
            <span className="text-[10px] font-bold text-red-400">Not signed</span>
          )}
          {expanded ? <ChevronUp size={12} className="text-muted" /> : <ChevronDown size={12} className="text-muted" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-border-subtle pt-2">
          {latest ? (
            <>
              <div className="text-[11px] space-y-1">
                <p><span className="text-muted">Name:</span> <span className="text-primary">{latest.memberName}</span></p>
                <p><span className="text-muted">Signed:</span> <span className="text-primary">{new Date(latest.signedAt).toLocaleString()}</span></p>
              </div>
              {latest.signatureDataUrl && (
                <div>
                  <p className="text-[10px] font-bold text-muted uppercase mb-1">Signature</p>
                  <img src={latest.signatureDataUrl} alt="Signature" className="rounded-lg border border-border-subtle w-full" style={{ maxHeight: 80 }} />
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted">Has not signed any version.</p>
          )}
          {confirmReset ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">Reset their agreement?</span>
              <button onClick={() => { onReset(email); setConfirmReset(false); }}
                className="px-3 py-1 rounded-lg bg-red-500 text-white text-xs font-bold cursor-pointer">Yes, Reset</button>
              <button onClick={() => setConfirmReset(false)}
                className="px-3 py-1 rounded-lg bg-surface-alt text-muted text-xs font-bold cursor-pointer">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmReset(true)}
              className="text-[11px] text-red-400 hover:text-red-300 cursor-pointer font-semibold">
              Reset Agreement
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   Team Member: Signing View
   ══════════════════════════════════════════════ */

function AgreementSection({ section, accent, changed }) {
  const borderColor = changed ? 'border-amber-500/60 ring-1 ring-amber-500/20' : accent === 'brand' ? 'border-brand/40' : accent === 'red' ? 'border-red-500/30' : 'border-border-subtle';
  return (
    <div className={`rounded-2xl border ${borderColor} bg-card p-5`}>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-sm font-black text-primary uppercase tracking-wider">{section.title}</p>
        {changed && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase">
            {changed === 'new' ? 'New' : 'Updated'}
          </span>
        )}
      </div>
      <div className="text-sm text-secondary leading-relaxed agreement-content" dangerouslySetInnerHTML={{ __html: section.body }} />
    </div>
  );
}

function TeamMemberAgreementView() {
  const { user, currentUser } = useAuth();
  const userEmail = user?.email?.toLowerCase();
  const config = useAgreementConfig();
  const signedAgreements = useAppStore((s) => s.signedAgreements) || [];
  const setSignedAgreements = useAppStore((s) => s.setSignedAgreements);

  const myAgreements = signedAgreements.filter((a) => a.memberEmail === userEmail);
  const latestAgreement = myAgreements.length > 0 ? myAgreements[myAgreements.length - 1] : null;
  const needsNewVersion = !latestAgreement || latestAgreement.version !== config.version;
  const sections = config.sections || [];
  const finalText = config.finalText || '';

  const [printedName, setPrintedName] = useState('');
  const [signature, setSignature] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const [signed, setSigned] = useState(false);

  const handleSign = () => {
    setError(null);
    if (!printedName.trim()) { setError('Print your name'); return; }
    if (!confirmed) { setError('Check the confirmation box'); return; }
    if (!signature) { setError('Draw your signature'); return; }
    const ctx = signature.getContext('2d');
    const data = ctx.getImageData(0, 0, signature.width, signature.height).data;
    let drawn = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i] > 100 || data[i + 1] > 100) drawn++; }
    if (drawn < 500) { setError('Draw a more complete signature'); return; }

    setSignedAgreements([...signedAgreements, {
      id: `agree-${Date.now()}`,
      version: config.version,
      memberEmail: userEmail,
      memberName: currentUser || userEmail,
      printedName: printedName.trim(),
      signatureDataUrl: signature.toDataURL('image/png'),
      signedAt: new Date().toISOString(),
      sectionsSnapshot: sections.map(s => ({ id: s.id, title: s.title, body: s.body })),
      finalTextSnapshot: finalText,
    }]);
    setSigned(true);
  };

  const accents = ['brand', null, 'red', null];
  const isSigned = !needsNewVersion || signed;
  const display = signed ? signedAgreements[signedAgreements.length - 1] : latestAgreement;

  // Diff: figure out which sections are new or changed vs their last signed version
  const prevSnapshot = latestAgreement?.sectionsSnapshot || [];
  const prevById = {};
  for (const s of prevSnapshot) { prevById[s.id] = s; }
  const sectionChanges = {};
  if (latestAgreement && needsNewVersion) {
    for (const s of sections) {
      const prev = prevById[s.id];
      if (!prev) { sectionChanges[s.id] = 'new'; }
      else if (prev.body !== s.body || prev.title !== s.title) { sectionChanges[s.id] = 'updated'; }
    }
  }
  const hasChanges = Object.keys(sectionChanges).length > 0;

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="text-center">
        <h1 className="text-xl font-black text-primary tracking-tight">TEAM AGREEMENT</h1>
        <p className="text-[11px] text-muted mt-1">Hey Jude's Lawn Care</p>
      </div>

      {/* Status badge */}
      {isSigned ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
          <Check size={20} className="text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm text-emerald-400 font-bold">Signed</p>
            <p className="text-[11px] text-muted">{display ? new Date(display.signedAt).toLocaleDateString() : ''}</p>
          </div>
          {display?.signatureDataUrl && (
            <img src={display.signatureDataUrl} alt="Signature" className="ml-auto rounded border border-emerald-500/20 h-10" />
          )}
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500 shrink-0" />
            <p className="text-sm text-amber-400 font-semibold">
              {latestAgreement ? 'Agreement Updated' : 'Review and sign below'}
            </p>
          </div>
          {latestAgreement && hasChanges && (
            <p className="text-xs text-amber-400/80 pl-6">Sections marked <span className="font-bold">New</span> or <span className="font-bold">Updated</span> are highlighted — the rest you've already agreed to.</p>
          )}
        </div>
      )}

      {/* Sections */}
      {sections.map((section, i) => (
        <AgreementSection key={section.id || i} section={section} accent={accents[i]} changed={sectionChanges[section.id]} />
      ))}

      {/* Sign section — only if not signed */}
      {!isSigned && (
        <div className="rounded-2xl border-2 border-brand bg-card p-5 space-y-4">
          <div className="text-sm text-secondary leading-relaxed agreement-content" dangerouslySetInnerHTML={{ __html: finalText }} />

          <div className="border-t border-border-subtle pt-4 space-y-4">
            <div className="flex items-center justify-between px-1">
              <div>
                <p className="text-[10px] font-bold text-muted uppercase">Date</p>
                <p className="text-sm font-bold text-primary mt-0.5">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted uppercase">Version</p>
                <p className="text-sm font-bold text-primary mt-0.5">v{config.version}</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-muted uppercase">Print Your Name</label>
              <input type="text" value={printedName} onChange={(e) => setPrintedName(e.target.value)}
                className="w-full rounded-xl border border-border-strong bg-surface px-4 py-3 text-sm text-primary focus:ring-2 focus:ring-ring-brand outline-none mt-1.5" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-muted uppercase">Sign Below</label>
                <button onClick={() => {
                  const c = document.getElementById('sig-pad');
                  if (c) { const ctx = c.getContext('2d'); ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, 500, 200); ctx.strokeStyle = '#B0FF03'; ctx.lineWidth = 2; ctx.lineCap = 'round'; setSignature(null); }
                }} className="text-[10px] text-muted hover:text-red-400 cursor-pointer">Clear</button>
              </div>
              <canvas id="sig-pad" width={500} height={200}
                className="w-full rounded-xl border border-border-subtle cursor-crosshair" style={{ height: 130, touchAction: 'none' }}
                ref={(canvas) => {
                  if (canvas && !canvas._init) {
                    canvas._init = true;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, 500, 200);
                    ctx.strokeStyle = '#B0FF03'; ctx.lineWidth = 2; ctx.lineCap = 'round';
                    let drawing = false;
                    const getPos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches?.[0] || e; return { x: (t.clientX - r.left) * (500 / r.width), y: (t.clientY - r.top) * (200 / r.height) }; };
                    const start = (e) => { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
                    const move = (e) => { if (!drawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
                    const end = () => { drawing = false; setSignature(canvas); };
                    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move);
                    canvas.addEventListener('mouseup', end); canvas.addEventListener('mouseleave', end);
                    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);
                  }
                }}
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-border-strong accent-brand" />
              <span className="text-sm text-secondary leading-snug">I have read, understand, and agree to everything in this agreement.</span>
            </label>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <button onClick={handleSign} disabled={!confirmed}
            className="w-full py-3.5 rounded-xl bg-brand text-on-brand font-black text-base hover:bg-brand-hover cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-opacity">
            SIGN AGREEMENT
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main Export ── */
export default function TeamAgreement() {
  const { ownerMode } = useAuth();
  return ownerMode ? <AgreementEditor /> : <TeamMemberAgreementView />;
}
