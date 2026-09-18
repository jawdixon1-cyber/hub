import { useState, useEffect, useMemo } from 'react';
import {
  ExternalLink, FileCode2, AlertTriangle, Copy, Check, Loader2, Monitor, Smartphone,
  ShieldCheck, XCircle,
} from 'lucide-react';
import {
  SITE_PAGES,
  SITE_REPO,
  KNOWN_BROKEN_LINKS,
  groupedPages,
  liveUrl,
  previewUrl,
  ghlUrl,
} from '../data/sitePages';
import { auditPage, summarize, SEVERITY } from '../lib/seoAudit';

/* ─── Source loading ───
   The dev server serves the website repo at /site-preview/, so fetching a page
   gives us its actual source. Everything below (header/footer extraction, drift
   detection) reads from that — no separate API needed. */

function useSiteSources() {
  const [sources, setSources] = useState({}); // id -> { html, header, footer, links }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const withFiles = SITE_PAGES.filter((p) => p.source);

    Promise.all(
      withFiles.map(async (p) => {
        try {
          const res = await fetch(previewUrl(p));
          if (!res.ok) throw new Error(String(res.status));
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const grab = (sel) => doc.querySelector(sel)?.outerHTML || null;

          // The paste-ready fragment, when this page is one the build assembles.
          let ghlHtml = null;
          const gu = ghlUrl(p);
          if (gu) {
            try {
              const g = await fetch(gu);
              if (g.ok) ghlHtml = await g.text();
            } catch { /* preview still works without it */ }
          }

          return [p.id, {
            html,
            ghlHtml,
            seoTitle: doc.querySelector('title')?.textContent?.trim() || '',
            seoDescription:
              doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '',
            header: grab('header'),
            footer: grab('footer'),
            links: [...doc.querySelectorAll('a[href]')]
              .map((a) => a.getAttribute('href'))
              .filter((h) => h && !/^(https?:|mailto:|tel:|javascript:|#)/i.test(h)),
          }];
        } catch {
          return [p.id, { error: true }];
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setSources(Object.fromEntries(entries));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  return { sources, loading };
}

/* Collapse whitespace so formatting differences don't read as real differences. */
const fingerprint = (html) => (html || '').replace(/\s+/g, ' ').trim();

/* ─── Device preview ───
   Renders the page at a real device viewport, then scales the whole frame down
   to fit the panel. Sizing the iframe to the panel instead would make the page
   lay itself out at ~900px — a tablet breakpoint — which is why it looked
   squared off rather than like a desktop browser. */

const DEVICES = {
  desktop: { w: 1440, h: 900 },
  phone: { w: 390, h: 844 },
};

function DevicePreview({ src, title, device }) {
  const { w, h } = DEVICES[device];
  const [box, setBox] = useState(null);

  // Measure the available width so the scale factor tracks the panel.
  const [el, setEl] = useState(null);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  // Never scale above 1:1 — a phone frame blown up would just be blurry.
  const scale = box ? Math.min(1, box / w) : null;

  return (
    <div ref={setEl} className="w-full">
      <div
        className="bg-card rounded-2xl border border-border-subtle overflow-hidden mx-auto"
        style={{
          width: scale ? w * scale : '100%',
          height: scale ? h * scale : h,
        }}
      >
        {scale && (
          <iframe
            src={src}
            title={title}
            className="border-0 block origin-top-left"
            style={{ width: w, height: h, transform: `scale(${scale})` }}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Code block ─── */

function CodeBlock({ code, empty }) {
  const [copied, setCopied] = useState(false);

  if (!code) {
    return (
      <div className="rounded-xl border border-dashed border-border-subtle p-8 text-center">
        <p className="text-sm text-muted">{empty}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          navigator.clipboard?.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-border-strong text-secondary text-[11px] font-semibold hover:text-primary transition-colors cursor-pointer"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="rounded-xl border border-border-subtle bg-surface-alt p-4 pt-12 overflow-auto max-h-[65vh] text-[11px] leading-relaxed">
        <code className="font-mono text-secondary whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

/* ─── Main ─── */

const VIEWS = [
  { id: 'preview', label: 'Preview' },
  { id: 'paste', label: 'Paste to GHL' },
  { id: 'seo', label: 'SEO' },
  { id: 'header', label: 'Header' },
  { id: 'footer', label: 'Footer' },
  { id: 'source', label: 'Full code' },
];

/* ─── Paste to GHL ───
   Everything needed to update one page in Go High Level, in the order you do
   it, each piece copyable on its own. The code here is the fragment, not the
   full document: GHL supplies its own <html><head><body>, and pasting a
   complete document inside it is what put two <title> tags on every live
   service page. */

function CopyRow({ label, value, hint, mono }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-surface-alt">
        <div className="min-w-0">
          <p className="text-xs font-bold text-primary">{label}</p>
          {hint && <p className="text-[11px] text-muted mt-0.5">{hint}</p>}
        </div>
        <button
          onClick={copy}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-card text-primary hover:bg-brand-light transition-colors cursor-pointer"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className={`px-3.5 py-2.5 text-xs text-secondary break-words ${mono ? 'font-mono' : ''}`}>
        {value.length > 220 ? `${value.slice(0, 220)}…` : value}
      </p>
    </div>
  );
}

function PastePanel({ page, ghlHtml, loading }) {
  if (!ghlUrl(page)) {
    return (
      <div className="rounded-2xl border border-dashed border-border-subtle p-10 text-center">
        <FileCode2 size={20} className="mx-auto text-muted mb-2" />
        <p className="text-sm font-semibold text-primary">Not a built page</p>
        <p className="text-xs text-muted mt-1 max-w-md mx-auto">
          Only pages assembled by <code className="font-mono">site/build.mjs</code> have a
          paste-ready version. This one is edited directly, so copy it from Full code.
        </p>
      </div>
    );
  }
  if (loading) {
    return (
      <p className="text-xs text-muted flex items-center gap-2 px-1">
        <Loader2 size={13} className="animate-spin" /> Loading paste version…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-brand-light/40 border border-border-subtle px-4 py-3">
        <p className="text-xs font-semibold text-primary">
          In Go High Level, open the page for <code className="font-mono">{page.path}</code>,
          then work down this list.
        </p>
      </div>

      <CopyRow
        label="1. Page HTML"
        hint="Paste into the page's custom-code block, replacing everything in it"
        value={ghlHtml || ''}
        mono
      />
      <CopyRow
        label="2. SEO title"
        hint={`Page settings → Title · ${(page.seoTitle || '').length} characters`}
        value={page.seoTitle || ''}
      />
      <CopyRow
        label="3. Meta description"
        hint={`Page settings → Description · ${(page.seoDescription || '').length} characters`}
        value={page.seoDescription || ''}
      />

      <p className="text-[11px] text-muted leading-relaxed px-1">
        The HTML deliberately contains no <code className="font-mono">&lt;title&gt;</code> or
        meta description — GHL emits its own from the settings above, and crawlers read
        whichever comes first. Keeping them out of the markup is what stops a page having two.
      </p>
    </div>
  );
}

/* ─── SEO panel ───
   Findings are ordered errors-first because that ordering is the whole point:
   an empty page or a dead link costs far more than a long title, and a list
   that mixes them trains you to skim past both. */

function Finding({ f }) {
  const isError = f.severity === SEVERITY.error;
  return (
    <div
      className={`rounded-xl border px-3.5 py-3 ${
        isError
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-amber-500/25 bg-amber-500/5'
      }`}
    >
      <p className="flex items-start gap-2 text-xs font-semibold">
        {isError ? (
          <XCircle size={13} className="mt-0.5 shrink-0 text-red-500" />
        ) : (
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
        )}
        <span className={isError ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-500'}>
          {f.message}
        </span>
      </p>
      {f.fix && <p className="text-[11px] text-muted mt-1.5 pl-[21px] leading-relaxed">{f.fix}</p>}
    </div>
  );
}

function SeoPanel({ audit }) {
  if (!audit) return null;
  const { findings, stats } = audit;
  const errors = findings.filter((f) => f.severity === SEVERITY.error);
  const warnings = findings.filter((f) => f.severity === SEVERITY.warning);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['Words', stats.words ?? '—'],
          ['Title', stats.title ? `${stats.title.length} chars` : 'missing'],
          ['Description', stats.desc ? `${stats.desc.length} chars` : 'missing'],
          ['H1', stats.h1 ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface-alt px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
            <p className="text-sm font-semibold text-primary mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {stats.schemaTypes?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {[...new Set(stats.schemaTypes)].map((t) => (
            <span key={t} className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-brand-light text-brand-text-strong">
              {t}
            </span>
          ))}
        </div>
      )}

      {findings.length === 0 ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
          <ShieldCheck size={20} className="mx-auto text-emerald-500 mb-2" />
          <p className="text-sm font-semibold text-primary">Clean</p>
          <p className="text-xs text-muted mt-1">
            Every link resolves, and the page has a title, description, and one h1.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {errors.map((f, i) => <Finding key={`e${i}`} f={f} />)}
          {warnings.map((f, i) => <Finding key={`w${i}`} f={f} />)}
        </div>
      )}
    </div>
  );
}

export default function Website() {
  const { sources, loading } = useSiteSources();
  const [selectedId, setSelectedId] = useState(SITE_PAGES[0]?.id);
  const [view, setView] = useState('preview');
  const [wide, setWide] = useState(true);

  const page = SITE_PAGES.find((p) => p.id === selectedId) || SITE_PAGES[0];
  const src = sources[page?.id] || {};

  // Whatever most pages use is the de facto standard; the rest have drifted.
  const { headerGroups, footerGroups } = useMemo(() => {
    const group = (field) => {
      const map = new Map();
      for (const p of SITE_PAGES) {
        const s = sources[p.id];
        if (!s || s.error) continue;
        const key = fingerprint(s[field]) || '(none)';
        map.set(key, [...(map.get(key) || []), p.id]);
      }
      return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
    };
    return { headerGroups: group('header'), footerGroups: group('footer') };
  }, [sources]);

  const oddFor = (field, id) => {
    const groups = field === 'header' ? headerGroups : footerGroups;
    if (groups.length < 2) return false;
    const [, biggest] = groups[0];
    return !biggest.includes(id);
  };
  const odd = (field) => oddFor(field, page.id);

  // Audit every page that has a local file, so the sidebar can show counts and
  // the summary can rank rules by how much each one is costing.
  const audits = useMemo(() => {
    const out = {};
    for (const p of SITE_PAGES) {
      const s = sources[p.id];
      if (!s || s.error || !s.html) continue;
      out[p.id] = auditPage(s.html, p, {
        headerDrift: oddFor('header', p.id),
        footerDrift: oddFor('footer', p.id),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, headerGroups, footerGroups]);

  const summary = useMemo(() => summarize(audits), [audits]);
  const errorCount = (id) =>
    (audits[id]?.findings || []).filter((f) => f.severity === SEVERITY.error).length;

  const brokenOnPage = (src.links || []).filter((href) =>
    KNOWN_BROKEN_LINKS.some((b) => b.path === href)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-primary">Website</h1>
          <p className="text-sm text-muted mt-0.5">
            The files in <code className="font-mono text-xs">{SITE_REPO}</code> — what
            we&rsquo;re building. Paste into Go High Level when a page is ready.
          </p>
        </div>
      </div>

      {/* Site-level SEO summary. Ranked by rule so the top row is always the
          single fix that removes the most errors. */}
      {!loading && summary.pagesAudited > 0 && (
        <div
          className={`rounded-2xl border px-4 py-3.5 ${
            summary.errors
              ? 'border-red-500/25 bg-red-500/[0.04]'
              : 'border-emerald-500/25 bg-emerald-500/[0.04]'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            {summary.errors ? (
              <XCircle size={15} className="text-red-500 shrink-0" />
            ) : (
              <ShieldCheck size={15} className="text-emerald-500 shrink-0" />
            )}
            <p className="text-sm font-semibold text-primary">
              {summary.errors
                ? `${summary.errors} error${summary.errors > 1 ? 's' : ''} across ${summary.pagesWithErrors} of ${summary.pagesAudited} pages`
                : `All ${summary.pagesAudited} pages clean`}
            </p>
            {summary.warnings > 0 && (
              <span className="text-xs text-muted">
                &middot; {summary.warnings} warning{summary.warnings > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {summary.byRule.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {summary.byRule.slice(0, 6).map((r) => (
                <span
                  key={r.rule}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${
                    r.severity === SEVERITY.error
                      ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-500'
                  }`}
                >
                  {r.rule} &times;{r.count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Page list, grouped: Main → Services → Legal */}
        <div className="lg:w-56 shrink-0 space-y-4">
          {groupedPages().map((section) => (
            <div key={section.id} className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted">
                {section.label}
              </p>
              {section.pages.map((p) => {
                const s = sources[p.id] || {};
                const active = p.id === page?.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                      active ? 'bg-brand-light text-brand-text-strong' : 'hover:bg-surface-alt'
                    }`}
                  >
                    <p className={`text-sm font-semibold truncate flex items-center gap-1.5 ${active ? '' : 'text-primary'}`}>
                      <span className="truncate">{p.label}</span>
                      {errorCount(p.id) > 0 && (
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-600 dark:text-red-400">
                          {errorCount(p.id)}
                        </span>
                      )}
                    </p>
                    <p className={`text-[11px] truncate ${active ? 'opacity-80' : 'text-muted'}`}>
                      {p.source || 'no local file'}
                    </p>
                    {s.error && (
                      <p className="text-[10px] text-amber-600 mt-0.5">file not found</p>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Detail */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 bg-surface-alt p-1 rounded-xl">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    view === v.id ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'
                  }`}
                >
                  {v.label}
                  {(v.id === 'header' || v.id === 'footer') && odd(v.id) && (
                    <span className="ml-1.5 text-amber-500">&bull;</span>
                  )}
                  {v.id === 'seo' && errorCount(page?.id) > 0 && (
                    <span className="ml-1.5 text-red-500">{errorCount(page.id)}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {view === 'preview' && (
                <div className="flex gap-1 bg-surface-alt p-1 rounded-xl mr-1">
                  <button
                    onClick={() => setWide(true)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${wide ? 'bg-card text-primary shadow-sm' : 'text-muted'}`}
                    title="Desktop width"
                  >
                    <Monitor size={14} />
                  </button>
                  <button
                    onClick={() => setWide(false)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${!wide ? 'bg-card text-primary shadow-sm' : 'text-muted'}`}
                    title="Phone width"
                  >
                    <Smartphone size={14} />
                  </button>
                </div>
              )}
              {page?.source && (
                <a
                  href={previewUrl(page)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-muted hover:text-primary hover:bg-surface-alt transition-colors"
                  title="Open the local page in its own tab"
                >
                  <FileCode2 size={15} />
                </a>
              )}
              <a
                href={liveUrl(page)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg text-muted hover:text-primary hover:bg-surface-alt transition-colors"
                title="Open the published page"
              >
                <ExternalLink size={15} />
              </a>
            </div>
          </div>

          {/* Drift + broken link warnings for this page */}
          {(odd('header') || odd('footer') || brokenOnPage.length > 0) && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1">
              {odd('header') && (
                <p className="text-xs text-amber-700 dark:text-amber-500 flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  This page&rsquo;s header differs from most other pages.
                </p>
              )}
              {odd('footer') && (
                <p className="text-xs text-amber-700 dark:text-amber-500 flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  This page&rsquo;s footer differs from most other pages.
                </p>
              )}
              {brokenOnPage.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-500 flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  Links to {brokenOnPage.map((l) => <code key={l} className="font-mono mx-0.5">{l}</code>)}
                  &mdash; not a real page.
                </p>
              )}
            </div>
          )}

          {loading && (
            <p className="text-xs text-muted flex items-center gap-2 px-1">
              <Loader2 size={13} className="animate-spin" /> Reading page files…
            </p>
          )}

          {/* The work surface */}
          {!page?.source ? (
            <div className="rounded-2xl border border-dashed border-border-subtle p-12 text-center">
              <FileCode2 size={22} className="mx-auto text-muted mb-2" />
              <p className="text-sm font-semibold text-primary">No local file</p>
              <p className="text-xs text-muted mt-1">
                This page lives only in Go High Level. Add a file to{' '}
                <code className="font-mono">{SITE_REPO}</code> to manage it here.
              </p>
            </div>
          ) : view === 'preview' ? (
            <DevicePreview
              key={`${page.id}-${wide}`}
              src={previewUrl(page)}
              title={page.label}
              device={wide ? 'desktop' : 'phone'}
            />
          ) : view === 'paste' ? (
            <PastePanel
              page={{ ...page, seoTitle: src.seoTitle, seoDescription: src.seoDescription }}
              ghlHtml={src.ghlHtml}
              loading={loading}
            />
          ) : view === 'seo' ? (
            <SeoPanel audit={audits[page.id]} />
          ) : view === 'header' ? (
            <CodeBlock code={src.header} empty="This page has no <header> element." />
          ) : view === 'footer' ? (
            <CodeBlock code={src.footer} empty="This page has no <footer> element." />
          ) : (
            <CodeBlock code={src.html} empty="Could not read this file." />
          )}
        </div>
      </div>
    </div>
  );
}
