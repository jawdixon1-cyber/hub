import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The website repo lives beside this one. The Website tab previews those files
// directly so you see what you're building, not what's already published to Go
// High Level. Served straight from disk — no copying, so an edit shows up on
// reload. Dev only: this never runs in a production build.
const SITE_DIR = fileURLToPath(new URL('../heyjudes-website', import.meta.url))

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon',
}

// Injected into previewed pages only. Never part of the real site.
const PREVIEW_LINK_GUARD = `
<script>(function(){
  var bar=document.createElement('div');
  bar.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:8px 14px;'+
    'background:rgba(0,0,0,.88);color:#fff;font:600 12px/1.3 system-ui,sans-serif;'+
    'display:none;text-align:center;backdrop-filter:blur(6px)';
  document.addEventListener('DOMContentLoaded',function(){document.body.appendChild(bar)});
  var t;
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[href]');
    if(!a)return;
    var href=a.getAttribute('href')||'';
    if(/^(mailto:|tel:)/i.test(href))return;            // let these work
    if(/^https?:/i.test(href)&&a.target==='_blank')return; // external new-tab links are fine
    e.preventDefault();
    bar.textContent='Preview — this link goes to  '+href;
    bar.style.display='block';
    clearTimeout(t); t=setTimeout(function(){bar.style.display='none'},2200);
  },true);
})();</script>`

function serveSitePages() {
  return {
    name: 'serve-site-pages',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/site-preview', (req, res, next) => {
        const rel = decodeURIComponent((req.url || '/').split('?')[0])
        const target = path.join(SITE_DIR, rel)
        // Refuse anything that escapes the site directory.
        if (!target.startsWith(SITE_DIR)) { res.statusCode = 403; return res.end('Forbidden') }
        fs.stat(target, (err, stat) => {
          if (err || !stat.isFile()) return next()
          const ext = path.extname(target).toLowerCase()
          res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
          res.setHeader('Cache-Control', 'no-store') // always show the latest edit
          if (ext !== '.html') return fs.createReadStream(target).pipe(res)
          // Site links are root-relative ("/", "/quote"), which resolve against
          // the dev server — so clicking one would navigate the preview into the
          // Hub app. Neutralise internal links and show where they'd go instead.
          fs.readFile(target, 'utf8', (e, html) => {
            if (e) return next()
            res.end(html.replace(/<\/body>/i, PREVIEW_LINK_GUARD + '</body>'))
          })
        })
      })
    },
  }
}

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
    watch: {
      usePolling: true,
      interval: 500,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-dnd': ['@dnd-kit/core'],
          'vendor-zustand': ['zustand'],
          'vendor-leaflet': ['leaflet', 'react-leaflet', 'leaflet-draw'],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    serveSitePages(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "Hey Jude's Lawn Care Management App",
        short_name: "Hey Jude's Lawn Care Management App",
        start_url: '/',
        display: 'standalone',
        theme_color: '#000000',
        background_color: '#000000',
        icons: [
          {
            src: '/app-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/app-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})
