// Periodic reachability detection + flap protection (ADR Section 3.2) and the
// reconnection -> queue-flush trigger (Section 3.6 / Phase 1's
// attemptQueueFlush). Mounted once at the App root, mirroring
// useCheckForUpdates's "no visible UI, runs for the lifetime of the app"
// shape.
//
// Reads isManuallyForced from Redux (never settings.get()) to decide whether
// to run at all -- Lesson #1 from Phase 1: a frequent/periodic operation must
// never depend on a synchronous settings IPC call.
//
// enabled is an injectable parameter (Fix 5, Phase 2 fix session) rather than
// a hardcoded `process.env.NODE_ENV === 'test'` check -- matches this
// codebase's established preference for dependency injection over
// environment-branching (resolveSongPlaybackSource's injected cacheExists,
// etc.). App.tsx calls this with no argument (defaults to enabled); tests
// pass false/true explicitly instead of mutating the shared process.env
// global. The pre-login guard below (settings.get('server')/serverBase64)
// still independently protects any test that renders this hook without
// faking a logged-in state, regardless of what enabled defaults to.
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { setPingConfirmedUnreachable } from '../redux/connectivitySlice';
import { pingServer } from '../shared/connectivityPing';
import { attemptQueueFlush } from '../shared/offlineQueueFlush';
import { notifyToast } from '../components/shared/toast';
import { settings } from '../components/shared/bridge';

const PING_INTERVAL_MS = 30_000;

const useConnectivityMonitor = (enabled: boolean = true): void => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.config);
  const isManuallyForced = useAppSelector((state) => state.connectivity.isManuallyForced);
  const pingConfirmedUnreachable = useAppSelector(
    (state) => state.connectivity.pingConfirmedUnreachable
  );

  const consecutiveFailuresRef = useRef(0);
  const wasManuallyForcedRef = useRef(isManuallyForced);
  // Deliberately mirrors ONLY pingConfirmedUnreachable, not the derived
  // effectiveOffline -- effectiveOffline flips the instant isManuallyForced
  // itself changes, which would make a ref tracking it read the POST-toggle
  // value by the time a same-render tick() runs, always reporting "wasn't
  // offline" for the exact transition this hook needs to detect. The manual-
  // toggle-off path below is handled as its own unconditional case instead
  // (being forced-on is offline by definition -- no ambiguity, no ref needed).
  const pingConfirmedUnreachableRef = useRef(pingConfirmedUnreachable);

  useEffect(() => {
    pingConfirmedUnreachableRef.current = pingConfirmedUnreachable;
  }, [pingConfirmedUnreachable]);

  // Audit fix (finding 2.4): mirrors pingConfirmedUnreachableRef immediately
  // above for the identical class of problem -- tick() is fire-and-forget, so
  // a ping already in flight when the user flips "Force offline mode" on
  // isn't cancelled and can still resolve afterward. Reading isManuallyForced
  // directly inside tick() wouldn't help (it's a plain destructured const
  // from this render's closure, not the live value), so this ref is checked
  // after the ping resolves, immediately before acting on the result --
  // closing the real (if narrow, ~PING_TIMEOUT_MS-wide) window where a tick
  // started just before the toggle could otherwise dispatch
  // setPingConfirmedUnreachable(false) or fire a reconnection flush moments
  // after the user explicitly asked the app to stop touching the network
  // (ADR Section 3.3).
  const isManuallyForcedRef = useRef(isManuallyForced);

  useEffect(() => {
    isManuallyForcedRef.current = isManuallyForced;
  }, [isManuallyForced]);

  useEffect(() => {
    if (!enabled) return undefined;

    // No server configured yet (pre-login) -- there's nothing meaningful to
    // ping, and running this on the login screen would spuriously show the
    // offline toast/indicator for a feature that shouldn't be observable
    // before a server is even connected (ADR Section 1). Checked once here,
    // at effect-setup granularity (re-run only on login/logout/toggle), not
    // on every tick -- not the hot/frequent path Lesson #1 warns about.
    if (!settings.get('server') || !settings.get('serverBase64')) return undefined;

    const tick = async (forcedTransition = false) => {
      // Fix 8 (Phase 2 fix session): a structural safety net, currently
      // inert -- every individual thing awaited below already swallows its
      // own errors (pingServer never rejects; attemptQueueFlush is already
      // .catch()-guarded). Matches this file's own fire-and-forget discipline
      // so a future addition to tick() doesn't silently become an unhandled
      // promise rejection at either of this function's two fire-and-forget
      // call sites (tick(true) below, and the setInterval callback).
      try {
        // forcedTransition=true means this tick is the immediate check fired
        // the moment the manual toggle was just turned off -- unconditionally
        // "was offline" (forced-on IS offline, by construction), regardless of
        // whatever pingConfirmedUnreachable happened to be. Otherwise (a
        // normal scheduled tick), "was offline" reflects the ping-detected
        // state only.
        const wasOffline = forcedTransition || pingConfirmedUnreachableRef.current;
        const result = await pingServer(config.serverType);

        // Audit fix (finding 2.4): the user may have flipped "Force offline
        // mode" on while this exact ping was in flight (up to
        // PING_TIMEOUT_MS) -- its result is stale the moment that happens,
        // and must not update the flap counter, dispatch
        // setPingConfirmedUnreachable, or trigger a reconnection flush.
        if (isManuallyForcedRef.current) return;

        if (result === 'unreachable') {
          consecutiveFailuresRef.current += 1;
          if (consecutiveFailuresRef.current === 1) {
            notifyToast(
              'warning',
              t(
                "You seem to be offline. Switching to offline mode in 30 seconds if connectivity isn't restored."
              )
            );
          } else if (consecutiveFailuresRef.current >= 2) {
            // Only on the actual transition (ref still reflects the
            // pre-dispatch state) -- every failed tick after this one would
            // otherwise re-toast the same message on a 30s loop for as long
            // as the outage lasts.
            if (!pingConfirmedUnreachableRef.current) {
              notifyToast(
                'warning',
                t('Offline -- actions will be queued and synced once connectivity is restored.')
              );
            }
            dispatch(setPingConfirmedUnreachable(true));
          }
          return;
        }

        // 'online' or 'auth-error' -- either way the server actually
        // responded, so reset the flap counter (a credentials problem isn't
        // network flakiness and shouldn't count toward "unreachable"). Only a
        // genuine 'online' result clears the detected-offline state and
        // triggers the reconnection flush -- replaying a queue against
        // rejected credentials would just fail identically every time, so
        // there's nothing to gain by attempting it on an auth-error.
        consecutiveFailuresRef.current = 0;
        if (result === 'online') {
          dispatch(setPingConfirmedUnreachable(false));
          if (wasOffline) {
            notifyToast('info', t("You're back online. Syncing anything that happened offline."));
            attemptQueueFlush().catch(() => {});
          }
        }
      } catch {
        // Swallowed -- see comment above.
      }
    };

    // While manually forced on, the ping does not run at all (ADR Section
    // 3.3) -- the user does not want the app touching the network at all.
    if (isManuallyForced) {
      wasManuallyForcedRef.current = true;
      return undefined;
    }

    // The moment the toggle is turned off, trigger one immediate check
    // rather than waiting for the next scheduled tick.
    if (wasManuallyForcedRef.current) {
      wasManuallyForcedRef.current = false;
      tick(true);
    }

    const interval = setInterval(() => tick(false), PING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, isManuallyForced, config.serverType, dispatch, t]);
};

export default useConnectivityMonitor;
