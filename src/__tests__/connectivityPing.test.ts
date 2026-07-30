import {
  pingSubsonic,
  pingJellyfin,
  pingServer,
  PING_TIMEOUT_MS,
} from '../shared/connectivityPing';
import { SUBSONIC_API_VERSION } from '../shared/subsonicApi';
import { Server } from '../types';

const okSubsonicResponse = { data: { 'subsonic-response': { status: 'ok' } } };
const authFailedSubsonicResponse = {
  data: { 'subsonic-response': { status: 'failed', error: { code: 40, message: 'bad creds' } } },
};
// Audit fix (Section 3 finding): code 10 ("required parameter is missing")
// is now classified as auth-error, not unreachable -- see connectivityPing.ts.
// A truly generic, non-auth-related failure (70: "the requested data was not
// found") is what should still fall through to unreachable.
const genericFailedSubsonicResponse = {
  data: { 'subsonic-response': { status: 'failed', error: { code: 70 } } },
};
const missingParamSubsonicResponse = {
  data: { 'subsonic-response': { status: 'failed', error: { code: 10 } } },
};
const unsupportedLdapTokenAuthResponse = {
  data: { 'subsonic-response': { status: 'failed', error: { code: 41 } } },
};

const getCredentials = () =>
  Promise.resolve({ server: 'http://localhost:4533', username: 'admin', salt: 's', hash: 'h' });

describe('connectivityPing -- bespoke, no-retry design', () => {
  it('the Subsonic ping call does not go through axios-retry (single attempt, even on failure)', async () => {
    const axiosGet = jest.fn().mockRejectedValue(new Error('network error'));

    const result = await pingSubsonic({ getCredentials, axiosGet });

    expect(result).toBe('unreachable');
    // A retry-wrapped call would have invoked the transport up to 4 times
    // (1 initial + 3 retries); this bespoke call must invoke it exactly once.
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(axiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/rest/ping.view'),
      expect.objectContaining({ timeout: PING_TIMEOUT_MS })
    );
  });

  it('the Jellyfin ping call does not go through axios-retry (single attempt, even on failure)', async () => {
    const axiosGet = jest.fn().mockRejectedValue(new Error('network error'));

    const result = await pingJellyfin({ getCredentials, axiosGet });

    expect(result).toBe('unreachable');
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(axiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.objectContaining({ timeout: PING_TIMEOUT_MS })
    );
  });

  it('pingSubsonic resolves "online" on a valid-credentials success', async () => {
    const axiosGet = jest.fn().mockResolvedValue(okSubsonicResponse);
    expect(await pingSubsonic({ getCredentials, axiosGet })).toBe('online');
  });

  it('pingSubsonic distinguishes a credentials-rejected response from network unreachability', async () => {
    const axiosGet = jest.fn().mockResolvedValue(authFailedSubsonicResponse);
    // A 200 response with error.code 40 reached the server -- this is a
    // credentials problem, not the same thing as the server being unreachable.
    expect(await pingSubsonic({ getCredentials, axiosGet })).toBe('auth-error');
  });

  it('pingSubsonic treats a truly generic failed response as unreachable, not auth-error', async () => {
    const axiosGet = jest.fn().mockResolvedValue(genericFailedSubsonicResponse);
    expect(await pingSubsonic({ getCredentials, axiosGet })).toBe('unreachable');
  });

  it('pingSubsonic classifies "required parameter missing" (code 10) as auth-error, not unreachable', async () => {
    // Audit fix (Section 3 finding): this is the response an incomplete
    // credential set produces (e.g. a narrow post-login race before the
    // settings bridge has settled) -- previously misclassified as a genuine
    // connectivity failure, incorrectly counting toward the flap-detection
    // counter instead of being excluded the way a real auth problem is.
    const axiosGet = jest.fn().mockResolvedValue(missingParamSubsonicResponse);
    expect(await pingSubsonic({ getCredentials, axiosGet })).toBe('auth-error');
  });

  it('pingSubsonic classifies "LDAP token auth unsupported" (code 41) as auth-error, not unreachable', async () => {
    const axiosGet = jest.fn().mockResolvedValue(unsupportedLdapTokenAuthResponse);
    expect(await pingSubsonic({ getCredentials, axiosGet })).toBe('auth-error');
  });

  it('pingSubsonic never rejects even when getCredentials() itself rejects', async () => {
    // Audit fix (Section 3 finding): getCredentials() used to be awaited
    // outside pingSubsonic's own try/catch, so a rejection there would
    // reject pingSubsonic's whole promise -- contradicting the "pingServer
    // never rejects" contract useConnectivityMonitor.ts's own comment relies
    // on (previously masked only by an unrelated, accidental outer try/catch
    // in that hook's tick() function).
    const rejectingGetCredentials = () => Promise.reject(new Error('IPC failure'));
    const axiosGet = jest.fn();
    await expect(pingSubsonic({ getCredentials: rejectingGetCredentials, axiosGet })).resolves.toBe(
      'unreachable'
    );
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('pingJellyfin never rejects even when getCredentials() itself rejects', async () => {
    const rejectingGetCredentials = () => Promise.reject(new Error('IPC failure'));
    const axiosGet = jest.fn();
    await expect(pingJellyfin({ getCredentials: rejectingGetCredentials, axiosGet })).resolves.toBe(
      'unreachable'
    );
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('pingJellyfin resolves "online" on any resolved response (unauthenticated /health)', async () => {
    const axiosGet = jest.fn().mockResolvedValue({ data: 'Healthy' });
    expect(await pingJellyfin({ getCredentials, axiosGet })).toBe('online');
  });

  it('pingServer dispatches to pingJellyfin for Jellyfin and pingSubsonic otherwise', async () => {
    const jellyfinAxiosGet = jest.fn().mockResolvedValue({ data: 'Healthy' });
    expect(await pingServer(Server.Jellyfin, { getCredentials, axiosGet: jellyfinAxiosGet })).toBe(
      'online'
    );
    expect(jellyfinAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.anything()
    );

    const subsonicAxiosGet = jest.fn().mockResolvedValue(okSubsonicResponse);
    expect(await pingServer(Server.Subsonic, { getCredentials, axiosGet: subsonicAxiosGet })).toBe(
      'online'
    );
    expect(subsonicAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/rest/ping.view'),
      expect.anything()
    );
  });
});

describe('connectivityPing version (Fix 4)', () => {
  it('uses the same Subsonic API version as the rest of the app', async () => {
    const axiosGet = jest.fn().mockResolvedValue(okSubsonicResponse);

    await pingSubsonic({ getCredentials, axiosGet });

    const [url] = axiosGet.mock.calls[0];
    expect(url).toContain(`v=${SUBSONIC_API_VERSION}`);
    // Pinned directly, not just "matches the constant" -- catches the
    // constant itself drifting from the value api.ts/Login.tsx actually use.
    expect(SUBSONIC_API_VERSION).toBe('1.13.0');
  });
});
