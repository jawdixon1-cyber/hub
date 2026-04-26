import { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react';
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Save, Eye, Edit3, AlertTriangle, Check, FileText, X, Shield, Download } from 'lucide-react';
import { DEFAULT_ROLES, DEFAULT_ROLES_VERSION } from '../data/roleTemplates';

const RichTextEditor = lazy(() => import('../components/RichTextEditor'));
const InlineDocEditor = lazy(() => import('../components/InlineDocEditor'));
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import {
  AGREEMENT_SECTIONS as DEFAULT_SECTIONS,
  FINAL_AGREEMENT_TEXT as DEFAULT_FINAL_TEXT,
  DEFAULT_AGREEMENT_VERSION,
  getCurrentAgreementConfig,
} from '../data/employmentAgreement';

const AgreementSigningFlow = lazy(() => import('../components/AgreementSigningFlow'));
import { PdfAgreementUploader, PdfAgreementView, NoPdfWarning } from '../components/PdfAgreement';

// Migrate old sections (expectations + accountability + policies) into a single { standards & policies }
// Migrate legacy section IDs only — never overwrite user-edited content
function migrateSections(sections) {
  if (!Array.isArray(sections)) return sections;
  const defaultStandards = DEFAULT_SECTIONS.find((s) => s.id === 'standards');
  const defaultStandardsBody = defaultStandards?.body || '';

  // Only migration needed: collapse old section IDs into 'standards'
  const hasOld = sections.some((s) => s.id === 'expectations' || s.id === 'accountability' || s.id === 'policies');
  if (!hasOld) return sections;

  const out = [];
  let inserted = false;
  for (const s of sections) {
    if (s.id === 'expectations' || s.id === 'accountability' || s.id === 'policies') {
      if (!inserted) {
        out.push({ id: 'standards', title: 'STANDARDS & POLICIES', body: defaultStandardsBody });
        inserted = true;
      }
      continue;
    }
    out.push(s);
  }
  return out;
}

// Helper to get live agreement config
function useAgreementConfig() {
  const config = useAppStore((s) => s.agreementConfig);
  return getCurrentAgreementConfig(config, DEFAULT_SECTIONS, DEFAULT_FINAL_TEXT);
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

/* ── Roles Editor (lives inside the agreement editor) ── */

function RolesEditor() {
  const stored = useAppStore((s) => s.roles);
  const setRoles = useAppStore((s) => s.setRoles);
  const data = stored && stored.items ? stored : { version: DEFAULT_ROLES_VERSION, items: DEFAULT_ROLES };

  const [items, setItems] = useState(data.items);
  const [activeId, setActiveId] = useState(data.items[0]?.id || null);
  const [dirty, setDirty] = useState(false);

  const active = items.find((r) => r.id === activeId) || items[0];

  const updateRole = (id, patch) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const addRole = () => {
    const id = `role-${Date.now()}`;
    const newRole = { id, name: 'New Role', body: '<p>Describe this role\u2019s responsibilities here.</p>' };
    setItems((prev) => [...prev, newRole]);
    setActiveId(id);
    setDirty(true);
  };

  const deleteRole = (id) => {
    if (items.length <= 1) return;
    if (!confirm('Delete this role?')) return;
    const next = items.filter((r) => r.id !== id);
    setItems(next);
    if (activeId === id) setActiveId(next[0]?.id || null);
    setDirty(true);
  };

  const save = () => {
    const parts = (data.version || '1.0').split('.');
    const minor = parseInt(parts[1] || '0', 10) + 1;
    const newVersion = dirty ? `${parts[0]}.${minor}` : data.version;
    setRoles({ version: newVersion, items });
    setDirty(false);
  };

  return (
    <div className="rounded-xl border-2 border-brand/30 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-brand" />
          <p className="text-[10px] font-black text-brand uppercase tracking-widest">Roles & Responsibilities</p>
          <span className="text-[9px] font-bold text-muted">v{data.version}{dirty && <span className="text-amber-500"> · unsaved</span>}</span>
        </div>
        <button
          onClick={save}
          disabled={!dirty}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-[10px] font-bold hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Save size={11} /> Save Roles
        </button>
      </div>
      <p className="text-[10px] text-muted">Each team member is assigned a role in Team management. Their agreement automatically shows the responsibilities for their role.</p>

      <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-3">
        {/* Role list */}
        <div className="space-y-1">
          {items.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveId(r.id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                activeId === r.id ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt'
              }`}
            >
              <span className="text-[11px] font-semibold truncate">{r.name}</span>
              {items.length > 1 && (
                <span
                  onClick={(e) => { e.stopPropagation(); deleteRole(r.id); }}
                  className="text-muted/30 hover:text-red-500 shrink-0"
                  role="button"
                >
                  <Trash2 size={10} />
                </span>
              )}
            </button>
          ))}
          <button
            onClick={addRole}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border-subtle text-[10px] font-semibold text-muted hover:text-primary hover:bg-surface-alt cursor-pointer"
          >
            <Plus size={11} /> Add role
          </button>
        </div>

        {/* Editor */}
        {active && (
          <div className="space-y-2">
            <input
              type="text"
              value={active.name}
              onChange={(e) => updateRole(active.id, { name: e.target.value })}
              placeholder="Role name"
              className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-xs font-bold text-primary outline-none focus:ring-2 focus:ring-brand"
            />
            <Suspense fallback={<div className="text-muted text-xs py-2">Loading editor…</div>}>
              <RichTextEditor
                content={active.body || ''}
                onChange={(html) => updateRole(active.id, { body: html })}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}

// Open a print-ready PDF of the agreement in a new tab and trigger browser's Save as PDF
function downloadAgreementPdf(sections, version, signature) {
  const sigBlock = signature?.signatureDataUrl ? `
    <div class="sigblock">
      <div>
        <p class="sig-label">Signed by</p>
        <p class="sig-name">${signature.printedName || signature.memberName || ''}</p>
        <p class="sig-date">${new Date(signature.signedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
      </div>
      <img src="${signature.signatureDataUrl}" alt="Signature" class="sig-img" />
    </div>` : '';
  const sectionHtml = sections.map((s) => `
    <section>
      ${s.title ? `<h2>${s.title}</h2>` : ''}
      <div class="section-body">${s.body}</div>
    </section>
  `).join('');
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Team Agreement — Hey Jude's Lawn Care</title>
<style>
@page { size: letter; margin: 0.75in; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; color: #111; background: #fff; margin: 0; padding: 24px; line-height: 1.5; font-size: 11pt; }
.header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
.header h1 { margin: 0; font-size: 22pt; letter-spacing: 2px; font-family: Helvetica, Arial, sans-serif; font-weight: 900; }
.header .sub { margin-top: 6px; font-size: 10pt; color: #555; letter-spacing: 1px; text-transform: uppercase; }
section { break-inside: avoid; margin-bottom: 16px; }
section h2 { font-family: Helvetica, Arial, sans-serif; font-size: 12pt; font-weight: 900; letter-spacing: 0.5px; color: #111; margin: 16px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #ccc; text-transform: uppercase; }
section .section-body { font-size: 11pt; }
section p { margin: 6px 0; } section ul, section ol { margin: 6px 0 6px 20px; } section li { margin: 3px 0; }
strong { font-weight: 700; }
.sigblock { break-inside: avoid; margin-top: 32px; padding-top: 18px; border-top: 1px solid #111; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
.sig-label { font-size: 9pt; color: #666; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px; }
.sig-name { font-size: 13pt; font-weight: 700; margin: 0; }
.sig-date { font-size: 10pt; color: #555; margin: 4px 0 0; }
.sig-img { max-height: 70px; max-width: 260px; }
.footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 8pt; color: #888; text-align: center; }
@media print { body { padding: 0; } }
</style></head>
<body>
<div class="header"><h1>TEAM AGREEMENT</h1><p class="sub">Hey Jude's Lawn Care · Version ${version}</p></div>
${sectionHtml}
${sigBlock}
<div class="footer">Hey Jude's Lawn Care — Team Agreement v${version} — Generated ${new Date().toLocaleDateString()}</div>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Pop-up blocked. Allow pop-ups to download the PDF.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}

// Reusable paper-style agreement view — looks like an official document.
// If `onUpdateSection` or `onUpdateTitle` is provided, sections become Google Docs-style inline editable.
function PaperAgreement({ sections, version, signature, effectiveDate, onUpdateSection, onUpdateTitle, onAddSection, onRemoveSection }) {
  const numberedSections = sections.filter((s) => s.title);
  const lastSection = sections.find((s) => !s.title); // e.g. the sign-off block with no title
  const editable = !!onUpdateSection;
  const dateStr = effectiveDate
    ? new Date(effectiveDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  return (
    <>
      <div
        className="agreement-paper mx-auto"
        style={{
          background: 'linear-gradient(180deg, #fdfcf7 0%, #fbfaf4 100%)',
          color: '#0a0a0a',
          fontFamily: "'Times New Roman', Times, Georgia, serif",
          padding: '1in 1in',
          width: '8.5in',
          maxWidth: '100%',
          minHeight: '11in',
          borderRadius: '2px',
          boxShadow: '0 40px 80px rgba(0,0,0,0.45), 0 10px 20px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.05) inset',
          border: '1px solid rgba(0,0,0,0.14)',
          lineHeight: 1.65,
          position: 'relative',
        }}
      >
        {/* Formal letterhead with company name + document reference */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, borderBottom: '1px solid #111', marginBottom: 28 }}>
          <div>
            <p style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', color: '#111', margin: 0, fontWeight: 900 }}>
              Hey Jude's Lawn Care
            </p>
            <p style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#777', margin: '3px 0 0', fontWeight: 600 }}>
              Rock Hill, SC
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#777', margin: 0, fontWeight: 600 }}>Document</p>
            <p style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, color: '#111', margin: '2px 0 0', fontWeight: 700 }}>TA-{version}</p>
            {dateStr && (
              <p style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 9, color: '#777', margin: '6px 0 0', letterSpacing: 0.5 }}>Effective {dateStr}</p>
            )}
          </div>
        </div>

        {/* Title block */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 34, letterSpacing: 6, fontWeight: 900, margin: 0, color: '#0a0a0a' }}>
            TEAM&nbsp;AGREEMENT
          </h1>
          <div style={{ width: 80, height: 3, background: '#111', margin: '14px auto 0' }} />
        </div>

        {/* Numbered sections */}
        {numberedSections.map((s, i) => {
          const idx = i + 1;
          return (
            <section
              key={s.id}
              className="paper-section"
              style={{ marginBottom: 28, pageBreakInside: 'avoid', position: 'relative' }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.18)', paddingBottom: 6 }}>
                <span style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, fontWeight: 900, color: '#111', minWidth: 40, letterSpacing: 1 }}>
                  § {String(idx).padStart(2, '0')}
                </span>
                {editable && onUpdateTitle ? (
                  <input
                    value={s.title}
                    onChange={(e) => onUpdateTitle(s.id, e.target.value)}
                    style={{
                      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                      fontSize: 12, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase',
                      margin: 0, color: '#0a0a0a', flex: 1,
                      background: 'transparent', border: 'none', outline: 'none', padding: 0,
                    }}
                    onFocus={(e) => { e.target.style.background = 'rgba(176,255,3,0.15)'; }}
                    onBlur={(e) => { e.target.style.background = 'transparent'; }}
                  />
                ) : (
                  <h2 style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 12, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', margin: 0, color: '#0a0a0a', flex: 1 }}>
                    {s.title}
                  </h2>
                )}
                {editable && onRemoveSection && (
                  <button
                    onClick={() => { if (confirm(`Remove "${s.title}"?`)) onRemoveSection(s.id); }}
                    className="paper-remove-btn"
                    title="Remove section"
                    style={{
                      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                      fontSize: 10, fontWeight: 700, color: '#c44',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      opacity: 0, transition: 'opacity 150ms',
                    }}
                  >✕</button>
                )}
              </div>
              {editable ? (
                <Suspense fallback={<div style={{ fontSize: 12.5, paddingLeft: 52, color: '#888' }}>…</div>}>
                  <InlineDocEditor
                    content={s.body}
                    onChange={(html) => onUpdateSection(s.id, html)}
                    style={{ paddingLeft: 52 }}
                    className="agreement-pdf-body inline-editor"
                  />
                </Suspense>
              ) : (
                <div
                  className="agreement-pdf-body"
                  style={{ fontSize: 13, color: '#111', paddingLeft: 52, textAlign: 'justify', hyphens: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: s.body }}
                />
              )}
            </section>
          );
        })}

        {/* Add section button (editable mode only) */}
        {editable && onAddSection && (
          <button
            onClick={onAddSection}
            style={{
              width: '100%', padding: '10px', margin: '8px 0 20px',
              background: 'transparent', border: '1px dashed #bbb', borderRadius: 4,
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
              color: '#888', cursor: 'pointer',
            }}
          >+ Add Section</button>
        )}

        {/* Final sign-off (untitled) section */}
        {lastSection && (
          <div
            className="agreement-pdf-body"
            style={{ fontSize: 12.5, color: '#111', marginTop: 28, paddingTop: 18, borderTop: '1px solid #bbb', textAlign: 'center' }}
            dangerouslySetInnerHTML={{ __html: lastSection.body }}
          />
        )}

        {/* Signature block */}
        {signature ? (
          <div style={{ marginTop: 40, paddingTop: 22, borderTop: '2px solid #111', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36 }}>
            <div>
              <div style={{ borderBottom: '1px solid #111', paddingBottom: 4, minHeight: 44, display: 'flex', alignItems: 'flex-end' }}>
                {signature.signatureDataUrl && (
                  <img src={signature.signatureDataUrl} alt="Signature" style={{ maxHeight: 40, maxWidth: '100%', background: 'transparent' }} />
                )}
              </div>
              <p style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1.5, margin: '6px 0 0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>Team Member Signature</p>
              <p style={{ fontSize: 12, fontWeight: 700, margin: '8px 0 0', color: '#111' }}>{signature.printedName || signature.memberName || ''}</p>
            </div>
            <div>
              <div style={{ borderBottom: '1px solid #111', paddingBottom: 4, minHeight: 44, display: 'flex', alignItems: 'flex-end', fontSize: 13, color: '#111' }}>
                {new Date(signature.signedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <p style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1.5, margin: '6px 0 0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>Date Signed</p>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 40, paddingTop: 22, borderTop: '2px solid #111', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36 }}>
            <div>
              <div style={{ borderBottom: '1px solid #111', minHeight: 44 }}></div>
              <p style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1.5, margin: '6px 0 0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>Team Member Signature</p>
            </div>
            <div>
              <div style={{ borderBottom: '1px solid #111', minHeight: 44 }}></div>
              <p style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1.5, margin: '6px 0 0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>Date Signed</p>
            </div>
          </div>
        )}

        {/* Document footer — looks like a printed PDF footer */}
        <div style={{ marginTop: 40, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.12)', display: 'flex', justifyContent: 'space-between', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 9, color: '#888', letterSpacing: 0.5 }}>
          <span>HEY JUDE'S LAWN CARE · TEAM AGREEMENT</span>
          <span>DOCUMENT TA-{version}</span>
        </div>
      </div>
      <style>{`
        .agreement-pdf-body p { margin: 9px 0; }
        .agreement-pdf-body ul, .agreement-pdf-body ol { margin: 8px 0 8px 22px; padding: 0; }
        .agreement-pdf-body li { margin: 5px 0; }
        .agreement-pdf-body strong { font-weight: 700; }
        .agreement-pdf-body a { color: #111; text-decoration: underline; }
        .paper-section:hover .paper-remove-btn { opacity: 0.7; }
        .paper-section .paper-remove-btn:hover { opacity: 1 !important; }
        .agreement-pdf-body.inline-editor .tiptap { outline: none; font-size: 12.5pt; color: #111; text-align: justify; line-height: 1.7; font-family: 'Times New Roman', Times, Georgia, serif; }
        .agreement-pdf-body.inline-editor .tiptap p { margin: 8px 0; }
        .agreement-pdf-body.inline-editor .tiptap ul, .agreement-pdf-body.inline-editor .tiptap ol { margin: 8px 0 8px 22px; padding: 0; }
        .agreement-pdf-body.inline-editor .tiptap li { margin: 5px 0; }
        .agreement-pdf-body.inline-editor .tiptap strong { font-weight: 700; }
        .agreement-pdf-body.inline-editor .tiptap:focus-within { background: rgba(176,255,3,0.04); }
      `}</style>
    </>
  );
}

function AgreementEditor() {
  const config = useAgreementConfig();
  const setAgreementConfig = useAppStore((s) => s.setAgreementConfig);
  const storedConfig = useAppStore((s) => s.agreementConfig);
  const signedAgreements = useAppStore((s) => s.signedAgreements) || [];
  const setSignedAgreements = useAppStore((s) => s.setSignedAgreements);
  const permissions = useAppStore((s) => s.permissions) || {};

  // Auto-save defaults to store if they're newer than what's stored
  useEffect(() => {
    const storedVer = parseFloat(storedConfig?.version || '0');
    const configVer = parseFloat(config.version || '0');
    if (configVer > storedVer) {
      setAgreementConfig({ version: config.version, sections: config.sections, finalText: config.finalText || '' });
    }
  }, []);

  const [sections, setSections] = useState(config.sections || []);
  const [version, setVersion] = useState(config.version);
  const [mode, setMode] = useState('status');
  const [hasChanges, setHasChanges] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const fullBody = sections.map(s => s.body).join('');

  const teamMembers = Object.entries(permissions);

  const memberAgreements = {};
  for (const a of signedAgreements) {
    if (!memberAgreements[a.memberEmail]) memberAgreements[a.memberEmail] = [];
    memberAgreements[a.memberEmail].push(a);
  }

  const handleResetMember = (email) => {
    setSignedAgreements(signedAgreements.filter(a => a.memberEmail !== email));
  };

  const bumpVersion = () => {
    const parts = version.split('.');
    const minor = parseInt(parts[1] || '0', 10) + 1;
    return `${parts[0]}.${minor}`;
  };

  const handleSave = () => {
    const newVersion = hasChanges ? bumpVersion() : version;
    const newConfig = { version: newVersion, sections, finalText: '' };
    setAgreementConfig(newConfig);
    setVersion(newVersion);
    setHasChanges(false);
    setEditingId(null);
    setMode('status');
  };

  const updateSection = (id, newBody) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, body: newBody } : s));
    setHasChanges(true);
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-primary tracking-tight">TEAM AGREEMENT</h1>
          <p className="text-xs text-muted">Version {version}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <>
              <button onClick={() => { setSections(config.sections || []); setHasChanges(false); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-bold hover:bg-brand-light cursor-pointer">
                <X size={12} /> Discard
              </button>
              <button onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer">
                <Save size={12} /> Save & Publish v{bumpVersion()}
              </button>
            </>
          )}
          <button onClick={() => downloadAgreementPdf(sections, version)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-bold hover:bg-brand-light cursor-pointer">
            <Download size={12} /> PDF
          </button>
          {mode !== 'preview' ? (
            <button onClick={() => setMode('preview')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-bold hover:bg-brand-light cursor-pointer">
              <Eye size={12} /> Preview
            </button>
          ) : (
            <button onClick={() => setMode('status')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-bold hover:bg-brand-light cursor-pointer">
              <Edit3 size={12} /> Edit
            </button>
          )}
        </div>
      </div>

      {/* ═══ PREVIEW MODE ═══ (read-only, exactly as team members see it) */}
      {mode === 'preview' && (
        <PaperAgreement sections={sections} version={version} />
      )}

      {/* ═══ STATUS MODE — Google Docs-style inline editing ═══ */}
      {mode === 'status' && (
        <div className="space-y-4">
          <PaperAgreement
            sections={sections}
            version={version}
            onUpdateSection={updateSection}
            onUpdateTitle={(id, title) => { setSections(prev => prev.map(s => s.id === id ? { ...s, title } : s)); setHasChanges(true); }}
            onAddSection={() => {
              const id = 'section-' + Date.now();
              setSections(prev => [...prev.filter(s => s.title), { id, title: 'New Section', body: '<p></p>' }, ...prev.filter(s => !s.title)]);
              setHasChanges(true);
            }}
            onRemoveSection={(id) => {
              setSections(prev => prev.filter(s => s.id !== id));
              setHasChanges(true);
            }}
          />

        </div>
      )}
    </div>
  );
}

function MemberRow({ email, name, latest, isCurrent, onReset, currentVersion }) {
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
            <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1"><AlertTriangle size={10} /> Needs v{currentVersion}</span>
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

/* ─── Simple word-level diff ─── */
function stripHtml(html) { return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }

function computeWordDiff(oldText, newText) {
  const oldWords = stripHtml(oldText).split(' ');
  const newWords = stripHtml(newText).split(' ');
  // LCS-based diff
  const m = oldWords.length, n = newWords.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldWords[i-1] === newWords[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  // Backtrack
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i-1] === newWords[j-1]) {
      result.unshift({ type: 'same', word: oldWords[i-1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      result.unshift({ type: 'added', word: newWords[j-1] });
      j--;
    } else {
      result.unshift({ type: 'removed', word: oldWords[i-1] });
      i--;
    }
  }
  return result;
}

function DiffView({ oldBody, newBody }) {
  const diff = computeWordDiff(oldBody, newBody);
  return (
    <div className="text-sm leading-relaxed">
      {diff.map((d, i) => {
        if (d.type === 'same') return <span key={i} className="text-secondary">{d.word} </span>;
        if (d.type === 'added') return <span key={i} className="bg-emerald-500/20 text-emerald-300 rounded px-0.5">{d.word} </span>;
        if (d.type === 'removed') return <span key={i} className="bg-red-500/20 text-red-400 line-through rounded px-0.5">{d.word} </span>;
        return null;
      })}
    </div>
  );
}

function AgreementSection({ section, accent, changed, prevBody }) {
  const borderColor = changed ? 'border-amber-500/60 ring-1 ring-amber-500/20' : accent === 'brand' ? 'border-brand/40' : accent === 'red' ? 'border-red-500/30' : 'border-border-subtle';
  const showDiff = changed === 'updated' && prevBody;
  return (
    <div className={`rounded-2xl border ${borderColor} bg-card p-5`}>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-sm font-black text-primary uppercase tracking-wider">{section.title}</p>
        {changed && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
            changed === 'new' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
          }`}>
            {changed === 'new' ? 'New' : 'Updated'}
          </span>
        )}
      </div>
      {showDiff ? (
        <div>
          <div className="flex items-center gap-4 mb-3 text-[10px] font-bold">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40" /> Added</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/20 border border-red-500/40" /> Removed</span>
          </div>
          <DiffView oldBody={prevBody} newBody={section.body} />
        </div>
      ) : (
        <div className="text-sm text-secondary leading-relaxed agreement-content" dangerouslySetInnerHTML={{ __html: section.body }} />
      )}
    </div>
  );
}

function RolesAgreementBlock({ allRoles, myRoleId }) {
  const myRole = allRoles.find((r) => r.id === myRoleId) || null;
  return (
    <div className="rounded-2xl border-2 border-brand/40 bg-card p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Shield size={16} className="text-brand" />
        <p className="text-sm font-black text-primary uppercase tracking-wider">Your Role & Responsibilities</p>
      </div>
      <p className="text-[11px] text-muted -mt-2">Every role on the crew is laid out below. Your assigned role is highlighted.</p>

      {allRoles.map((role) => {
        const isMine = myRoleId === role.id;
        return (
          <div
            key={role.id}
            className={`rounded-xl p-4 border ${isMine ? 'border-brand bg-brand/5 ring-1 ring-brand/30' : 'border-border-subtle bg-surface-alt/30'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-black text-primary uppercase tracking-wider">{role.name}</h3>
              {isMine ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand bg-brand/15 px-2 py-0.5 rounded-full">
                  <Check size={10} /> Your Role
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted bg-surface-alt px-2 py-0.5 rounded-full">
                  Not Your Role
                </span>
              )}
            </div>
            <div className="text-sm text-secondary leading-relaxed agreement-content" dangerouslySetInnerHTML={{ __html: role.body }} />
          </div>
        );
      })}

      {!myRole && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-500">No role assigned yet — ask the owner to assign you a role in Team management.</p>
        </div>
      )}
    </div>
  );
}

function TeamMemberAgreementView() {
  const { user, currentUser } = useAuth();
  const userEmail = user?.email?.toLowerCase();
  const config = useAgreementConfig();
  const signedAgreements = useAppStore((s) => s.signedAgreements) || [];
  const setSignedAgreements = useAppStore((s) => s.setSignedAgreements);

  const permissions = useAppStore((s) => s.permissions) || {};
  const rolesData = useAppStore((s) => s.roles);
  const allRoles = (rolesData && rolesData.items) ? rolesData.items : DEFAULT_ROLES;
  const myRoleId = permissions[userEmail]?.roleId || null;

  const myAgreements = signedAgreements.filter((a) => a.memberEmail === userEmail);
  const latestAgreement = myAgreements.length > 0 ? myAgreements[myAgreements.length - 1] : null;
  const needsNewVersion = !latestAgreement || latestAgreement.version !== config.version;
  const sections = config.sections || [];
  const finalText = config.finalText || '';

  // Per-section change detection
  const prevSnapshot = latestAgreement?.sectionsSnapshot || [];
  const prevById = {};
  for (const s of prevSnapshot) { prevById[s.id] = s; }
  const sectionChanges = {};
  if (latestAgreement && needsNewVersion) {
    for (const s of sections) {
      const prev = prevById[s.id];
      if (!prev) { sectionChanges[s.id] = 'new'; }
      else if (prev.body !== s.body) { sectionChanges[s.id] = 'updated'; }
    }
  }
  const hasChanges = Object.keys(sectionChanges).length > 0;

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

  const isSigned = !needsNewVersion || signed;
  const display = signed ? signedAgreements[signedAgreements.length - 1] : latestAgreement;

  const downloadPdf = () => downloadAgreementPdf(sections, config.version, display);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Status banner (not part of the document) */}
      {isSigned ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 mb-4">
          <Check size={18} className="text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm text-emerald-400 font-bold">Signed</p>
            <p className="text-[11px] text-muted">{display ? new Date(display.signedAt).toLocaleDateString() : ''}</p>
          </div>
          {display?.signatureDataUrl && (
            <img src={display.signatureDataUrl} alt="Signature" className="ml-auto rounded border border-emerald-500/20 h-10 bg-white" />
          )}
          <button
            onClick={downloadPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/30 transition-colors cursor-pointer"
          >
            <Download size={13} /> PDF
          </button>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <p className="text-sm text-amber-400 font-semibold">
                {latestAgreement ? 'Agreement Updated — review and sign below' : 'Review and sign below'}
              </p>
            </div>
            <button
              onClick={downloadPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/30 transition-colors cursor-pointer"
            >
              <Download size={13} /> PDF
            </button>
          </div>
          {hasChanges && (
            <div className="flex items-center gap-4 mt-2 pl-6 text-[10px] font-bold">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-500/25 border border-emerald-500/40" /> Added</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-500/25 border border-red-500/40" /> Removed</span>
            </div>
          )}
        </div>
      )}

      {/* PDF-style document */}
      <div
        className="agreement-paper mx-auto mb-6 shadow-2xl"
        style={{
          background: '#fafaf7',
          color: '#1a1a1a',
          fontFamily: 'Georgia, "Times New Roman", serif',
          padding: '56px 64px',
          borderRadius: '4px',
          border: '1px solid rgba(0,0,0,0.08)',
          lineHeight: 1.6,
        }}
      >
        {/* Document header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: 18, marginBottom: 28 }}>
          <h1 style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 28, letterSpacing: 3, fontWeight: 900, margin: 0, color: '#111' }}>
            TEAM AGREEMENT
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#666', letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Hey Jude's Lawn Care · Version {config.version}
          </p>
        </div>

        {/* Sections as document body */}
        {sections.map((s) => {
          const changed = sectionChanges[s.id];
          const isChanged = changed && !isSigned;
          const prevBody = prevById[s.id]?.body;
          const showDiff = isChanged && changed === 'updated' && prevBody;
          return (
            <section
              key={s.id}
              style={{
                marginBottom: 18,
                pageBreakInside: 'avoid',
                paddingLeft: isChanged ? 12 : 0,
                borderLeft: isChanged ? '3px solid #d97706' : 'none',
              }}
            >
              {s.title && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, borderBottom: '1px solid #d4d0c5', paddingBottom: 4 }}>
                  <h2 style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 13, fontWeight: 900, letterSpacing: 0.5, textTransform: 'uppercase', margin: 0, color: '#111' }}>
                    {s.title}
                  </h2>
                  {changed === 'new' && !isSigned && <span style={{ fontSize: 9, fontWeight: 700, color: '#059669', background: '#d1fae5', padding: '2px 6px', borderRadius: 3, letterSpacing: 0.5 }}>NEW</span>}
                  {changed === 'updated' && !isSigned && <span style={{ fontSize: 9, fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '2px 6px', borderRadius: 3, letterSpacing: 0.5 }}>UPDATED</span>}
                </div>
              )}
              {showDiff ? (
                <div style={{ color: '#1a1a1a' }}>
                  <DiffView oldBody={prevBody} newBody={s.body} />
                </div>
              ) : (
                <div
                  className="agreement-pdf-body"
                  style={{ fontSize: 13, color: '#1a1a1a' }}
                  dangerouslySetInnerHTML={{ __html: s.body }}
                />
              )}
            </section>
          );
        })}

        {/* Signature block in the document */}
        {isSigned && display && (
          <div style={{ marginTop: 36, paddingTop: 18, borderTop: '1px solid #111', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24 }}>
            <div>
              <p style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px' }}>Signed by</p>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#111' }}>{display.printedName || display.memberName || ''}</p>
              <p style={{ fontSize: 11, color: '#555', margin: '4px 0 0' }}>
                {new Date(display.signedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            {display.signatureDataUrl && (
              <img src={display.signatureDataUrl} alt="Signature" style={{ maxHeight: 70, maxWidth: 260, background: '#fff', padding: 4, border: '1px solid #e5e5e5', borderRadius: 4 }} />
            )}
          </div>
        )}
      </div>

      <style>{`
        .agreement-pdf-body p { margin: 6px 0; }
        .agreement-pdf-body ul, .agreement-pdf-body ol { margin: 6px 0 6px 22px; }
        .agreement-pdf-body li { margin: 3px 0; }
        .agreement-pdf-body strong { font-weight: 700; }
        .agreement-pdf-body a { color: #1a1a1a; text-decoration: underline; }
      `}</style>

      {/* Roles */}
      {allRoles.length > 0 && (
        <div className="rounded-xl bg-card border border-border-subtle p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} className="text-brand" />
            <p className="text-sm font-black text-primary uppercase tracking-wider">Your Role & Responsibilities</p>
          </div>
          <div className="space-y-3">
            {allRoles.map(role => {
              const isMine = myRoleId === role.id;
              return (
                <div key={role.id} className={`rounded-lg p-4 border ${isMine ? 'border-brand bg-brand/5' : 'border-border-subtle bg-surface-alt/30'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-black text-primary uppercase">{role.name}</h3>
                    {isMine && <span className="text-[10px] font-bold text-brand bg-brand/15 px-2 py-0.5 rounded-full">Your Role</span>}
                  </div>
                  <div className="text-sm text-secondary leading-relaxed agreement-content" dangerouslySetInnerHTML={{ __html: role.body }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sign section */}
      {!isSigned && (
        <div className="rounded-xl border-2 border-brand bg-card p-6 space-y-4">
          <div className="border-b border-border-subtle pb-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted uppercase">Date</p>
                <p className="text-sm font-bold text-primary">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted uppercase">Version</p>
                <p className="text-sm font-bold text-primary">v{config.version}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-muted uppercase">Print Your Name</label>
            <input type="text" value={printedName} onChange={(e) => setPrintedName(e.target.value)}
              className="w-full rounded-lg border border-border-strong bg-surface px-4 py-3 text-sm text-primary focus:ring-2 focus:ring-ring-brand outline-none mt-1.5" />
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
              className="w-full rounded-lg border border-border-subtle cursor-crosshair" style={{ height: 130, touchAction: 'none' }}
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

/* ── PDF-based agreement: owner uploads, everyone signs ── */

function OwnerPdfAgreementView() {
  const agreementPdf = useAppStore((s) => s.agreementPdf);
  const setAgreementPdf = useAppStore((s) => s.setAgreementPdf);
  const signedAgreements = useAppStore((s) => s.signedAgreements) || [];
  const setSignedAgreements = useAppStore((s) => s.setSignedAgreements);
  const permissions = useAppStore((s) => s.permissions) || {};
  const [showUpload, setShowUpload] = useState(!agreementPdf);

  const memberAgreements = {};
  for (const a of signedAgreements) {
    if (!memberAgreements[a.memberEmail]) memberAgreements[a.memberEmail] = [];
    memberAgreements[a.memberEmail].push(a);
  }
  const teamMembers = Object.entries(permissions);
  const currentVersion = agreementPdf?.version || '';

  const handleUploaded = (pdf) => {
    setAgreementPdf(pdf);
    // New version — everyone needs to re-sign. Clear old signatures so the gate re-engages.
    setSignedAgreements([]);
    setShowUpload(false);
  };

  const handleRemove = () => {
    if (!confirm('Remove the current agreement? All existing signatures will also be cleared.')) return;
    setAgreementPdf(null);
    setSignedAgreements([]);
    setShowUpload(true);
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-lg font-black text-primary tracking-tight">TEAM AGREEMENT</h1>
          <p className="text-xs text-muted">{agreementPdf ? `${agreementPdf.fileName} · v${currentVersion}` : 'Not uploaded'}</p>
        </div>
        {agreementPdf && !showUpload && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-bold hover:text-primary hover:bg-surface cursor-pointer">Replace PDF</button>
            <button onClick={handleRemove} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-bold hover:bg-red-500/20 cursor-pointer">
              <Trash2 size={12} /> Remove
            </button>
          </div>
        )}
      </div>

      {showUpload && (
        <div className="rounded-xl bg-card border border-border-subtle p-4 space-y-3">
          {agreementPdf && (
            <div className="text-xs text-muted">
              Uploading a new PDF will <span className="text-amber-400 font-semibold">invalidate all existing signatures</span>. Everyone will need to re-sign.
            </div>
          )}
          <PdfAgreementUploader current={agreementPdf} onUploaded={handleUploaded} />
          {agreementPdf && (
            <button onClick={() => setShowUpload(false)} className="text-xs text-muted hover:text-primary cursor-pointer">Cancel</button>
          )}
        </div>
      )}

      {agreementPdf && !showUpload && <PdfAgreementView pdf={agreementPdf} height={600} />}
    </div>
  );
}

// Inline signature pad — used directly under the PDF (no modal, single page)
function InlineSignaturePad({ onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);

  const reset = () => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    c.width = 600; c.height = 180;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  };
  useEffect(() => { reset(); }, []);

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (600 / r.width), y: (t.clientY - r.top) * (180 / r.height) };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; const p = pos(e); const ctx = ref.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const p = pos(e); const ctx = ref.current.getContext('2d'); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { drawing.current = false; onChange?.(ref.current); };
  const clear = () => { reset(); onChange?.(null); };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Sign here</p>
        <button type="button" onClick={clear} className="text-[10px] text-muted hover:text-red-500 cursor-pointer">Clear</button>
      </div>
      <canvas ref={ref} className="w-full rounded-lg border border-border-default cursor-crosshair"
        style={{ height: 160, touchAction: 'none', background: '#fff' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
    </div>
  );
}

function TeamMemberPdfAgreementView() {
  const { user, currentUser, signOut } = useAuth();
  const userEmail = user?.email?.toLowerCase();
  const agreementPdf = useAppStore((s) => s.agreementPdf);
  const signedAgreements = useAppStore((s) => s.signedAgreements) || [];
  const setSignedAgreements = useAppStore((s) => s.setSignedAgreements);

  const myAgreements = signedAgreements.filter((a) => a.memberEmail === userEmail);
  const latestAgreement = myAgreements[myAgreements.length - 1];
  const needsSign = !!agreementPdf && (!latestAgreement || latestAgreement.version !== agreementPdf.version);

  const [printedName, setPrintedName] = useState(currentUser || '');
  const [confirmed, setConfirmed] = useState(false);
  const [signature, setSignature] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const validateSignature = (canvas) => {
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let drawn = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) drawn++;
    }
    return drawn > 300;
  };

  const handleSign = async () => {
    setError(null);
    if (!printedName.trim()) { setError('Print your name'); return; }
    if (!signature || !validateSignature(signature)) { setError('Draw your signature above'); return; }
    if (!confirmed) { setError('Check the acknowledgment box'); return; }
    setSubmitting(true);
    try {
      const record = {
        id: `agree-${Date.now()}`,
        version: agreementPdf.version,
        pdfUrl: agreementPdf.url,
        pdfFileName: agreementPdf.fileName,
        memberEmail: userEmail,
        memberName: printedName.trim(),
        printedName: printedName.trim(),
        signatureDataUrl: signature.toDataURL('image/png'),
        signedAt: new Date().toISOString(),
      };
      await setSignedAgreements([...signedAgreements, record]);
    } finally {
      setSubmitting(false);
    }
  };

  if (!agreementPdf) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <NoPdfWarning />
        <div className="text-center">
          <button onClick={signOut} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-red-500 cursor-pointer">Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-lg font-black text-primary tracking-tight">TEAM AGREEMENT</h1>
          <p className="text-xs text-muted">{agreementPdf.fileName} · v{agreementPdf.version}</p>
        </div>
        <div className="flex items-center gap-2">
          {latestAgreement && !needsSign && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-xs font-bold">
              <Check size={12} /> Signed {new Date(latestAgreement.signedAt).toLocaleDateString()}
            </span>
          )}
          {needsSign && (
            <button onClick={signOut} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-muted hover:text-red-500 cursor-pointer">
              Sign Out
            </button>
          )}
        </div>
      </div>

      {needsSign && latestAgreement && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-500">
          The agreement was updated — please review and re-sign before continuing.
        </div>
      )}

      {needsSign && !latestAgreement && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-500">
          Read the agreement below, then sign at the bottom to access the rest of the app.
        </div>
      )}

      <PdfAgreementView pdf={agreementPdf} height={620} />

      {needsSign && (
        <div className="rounded-2xl border border-border-subtle bg-card p-5 space-y-4">
          <h2 className="text-base font-black text-primary">Sign Agreement</h2>

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 w-4 h-4 accent-brand" />
            <span className="text-sm text-secondary">I have read, understand, and agree to the terms of this agreement.</span>
          </label>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Printed Name</label>
            <input type="text" value={printedName} onChange={(e) => setPrintedName(e.target.value)} placeholder="Full name"
              className="w-full bg-surface-alt rounded-lg px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>

          <InlineSignaturePad onChange={setSignature} />

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button onClick={handleSign} disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50">
            <Check size={14} /> {submitting ? 'Signing…' : 'Sign Agreement'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main Export ── */
export default function TeamAgreement() {
  const { ownerMode } = useAuth();
  return ownerMode ? <OwnerPdfAgreementView /> : <TeamMemberPdfAgreementView />;
}
