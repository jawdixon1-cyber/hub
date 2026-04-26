import fs from 'node:fs';

const { initialHiringContent, initialApplicationForm } = await import(new URL('../src/data/hiringDefaults.js', import.meta.url));
const content = initialHiringContent;
const form = initialApplicationForm;

const hiringPath = new URL('../src/pages/Hiring.jsx', import.meta.url);
const src = fs.readFileSync(hiringPath, 'utf8');

const fnStart = src.indexOf('const getHiringHtml = () => {');
if (fnStart < 0) { console.error('Could not find getHiringHtml'); process.exit(1); }
const bodyOpen = src.indexOf('{', fnStart) + 1;
const bodyClose = src.indexOf('return html;\n  };', bodyOpen);
if (bodyClose < 0) { console.error('Could not find function end'); process.exit(1); }
let body = src.slice(bodyOpen, bodyClose) + 'return html;';

body = body.replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, 'process.env.VITE_SUPABASE_URL || "https://onnytrkhbnsmstgywcrw.supabase.co"');
body = body.replace(/import\.meta\.env\.VITE_SUPABASE_ANON_KEY/g, 'process.env.VITE_SUPABASE_ANON_KEY || ""');

const fn = new Function('content', 'form', body);
const html = fn(content, form);

const outPath = '/mnt/c/Users/miche/Desktop/hey-judes-hiring-page.html';
fs.writeFileSync(outPath, html);
console.log('Written to:', outPath);
console.log('Size:', html.length, 'bytes');
