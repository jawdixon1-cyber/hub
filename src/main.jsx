import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { getTimezone } from './utils/timezone'
import App from './App.jsx'

// One-time migration: clear bad applicationForm from cache so defaults load
if (!localStorage.getItem('greenteam-form-migrated-v2')) {
  try {
    const cache = JSON.parse(localStorage.getItem('greenteam-data-cache') || '{}');
    delete cache['greenteam-applicationForm'];
    localStorage.setItem('greenteam-data-cache', JSON.stringify(cache));
  } catch {}
  localStorage.setItem('greenteam-form-migrated-v2', '1');
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
