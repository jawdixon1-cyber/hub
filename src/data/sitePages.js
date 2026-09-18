// ─── Website page registry ───
//
// The single source of truth for "what pages does the website have". The Website
// tab renders straight off this list, so adding a page is one entry here and
// nothing else.
//
// This file is also the shared vocabulary between Jude and Claude Code. When a
// page is named in conversation ("fix the mowing footer"), `id` and `source` are
// what make it unambiguous which live URL and which local file are meant.
//
// Field notes:
//   id      — short stable handle used in conversation and as the React key
//   label   — human name shown on the card
//   path    — live path under SITE_ORIGIN; '/' is the homepage
//   source  — file in the website repo that produces this page, edited with
//             Claude Code. null when the page is built in the site host's editor
//             and has no local file.
//   header  — which header treatment the page uses (see HEADER_VARIANTS)
//   footer  — which footer treatment the page uses (see FOOTER_VARIANTS)
//   group   — which section of the sidebar list it sits under (see PAGE_GROUPS)
//   status  — 'live' | 'draft' | 'broken'
//   notes   — anything worth remembering about the page

export const SITE_ORIGIN = 'https://heyjudeslawncare.com';

// Where the local page files live, for reference when editing with Claude Code.
export const SITE_REPO = '~/heyjudes-website';

// Naming the variants makes drift visible: two pages claiming different footers
// is the thing to go fix.
export const HEADER_VARIANTS = {
  'site-nav': 'Full site header',
  'service-hero': 'Service page hero',
  'site-nav-old': 'Full site header — stale (old logo, short services list)',
  'site-nav-light': 'Full site header — light theme',
  'logo-only': 'Logo bar only — no nav',
  none: 'No header',
  unknown: 'Not yet catalogued',
};

export const FOOTER_VARIANTS = {
  full: 'Full footer (hours, contact, legal links)',
  minimal: 'One-line copyright, no links',
  'full-old': 'Full footer — stale (old logo and tagline)',
  'full-light': 'Full footer — light theme',
  none: 'No footer',
  unknown: 'Not yet catalogued',
};

// Sidebar sections, in the order they appear. A page whose group isn't listed
// here falls into 'other' at the bottom rather than disappearing.
export const PAGE_GROUPS = [
  { id: 'main', label: 'Main' },
  // Old versions sit high while they're being mined for ideas — nine service
  // pages above them made getting to one a scroll every time.
  { id: 'versions', label: 'Old Versions' },
  { id: 'services', label: 'Services' },
  { id: 'legal', label: 'Legal' },
  { id: 'other', label: 'Other' },
];

// Seeded with the pages confirmed to return 200 on the live site. Jude will
// supply the real, complete list — add entries here as they come in.
export const SITE_PAGES = [
  {
    id: 'home',
    group: 'main',
    label: 'Home',
    path: '/',
    source: 'live/home.html',
    header: 'site-nav-light',
    footer: 'full-light',
    status: 'draft',
    notes: 'Light theme. Nav + footer here are the standard for the rest of the site.',
  },
  {
    id: 'mowing',
    group: 'services',
    label: 'Lawn Mowing',
    path: '/lawn-mowing',
    source: 'site/dist/lawn-mowing.html',
    header: 'site-nav-light',
    footer: 'full-light',
    status: 'draft',
    notes: '',
  },
  {
    id: 'mulch',
    group: 'services',
    label: 'Mulch Installation',
    path: '/mulch-installation',
    source: 'site/dist/mulch-installation.html',
    header: 'site-nav-light',
    footer: 'full-light',
    status: 'draft',
    notes: '',
  },
  {
    id: 'aeration',
    group: 'services',
    label: 'Aeration & Overseeding',
    path: '/aeration-overseeding',
    source: 'site/dist/aeration-overseeding.html',
    header: 'site-nav-light',
    footer: 'full-light',
    status: 'draft',
    notes: 'Not cross-linked from the other service pages.',
  },
  {
    id: 'quote',
    group: 'main',
    label: 'Get a Quote',
    path: '/quote',
    source: 'live/quote.html',
    header: 'site-nav',
    footer: 'full',
    status: 'draft',
    notes: 'New page holding the Jobber work request form. Not created in Go High Level yet.',
  },
  {
    id: 'plans',
    group: 'main',
    label: 'Yard Maintenance Plans',
    path: '/plans',
    source: 'site/dist/plans.html',
    header: 'site-nav-light',
    footer: 'full-light',
    status: 'draft',
    notes: 'Basic / Standard / Premium — names match the Jobber quote terms. Not created in Go High Level yet.',
  },
  // ─── Built from site/pages via site/build.mjs ───
  // These four are assembled from the shared partials, so their header and
  // footer cannot drift. dist/ is what gets pasted into Go High Level.
  {
    id: 'pine-straw',
    group: 'services',
    label: 'Pine Straw Installation',
    path: '/pine-straw-installation',
    source: 'site/dist/pine-straw-installation.html',
    header: 'site-nav-light',
    footer: 'full-light',
    status: 'draft',
    notes: 'Built 2026-08-30. Publish to kill the empty 200, but pulled from the nav — low margin, kept for long-tail search only.',
  },
  {
    id: 'hedge-trimming',
    group: 'services',
    label: 'Hedge Trimming',
    path: '/hedge-trimming',
    source: 'site/dist/hedge-trimming.html',
    header: 'site-nav-light',
    footer: 'full-light',
    status: 'draft',
    notes: 'Built 2026-08-30. Live URL currently serves an empty 200 — paste to replace.',
  },
  {
    id: 'leaf-cleanup',
    group: 'services',
    label: 'Yard Cleanup',
    path: '/leaf-cleanup',
    source: 'site/dist/leaf-cleanup.html',
    header: 'site-nav-light',
    footer: 'full-light',
    status: 'draft',
    notes: 'Live at /leaf-cleanup as an empty GHL shell — paste this over it.',
  },
  {
    id: 'thankyou',
    group: 'other',
    label: 'Thank You',
    path: '/thankyou',
    source: null,
    header: 'unknown',
    footer: 'unknown',
    status: 'live',
    notes: 'Where the homepage quote form redirects after submit.',
  },
  {
    id: 'hiring',
    group: 'other',
    label: 'Hiring',
    path: '/grow',
    source: 'live/hiring.html',
    header: 'logo-only',
    footer: 'none',
    status: 'live',
    notes: 'Standalone recruiting page + application form. Posts to hub.heyjudeslawncare.com; uploads go to Supabase storage.',
  },
  {
    id: 'privacy',
    group: 'legal',
    label: 'Privacy Policy',
    path: '/privacy-policy',
    source: 'live/privacy-policy.html',
    header: 'site-nav-old',
    footer: 'full-old',
    status: 'live',
    notes: 'Real live code, supplied 2026-08-26. Older logo + "Raise The Standard" tagline; nav dropdown lists only 2 of 6 services.',
  },
  {
    id: 'terms',
    group: 'legal',
    label: 'Terms of Service',
    path: '/terms-of-service',
    source: null,
    header: 'unknown',
    footer: 'unknown',
    status: 'live',
    notes: 'No local file — built in the site host.',
  },
  // ─── Saved homepage versions, kept for reference/inspiration ───
  // These are symlinks in versions/ pointing at the originals scattered around
  // the machine, so nothing is duplicated and edits to the originals show here.
  // Oldest first, so the list reads as the site's history.
  {
    id: 'v1-old', group: 'versions', label: 'v1 — OLD', path: '/',
    source: 'versions/v1-old.html', header: 'unknown', footer: 'unknown',
    status: 'draft', notes: 'From ~/heyjudes-site/OLD.html — 14 Jun 2026.',
  },
  {
    id: 'v7-new', group: 'versions', label: 'v7 — NEW (latest saved)', path: '/',
    source: 'versions/v7-new.html', header: 'unknown', footer: 'unknown',
    status: 'draft', notes: 'From ~/heyjudes-local/NEW.html — 20 Jun 2026. Largest of the set.',
  },
];

// Paths referenced by pages in the registry that do not resolve. Verified by
// hand on 2026-08-26; re-check when the site changes.
export const KNOWN_BROKEN_LINKS = [
  // Home's footer points at /legal/*.html, but privacy-policy.html's own
  // <link rel="canonical"> says the real URL is /privacy-policy. Home is wrong.
  { path: '/lawn-mowing-rock-hill-sc', linkedFrom: ['pick-your-goal'] },
  { path: '/cleanups', linkedFrom: ['pick-your-goal'] },
  { path: '/landscaping', linkedFrom: ['pick-your-goal'] },
];

// Pages bucketed into PAGE_GROUPS order, empty sections dropped. Page order
// within a section follows SITE_PAGES, so reordering there reorders the list.
export const groupedPages = () =>
  PAGE_GROUPS.map((g) => ({
    ...g,
    pages: SITE_PAGES.filter((p) => (p.group || 'other') === g.id),
  })).filter((g) => g.pages.length > 0);

// The published page, for comparison once something ships to Go High Level.
export const liveUrl = (page) => `${SITE_ORIGIN}${page.path}`;

// What the Website tab previews: the local file we're actually building, served
// from the website repo by the dev server (see the serveSitePages plugin in
// vite.config.js). Null when a page has no local file to show.
export const previewUrl = (page) =>
  page.source ? `/site-preview/${page.source}` : null;

// The paste-ready version. Go High Level wraps pasted code in its own
// <html><head><body>, so handing it a complete document produces two nested
// documents — which is how every live service page ended up with two <title>
// tags. dist/ghl/ holds the same page without that wrapper.
//
// Only built pages have one; a page edited directly in live/ does not.
export const ghlUrl = (page) =>
  page.source && page.source.startsWith('site/dist/')
    ? `/site-preview/${page.source.replace('site/dist/', 'site/dist/ghl/')}`
    : null;
