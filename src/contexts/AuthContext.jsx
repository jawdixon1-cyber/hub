import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Rely solely on onAuthStateChange — it fires INITIAL_SESSION on mount
    // which handles stored session restoration + token refresh automatically.
    // Calling getSession() separately causes a race where an expired token
    // sets session to null before the refresh completes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
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
