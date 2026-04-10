import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Save, Eye, Edit3, AlertTriangle, Check, FileText, X, Shield } from 'lucide-react';
import { DEFAULT_ROLES, DEFAULT_ROLES_VERSION } from '../data/roleTemplates';

const RichTextEditor = lazy(() => import('../components/RichTextEditor'));
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import {
  AGREEMENT_SECTIONS as DEFAULT_SECTIONS,
  FINAL_AGREEMENT_TEXT as DEFAULT_FINAL_TEXT,
  DEFAULT_AGREEMENT_VERSION,
} from '../data/employmentAgreement';

const AgreementSigningFlow = lazy(() => import('../components/AgreementSigningFlow'));

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
// Always use defaults from file — owner saves will override via setAgreementConfig
function useAgreementConfig() {
  const config = useAppStore((s) => s.agreementConfig);
  // Only use stored config if it's the new single-section format AND version is higher than defaults
  if (config && config.sections) {
    const hasMainOnly = config.sections.length === 1 && config.sections[0].id === 'main';
    const storedVer = parseFloat(config.version || '0');
    const defaultVer = parseFloat(DEFAULT_AGREEMENT_VERSION || '0');
    if (hasMainOnly && storedVer > defaultVer) return config;
  }
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

  // Combine all sections + finalText into one body for editing
  const fullBodyFromConfig = (config.sections || []).map(s => s.body).join('') + (config.finalText || '');
  const [body, setBody] = useState(fullBodyFromConfig);
  const [version, setVersion] = useState(config.version);
  const [mode, setMode] = useState('status'); // 'status' | 'edit' | 'preview'
  const [hasChanges, setHasChanges] = useState(false);

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
    // Store as a single section so the system still works
    const newConfig = {
      version: newVersion,
      sections: [{ id: 'main', title: 'Agreement', body }],
      finalText: '',
    };
    setAgreementConfig(newConfig);
    setVersion(newVersion);
    setHasChanges(false);
    setMode('status');
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-primary tracking-tight">TEAM AGREEMENT</h1>
          <p className="text-xs text-muted">Version {version}</p>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'edit' && hasChanges && (
            <button onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer">
              <Save size={12} /> Save & Publish v{bumpVersion()}
            </button>
          )}
          {mode !== 'edit' ? (
            <button onClick={() => setMode('edit')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-bold hover:bg-brand-light cursor-pointer">
              <Edit3 size={12} /> Edit
            </button>
          ) : (
            <button onClick={() => { setMode('status'); setBody(fullBodyFromConfig); setHasChanges(false); }}
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

      {/* ═══ EDIT MODE — one rich text editor ═══ */}
      {mode === 'edit' && (
        <div className="space-y-3">
          <div className="rounded-xl bg-card border border-border-subtle p-4">
            <p className="text-[10px] text-muted mb-3">Edit the full agreement below. Use headings, bold, lists, and dividers to organize. Your team will see the exact changes highlighted when you publish.</p>
            <Suspense fallback={<div className="text-muted text-xs py-2">Loading editor...</div>}>
              <RichTextEditor content={body} onChange={(html) => { setBody(html); setHasChanges(true); }} />
            </Suspense>
          </div>

          {/* Roles editor */}
          <RolesEditor />

          {hasChanges && (
            <button onClick={handleSave}
              className="w-full py-3 rounded-xl bg-brand text-on-brand font-bold text-sm hover:bg-brand-hover cursor-pointer">
              Save & Publish v{bumpVersion()}
            </button>
          )}
        </div>
      )}

      {/* ═══ PREVIEW MODE — what team sees ═══ */}
      {mode === 'preview' && (
        <div className="rounded-xl bg-card border border-border-subtle p-6">
          <div className="text-sm text-secondary leading-relaxed agreement-content" dangerouslySetInnerHTML={{ __html: body }} />
        </div>
      )}

      {/* ═══ STATUS MODE ═══ */}
      {mode === 'status' && (
        <div className="space-y-4">
          {/* Agreement preview */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <div className="text-sm text-secondary leading-relaxed agreement-content" dangerouslySetInnerHTML={{ __html: body }} />
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
                  <MemberRow key={email} email={email} name={info.name || email} latest={latest} isCurrent={isCurrent} onReset={handleResetMember} currentVersion={version} />
                );
              })
            )}
          </div>
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

  // Combine all sections into one full document body
  const fullBody = sections.map(s => s.body).join('') + (finalText || '');
  const prevFullBody = latestAgreement
    ? (latestAgreement.sectionsSnapshot || []).map(s => s.body).join('') + (latestAgreement.finalTextSnapshot || '')
    : '';
  const hasChanges = needsNewVersion && prevFullBody && prevFullBody !== fullBody;

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

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-black text-primary tracking-tight">TEAM AGREEMENT</h1>
        <p className="text-xs text-muted mt-1">Hey Jude's Lawn Care · v{config.version}</p>
      </div>

      {/* Status */}
      {isSigned ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 mb-6">
          <Check size={18} className="text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm text-emerald-400 font-bold">Signed</p>
            <p className="text-[11px] text-muted">{display ? new Date(display.signedAt).toLocaleDateString() : ''}</p>
          </div>
          {display?.signatureDataUrl && (
            <img src={display.signatureDataUrl} alt="Signature" className="ml-auto rounded border border-emerald-500/20 h-10" />
          )}
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500 shrink-0" />
            <p className="text-sm text-amber-400 font-semibold">
              {latestAgreement ? 'Agreement Updated - review changes and sign below' : 'Review and sign below'}
            </p>
          </div>
          {hasChanges && (
            <div className="flex items-center gap-4 mt-2 pl-6 text-[10px] font-bold">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-500/25 border border-emerald-500/40" /> Added</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-500/25 border border-red-500/40" /> Removed</span>
            </div>
          )}
        </div>
      )}

      {/* One continuous agreement document */}
      <div className="rounded-xl bg-card border border-border-subtle p-6 mb-6">
        {hasChanges && !isSigned && (() => {
          // Only show diff if less than 40% of words changed, otherwise it's a rewrite
          const diff = computeWordDiff(prevFullBody, fullBody);
          const changed = diff.filter(d => d.type !== 'same').length;
          const total = diff.length;
          if (total > 0 && changed / total < 0.4) {
            return <DiffView oldBody={prevFullBody} newBody={fullBody} />;
          }
          return <div className="text-sm text-secondary leading-relaxed agreement-content" dangerouslySetInnerHTML={{ __html: fullBody }} />;
        })()}
        {(!hasChanges || isSigned) && (
          <div className="text-sm text-secondary leading-relaxed agreement-content" dangerouslySetInnerHTML={{ __html: fullBody }} />
        )}
      </div>

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

/* ── Main Export ── */
export default function TeamAgreement() {
  const { ownerMode } = useAuth();
  return ownerMode ? <AgreementEditor /> : <TeamMemberAgreementView />;
}
