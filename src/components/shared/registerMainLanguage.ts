/**
 * Main-process-only side effect: reads the persisted `language` setting via a
 * standalone `electron-store` instance and registers it with settingsAccess.ts
 * for `i18n.js` to consume.
 *
 * Why a standalone instance instead of `setDefaultSettings.ts`'s `settings`:
 * `setDefaultSettings.ts` imports `i18n` (for column-label translations), and
 * ES modules evaluate dependencies before the importing module's own code —
 * so `i18n.js` always finishes evaluating *before* `setDefaultSettings.ts`
 * constructs its `settings` instance. Reading the same `name: 'settings'`
 * store here (the same pattern `i18n.js` itself used previously, for the same
 * reason) sidesteps that cycle entirely. `electron-store` instances are thin
 * file-IO wrappers with no shared in-memory state, so a second instance
 * pointed at the same file is safe.
 *
 * Imported by `main.dev.mjs` purely for this side effect, before the
 * `setDefaultSettings` import — see the comment on that import for why the
 * ordering matters.
 */
import Store from 'electron-store';
import { registerMainProcessLanguage } from './settingsAccess';

const languageStore = new Store({ name: 'settings' });

registerMainProcessLanguage(languageStore.get('language') as string | undefined);
