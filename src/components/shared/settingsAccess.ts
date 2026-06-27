/**
 * Supplies the parsed settings object to redux slices that are loaded into BOTH
 * the renderer's store and the main process's source-of-truth store (via
 * `electron-redux`'s `stateSyncEnhancer`) — currently `configSlice` and
 * `playQueueSlice`, which read settings once at module-evaluation time to seed
 * their `initialState`.
 *
 * - In the renderer, `window` exists and settings are read through the
 *   `window.bridge` proxy exposed by the preload script.
 * - In the main process, `window` does not exist, so `setDefaultSettings.ts`
 *   (the module that owns the real `electron-store`-backed instance) registers
 *   it here as a side effect of being imported. `main.dev.mjs` imports it
 *   before any slice reducer specifically so this registration always runs
 *   first — see the comment at the top of its import list.
 *
 * `i18n.js` has the same dual-context need for a single setting (`language`),
 * but can't use `getParsedSettings` above: it's a transitive import of
 * `setDefaultSettings.ts` (for column-label translations), so it always
 * evaluates *before* that module constructs and registers its settings
 * instance — registering it would be too late. `registerMainProcessLanguage`
 * exists to break that narrower cycle; see registerMainLanguage.ts, which
 * `main.dev.mjs` imports before `setDefaultSettings` for exactly this reason.
 */

import type { Settings } from './setDefaultSettings';

interface RegisteredSettings {
  store: unknown;
}

let mainProcessSettings: RegisteredSettings | undefined;
let mainProcessLanguage: string | undefined;

export const registerMainProcessSettings = (instance: RegisteredSettings): void => {
  mainProcessSettings = instance;
};

export const registerMainProcessLanguage = (language: string | undefined): void => {
  mainProcessLanguage = language;
};

export const getParsedSettings = (): Partial<Settings> => {
  if (typeof window !== 'undefined' && window.bridge) {
    return window.bridge.settings.getStore() as Partial<Settings>;
  }

  if (!mainProcessSettings) {
    throw new Error(
      'getParsedSettings() was called in the main process before setDefaultSettings ' +
        'registered the real settings instance — check the import order in main.dev.mjs.'
    );
  }

  return mainProcessSettings.store as Partial<Settings>;
};

export const getMainProcessLanguage = (): string | undefined => mainProcessLanguage;
