import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginForm() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('remember-me') === 'true');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (rememberMe) {
      localStorage.setItem('remember-me', 'true');
    } else {
      localStorage.removeItem('remember-me');
    }

    const { error } = await signIn(email, password);
    if (error) {
      setError(error.message);
      setSubmitting(false);
    }
    // Don't navigate — onAuthStateChange updates session automatically,
    // which causes App.jsx to show the logged-in view.
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-8 max-w-sm w-full text-center">
        <img src="/logo.png" alt="Lawn Care Hub" className="h-20 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-primary mb-0.5">Lawn Care Hub</h1>
        <p className="text-tertiary text-sm mb-8">Sign in to continue</p>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
              placeholder="Your password"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-border-strong accent-emerald-600"
            />
            <span className="text-sm text-secondary">Remember me</span>
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-800 text-white font-semibold text-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
