// Renders the ACTUAL HiringPagePreview React component (with Tailwind classes) to static HTML
// via Vite's SSR support, AND swaps in the working static form + JS so the form actually submits.
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import fs from 'node:fs';

const server = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { middlewareMode: true },
  appType: 'custom',
});

const hiring = await server.ssrLoadModule('/src/pages/Hiring.jsx');
const defaults = await server.ssrLoadModule('/src/data/hiringDefaults.js');
const HiringPagePreview = hiring.HiringPagePreview;
const content = defaults.initialHiringContent;
const form = defaults.initialApplicationForm;

const withoutApply = renderToStaticMarkup(
  React.createElement(HiringPagePreview, { content, steps: form?.steps, hideApplySection: true })
);

// Generate the static HTML via the same generator that Copy Page Code uses
// We re-use tools/generate-html.mjs logic inline
const hiringSrc = fs.readFileSync(new URL('../src/pages/Hiring.jsx', import.meta.url), 'utf8');
const fnStart = hiringSrc.indexOf('const getHiringHtml = () => {');
const bodyOpen = hiringSrc.indexOf('{', fnStart) + 1;
const bodyClose = hiringSrc.indexOf('return html;\n  };', bodyOpen);
let body = hiringSrc.slice(bodyOpen, bodyClose) + 'return html;';
// Read actual env vars from .env.local so uploads work from local file
const envLocal = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const envUrl = (envLocal.match(/VITE_SUPABASE_URL="?([^"\n]+)"?/)?.[1]) || 'https://onnytrkhbnsmstgywcrw.supabase.co';
const envKey = (envLocal.match(/VITE_SUPABASE_ANON_KEY="?([^"\n]+)"?/)?.[1]) || '';
body = body.replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, JSON.stringify(envUrl));
body = body.replace(/import\.meta\.env\.VITE_SUPABASE_ANON_KEY/g, JSON.stringify(envKey));
const fn = new Function('content', 'form', body);
const staticHtml = fn(content, form);

const styleMatch = staticHtml.match(/<style>[\s\S]*?<\/style>/);
const styleBlock = styleMatch ? styleMatch[0] : '';

// Extract apply section + the trailing <script> block from the static HTML
const applyStart = staticHtml.indexOf('id="apply"');
const divStart = applyStart >= 0 ? staticHtml.lastIndexOf('<div', applyStart) : -1;
const applyPlusScript = divStart >= 0 ? staticHtml.slice(divStart) : '';

const html = `<!doctype html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
${styleBlock}
<style>html,body{margin:0;padding:0;background:#000;color:#fff;font-family:'Montserrat',system-ui,sans-serif}*{box-sizing:border-box}</style>
</head><body>
<div style="background:#000;min-height:100vh">
${withoutApply}
<div style="max-width:1020px;margin:0 auto;padding:0 16px">
${applyPlusScript}
</div>
</div>
</body></html>`;

fs.writeFileSync('/mnt/c/Users/miche/Desktop/hey-judes-hiring-page.html', html);
console.log('Written to desktop —', html.length, 'bytes');
await server.close();
