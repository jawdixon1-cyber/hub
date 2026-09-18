// ─── SEO audit ───
//
// The checks that would have caught what tanked Site Health from 76% to 26%:
// three pages live as 200s with zero content, nine internal links pointing at
// URLs that only resolve on a local disk, and a /services hub that four pages
// link to but which returns 404.
//
// Every rule here earned its place by matching a real defect found on the live
// site on 2026-08-30. This is deliberately not a generic SEO checklist — a rule
// that has never caught anything is noise that trains you to ignore the panel.
//
// Runs against page HTML, so it sees what a crawler sees rather than what the
// source intends.

import { SITE_PAGES } from '../data/sitePages';

export const SEVERITY = { error: 'error', warning: 'warning' };

// Every path the site is allowed to link to. A link to anything else is an
// error — that is the check that would have flagged /lawn-mowing.html.
const validPaths = () => {
  const set = new Set(SITE_PAGES.map((p) => p.path.replace(/\/$/, '') || '/'));
  set.add('/'); // home, however it is written
  return set;
};

const visibleText = (doc) => {
  const clone = doc.body?.cloneNode(true);
  if (!clone) return '';
  clone.querySelectorAll('script,style,noscript,svg,template').forEach((n) => n.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
};

/**
 * Audit one page.
 * @param {string} html   the page source
 * @param {object} page   its SITE_PAGES entry
 * @param {object} [opts] { headerDrift, footerDrift } from the caller's grouping
 * @returns {{ findings: Array, stats: object }}
 */
export function auditPage(html, page, opts = {}) {
  const findings = [];
  const add = (severity, rule, message, fix) =>
    findings.push({ severity, rule, message, fix });

  if (!html) {
    add(SEVERITY.error, 'unreachable', 'Page source could not be loaded.',
      'Check that the file exists and the dev server is running.');
    return { findings, stats: {} };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = visibleText(doc);
  const words = text ? text.split(' ').filter(Boolean).length : 0;

  const title = doc.querySelector('title')?.textContent?.trim() || '';
  const desc = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
  const h1s = [...doc.querySelectorAll('h1')];
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
  const robots = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
  const schemaTypes = [...doc.querySelectorAll('script[type="application/ld+json"]')]
    .flatMap((s) => {
      try {
        const parsed = JSON.parse(s.textContent);
        const items = parsed['@graph'] || (Array.isArray(parsed) ? parsed : [parsed]);
        return items.flatMap((i) => [].concat(i['@type'] || []));
      } catch {
        add(SEVERITY.error, 'schema-invalid', 'A JSON-LD block is not valid JSON.',
          'Google silently ignores the whole block. Validate it.');
        return [];
      }
    });

  // ─── content ───
  // The single most damaging defect on the live site: a page that returns 200
  // with nothing on it fires missing-title, missing-h1, missing-description,
  // thin-content AND duplicate-content all at once.
  if (words < 50) {
    add(SEVERITY.error, 'empty-page',
      `Only ${words} visible words — this reads to a crawler as an empty page.`,
      'Either write the page or unpublish it. An empty 200 is worse than a 404.');
  } else if (words < 300) {
    add(SEVERITY.warning, 'thin-content',
      `${words} words is thin for a service page.`,
      'Aim for 600+ on pages meant to rank.');
  }

  // ─── head ───
  if (!title) {
    add(SEVERITY.error, 'no-title', 'No <title>.', 'Every indexable page needs one.');
  } else if (title.length > 60) {
    add(SEVERITY.warning, 'title-long',
      `Title is ${title.length} characters; results truncate around 60.`,
      'Front-load the keyword and city so they survive the cut.');
  }

  if (!desc) {
    add(SEVERITY.error, 'no-description', 'No meta description.',
      'Google writes its own from page text, usually worse than yours.');
  } else if (desc.length > 160) {
    add(SEVERITY.warning, 'description-long',
      `Description is ${desc.length} characters; ~160 is the cut.`, 'Trim it.');
  }

  if (h1s.length === 0) {
    add(SEVERITY.error, 'no-h1', 'No <h1> on the page.', 'Add exactly one.');
  } else if (h1s.length > 1) {
    add(SEVERITY.error, 'multiple-h1',
      `${h1s.length} <h1> tags — there must be exactly one.`,
      'Demote the extras to <h2>.');
  } else {
    const h1 = h1s[0].textContent.replace(/\s+/g, ' ').trim();
    // Caught "Sharp Curb Appeal.Zero Stress." on the live homepage.
    if (/[a-z]\.[A-Z]/.test(h1)) {
      add(SEVERITY.warning, 'h1-spacing',
        `The h1 is missing a space after a period: "${h1}"`,
        'Crawlers read it as one run-together word.');
    }
  }

  // ─── links ───
  // .html paths resolve when previewing files locally but 404 on Go High Level.
  // This is what put six broken links on /aeration-overseeding.
  const valid = validPaths();
  const internal = [...doc.querySelectorAll('a[href]')]
    .map((a) => a.getAttribute('href'))
    .filter((h) => h && h.startsWith('/'));

  const htmlLinks = [...new Set(internal.filter((h) => h.endsWith('.html')))];
  if (htmlLinks.length) {
    add(SEVERITY.error, 'html-links',
      `${htmlLinks.length} link${htmlLinks.length > 1 ? 's' : ''} to a .html URL: ${htmlLinks.join(', ')}`,
      'Those resolve only on disk. Drop the extension — GHL routes are extensionless.');
  }

  const dead = [...new Set(
    internal
      .map((h) => h.split(/[#?]/)[0].replace(/\/$/, '') || '/')
      .filter((p) => !p.endsWith('.html') && !valid.has(p))
  )];
  if (dead.length) {
    add(SEVERITY.error, 'dead-links',
      `Links to ${dead.length} path${dead.length > 1 ? 's' : ''} that are not real pages: ${dead.join(', ')}`,
      'Either build the page or remove the link.');
  }

  // ─── indexability ───
  const expectedCanonical = `https://heyjudeslawncare.com${page.path === '/' ? '/' : page.path}`;
  if (!canonical) {
    add(SEVERITY.warning, 'no-canonical', 'No canonical URL.',
      'Set one so duplicate paths consolidate.');
  } else if (canonical.replace(/\/$/, '') !== expectedCanonical.replace(/\/$/, '')) {
    // /grow declares a canonical of /hiring, which is itself a 404.
    add(SEVERITY.error, 'canonical-mismatch',
      `Canonical points at ${canonical} but this page lives at ${page.path}.`,
      'A canonical aimed at another URL tells Google to index that one instead.');
  }

  const noindexed = /noindex/i.test(robots);
  const shouldIndex = page.group !== 'legal' && page.group !== 'versions';
  if (noindexed && shouldIndex) {
    add(SEVERITY.error, 'unexpected-noindex',
      'This page is set to noindex but looks like it should rank.',
      'Remove noindex, or move it out of the indexable set.');
  }

  // ─── schema ───
  if (shouldIndex && !schemaTypes.length) {
    add(SEVERITY.warning, 'no-schema', 'No structured data.',
      'LocalBusiness + Service + FAQPage is the pattern your other pages use.');
  }

  // ─── drift ───
  if (opts.headerDrift) {
    add(SEVERITY.warning, 'header-drift',
      'This page’s header differs from the one most pages use.',
      'Rebuild it from site/partials/header.html.');
  }
  if (opts.footerDrift) {
    add(SEVERITY.warning, 'footer-drift',
      'This page’s footer differs from the one most pages use.',
      'Rebuild it from site/partials/footer.html.');
  }

  return {
    findings,
    stats: { words, title, desc, h1: h1s.length, canonical, robots, schemaTypes },
  };
}

/** Roll per-page findings into a site-level summary. */
export function summarize(results) {
  const all = Object.values(results).flatMap((r) => r.findings || []);
  const errors = all.filter((f) => f.severity === SEVERITY.error);
  const warnings = all.filter((f) => f.severity === SEVERITY.warning);
  const pagesWithErrors = Object.values(results).filter(
    (r) => (r.findings || []).some((f) => f.severity === SEVERITY.error)
  ).length;

  // By rule, worst first — tells you which single fix buys the most.
  const byRule = [...all.reduce((m, f) => {
    const cur = m.get(f.rule) || { rule: f.rule, severity: f.severity, count: 0 };
    cur.count += 1;
    return m.set(f.rule, cur);
  }, new Map()).values()].sort((a, b) =>
    (a.severity === b.severity ? b.count - a.count : a.severity === SEVERITY.error ? -1 : 1)
  );

  return {
    errors: errors.length,
    warnings: warnings.length,
    pagesWithErrors,
    pagesAudited: Object.keys(results).length,
    byRule,
  };
}
