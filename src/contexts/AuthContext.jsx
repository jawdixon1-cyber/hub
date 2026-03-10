import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If user didn't check "Remember me", clear session on fresh tab open
    const remembered = localStorage.getItem('remember-me') === 'true';
    const tabKey = sessionStorage.getItem('active-tab');
    if (!remembered && !tabKey) {
      // Fresh browser open without remember me — sign out
      supabase.auth.signOut().then(() => setLoading(false));
      sessionStorage.setItem('active-tab', '1');
      return;
    }
    sessionStorage.setItem('active-tab', '1');

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = (email, password) => {
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = () => {
    return supabase.auth.signOut();
  };

  const user = session?.user ?? null;
  const currentUser = user?.user_metadata?.display_name ?? null;
  const ownerMode = user?.user_metadata?.role === 'owner';

  return (
    <AuthContext.Provider value={{ session, user, currentUser, ownerMode, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
