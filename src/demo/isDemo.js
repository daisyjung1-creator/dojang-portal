// The /demo copy of the portal runs on fake in-browser data (see mockSupabase.js).
export const IS_DEMO = typeof window !== 'undefined' && /^\/demo(\/|$)/.test(window.location.pathname);
