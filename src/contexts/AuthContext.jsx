import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState(null);

  // Look up user's org_id from org_members when session changes
  useEffect(() => {
    if (!session?.user?.id) { setOrgId(null); return; }
    supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setOrgId(data?.org_id ?? null);
      })
      .catch(() => setOrgId(null));
  }, [session?.user?.id]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT' && !newSession) {
        // Don't immediately log out — try to recover the session first
        supabase.auth.getSession().then(({ data }) => {
          if (data?.session) {
            setSession(data.session);
          } else {
            setSession(null);
          }
        });
      } else {
        setSession(newSession);
      }
      setLoading(false);
    });

    // Also try to restore session on mount
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setSession(data.session);
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
    <AuthContext.Provider value={{ session, user, currentUser, ownerMode, orgId, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
