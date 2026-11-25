import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// Signed out after an hour with no activity on this device (all tabs share the
// last-activity time, and it's checked again when the device wakes up).
const IDLE_MS = 60 * 60 * 1000;
const IS_DEMO = typeof window !== 'undefined' && /^\/demo(\/|$)/.test(window.location.pathname);
const LAST_KEY = 'dp_last_activity';
export const IDLE_FLAG = 'dp_idle_signout';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const lastActivity = () => Number(store.get(LAST_KEY)) || 0;
export const touch = () => store.set(LAST_KEY, String(Date.now()));
const idleTooLong = () => { const t = lastActivity(); return t > 0 && Date.now() - t > IDLE_MS; };
async function idleSignOut() {
  try { sessionStorage.setItem(IDLE_FLAG, '1'); } catch { /* ignore */ }
  store.set(LAST_KEY, '0');
  await supabase.auth.signOut();
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && !IS_DEMO && idleTooLong()) {
        await idleSignOut();
        data = { session: null };
      } else if (data.session && !lastActivity()) touch();
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      else setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) loadProfile(newSession.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Track activity while signed in; sign out after an hour without any.
  useEffect(() => {
    if (!session || IS_DEMO) return;
    let lastWrite = 0;
    const onActivity = () => {
      if (Date.now() - lastWrite < 30000) return;
      lastWrite = Date.now();
      touch();
    };
    const check = () => {
      if (idleTooLong()) idleSignOut();
    };
    const onWake = () => {
      if (document.visibilityState !== 'hidden') check();
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    const timer = setInterval(check, 60000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      clearInterval(timer);
    };
  }, [session]);

  async function loadProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data || null);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const value = {
    session,
    user: session?.user || null,
    profile,
    role: profile?.role || null,
    isAdmin: profile?.role === 'admin',
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
