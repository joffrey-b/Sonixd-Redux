// Bespoke connectivity check -- deliberately does NOT use the `api`/`jellyfinApi`
// axios instances from src/api/, so it structurally cannot share their
// axios-retry interceptor (which would add ~6-7s of backoff to every ping) or,
// for Jellyfin, their 401 handler (which force-logs-out on a bad token -- see
// below for why that's moot here anyway). A single plain axios.get() call per
// ping, short timeout, no retry -- an ADR hard requirement (Section 3.1), not
// just a testing convenience.
//
// Empirically verified against live Navidrome/Jellyfin containers before
// writing this (see PHASE-2-SUMMARY.md for the full investigation):
//
// - Subsonic's ping.view ALWAYS returns HTTP 200, regardless of credentials.
//   Valid creds -> {status:"ok"}. Wrong/missing creds -> HTTP 200 with
//   {status:"failed", error:{code:40 or 10}}. This means a thrown/network-level
//   error (timeout, connection refused, DNS failure) and a resolved-but-rejected
//   response are cleanly distinguishable -- the former is genuine
//   unreachability, the latter is a credentials problem and must not be
//   silently counted as the same thing (queueing everything indefinitely
//   because of a stale password would be worse than surfacing a re-auth need).
// - Jellyfin's /health is genuinely unauthenticated -- confirmed it ignores a
//   garbage token entirely and always returns 200 "Healthy", so there is no
//   equivalent auth-error case for Jellyfin and no risk of it ever producing
//   something the existing 401 handler could misread.
import axios from 'axios';
import { settings } from '../components/shared/bridge';
import { mockSettings } from './mockSettings';
import { SUBSONIC_API_VERSION } from './subsonicApi';
import { Server, type ServerType } from '../types';

// A few seconds -- long enough to tolerate normal latency, short enough that a
// genuinely unreachable server is declared so well within the 30s cadence.
export const PING_TIMEOUT_MS = 5000;

export type PingResult = 'online' | 'unreachable' | 'auth-error';

export type GetCredentialsFn = () => Promise<{
  server?: string;
  username?: string;
  password?: string;
  salt?: string;
  hash?: string;
  legacyAuth?: boolean;
  token?: string;
}>;

export type AxiosGetFn = (url: string, config?: { timeout?: number }) => Promise<{ data: unknown }>;

const defaultGetCredentials: GetCredentialsFn = () =>
  process.env.NODE_ENV === 'test'
    ? Promise.resolve(mockSettings as Awaited<ReturnType<GetCredentialsFn>>)
    : settings.getCredentials();

const defaultAxiosGet: AxiosGetFn = (url, config) => axios.get(url, config);

interface SubsonicPingResponse {
  'subsonic-response'?: {
    status?: string;
    error?: { code?: number; message?: string };
  };
}

// Audit fix (Section 3 finding): getCredentials() used to be awaited outside
// this function's own try/catch, so a rejection there (the credentials
// bridge IPC failing) would reject pingSubsonic's whole promise -- silently
// contradicting the "pingServer never rejects" contract useConnectivityMonitor.ts's
// own comment already documents and relies on. Currently masked only by an
// unrelated, accidental outer try/catch in tick() (Fix 8), not a guarantee
// this function itself honors. The entire body is now inside the try block,
// so any failure -- network or credentials -- resolves 'unreachable' exactly
// like the pre-existing network-failure case, rather than rejecting.
export const pingSubsonic = async (deps?: {
  getCredentials?: GetCredentialsFn;
  axiosGet?: AxiosGetFn;
}): Promise<PingResult> => {
  const getCredentials = deps?.getCredentials ?? defaultGetCredentials;
  const axiosGet = deps?.axiosGet ?? defaultAxiosGet;

  try {
    const raw = await getCredentials();
    const server = String(raw.server || '').replace(/\/$/, '');
    const isLegacy = Boolean(raw.legacyAuth);
    const username = encodeURIComponent(String(raw.username || ''));
    const authParams = isLegacy
      ? `u=${username}&p=${encodeURIComponent(String(raw.password || ''))}`
      : `u=${username}&s=${String(raw.salt || '')}&t=${String(raw.hash || '')}`;
    const url = `${server}/rest/ping.view?v=${SUBSONIC_API_VERSION}&c=sonixd-redux&f=json&${authParams}`;

    const { data } = await axiosGet(url, { timeout: PING_TIMEOUT_MS });
    const response = (data as SubsonicPingResponse)['subsonic-response'];
    if (response?.status === 'ok') return 'online';
    // Audit fix (Section 3 finding): originally only code 40 ("wrong
    // username or password") was classified as an auth error. Phase 2's own
    // investigation already documented that a request with no auth params at
    // all gets code 10 ("required parameter is missing") from this exact
    // endpoint, not 40 -- so a getCredentials() call that resolves an
    // incomplete credential set (e.g. a narrow post-login race before the
    // bridge has settled) was being misclassified as a genuine connectivity
    // failure and counted toward the flap-detection counter, rather than
    // excluded the way a real auth problem already is. 41 (token auth
    // unsupported for LDAP users) is the same class of "the server responded
    // about our credentials, not about reachability" response.
    if (
      response?.error?.code === 40 ||
      response?.error?.code === 41 ||
      response?.error?.code === 10
    )
      return 'auth-error';
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
};

export const pingJellyfin = async (deps?: {
  getCredentials?: GetCredentialsFn;
  axiosGet?: AxiosGetFn;
}): Promise<PingResult> => {
  const getCredentials = deps?.getCredentials ?? defaultGetCredentials;
  const axiosGet = deps?.axiosGet ?? defaultAxiosGet;

  try {
    const raw = await getCredentials();
    const server = String(raw.server || '').replace(/\/$/, '');
    const url = `${server}/health`;

    await axiosGet(url, { timeout: PING_TIMEOUT_MS });
    // /health returns plain text "Healthy" with no JSON body to inspect --
    // any resolved response (2xx, per axios's default validateStatus) is
    // sufficient. Unauthenticated by design (verified above), so there is no
    // auth-error case to distinguish here.
    return 'online';
  } catch {
    return 'unreachable';
  }
};

export const pingServer = (
  serverType: ServerType,
  deps?: { getCredentials?: GetCredentialsFn; axiosGet?: AxiosGetFn }
): Promise<PingResult> =>
  serverType === Server.Jellyfin ? pingJellyfin(deps) : pingSubsonic(deps);
