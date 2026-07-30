// The Subsonic API version this app declares on every request. Hardcoded
// identically at every existing call site (api.ts, Login.tsx) with no shared
// constant before this -- extracted now that connectivityPing.ts becomes a
// third call site needing the same value (a Phase 2 fix: connectivityPing.ts
// had drifted to a different, incorrect version, traced to conflating the
// server's own reported protocol version in a ping.view response with the
// version the client is supposed to declare).
export const SUBSONIC_API_VERSION = '1.13.0';
