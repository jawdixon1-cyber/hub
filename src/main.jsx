import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'

// Public pages served by the server (client estimate pages, the lights lead form, referral links).
// A device with an OLD copy of the Hub app cached opens the app here instead (→ login screen).
// Get the page from the server: update the app helper once, then reload; if that still fails, step around it.
const PUBLIC_PAGE = /^\/(e\/|e$|estimate\/|q\/|rough-|lights-start|refer\/)/;
if (PUBLIC_PAGE.test(window.location.pathname) && 'serviceWorker' in navigator) {
  const target = window.location.href; // the app may redirect to its login before we reload — keep the real address
  const tried = sessionStorage.getItem('hub-public-page-retry');
  sessionStorage.setItem('hub-public-page-retry', '1');
  navigator.serviceWorker.getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => (tried ? r.unregister() : r.update()))))
    .catch(() => null)
    .finally(() => setTimeout(() => window.location.replace(target), tried ? 0 : 600));
}
import './index.css'
import { getTimezone } from './utils/timezone'
import App from './App.jsx'

// One-time migration: clear bad applicationForm from cache so defaults load
if (!localStorage.getItem('greenteam-form-migrated-v15')) {
  try {
    const cache = JSON.parse(localStorage.getItem('greenteam-data-cache') || '{}');
    delete cache['greenteam-applicationForm'];
    localStorage.setItem('greenteam-data-cache', JSON.stringify(cache));
  } catch {}
  localStorage.setItem('greenteam-form-migrated-v15', '1');
}

// Set default timezone to EST on first visit
if (!localStorage.getItem('greenteam-timezone')) {
  localStorage.setItem('greenteam-timezone', getTimezone());
}
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'

// Auto-reload when a new service worker activates
registerSW({
  onNeedRefresh() {
    window.location.reload();
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
