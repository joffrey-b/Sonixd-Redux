/**
 * Sets a dev-mode-specific userData path before any electron-store instance is
 * constructed. Must be imported as the very first import in main.dev.mjs.
 *
 * Why a separate module: ESM static imports are evaluated before the importing
 * module's body runs. Both registerMainLanguage.ts and setDefaultSettings.ts
 * (imported by main.dev.mjs) construct `new Store()` as a module-level side
 * effect, which resolves the userData path at construction time. Placing
 * app.setPath() in the main.dev.mjs body would be too late — the Stores are
 * already constructed. Importing this module first ensures app.setPath() runs
 * before any Store constructor.
 *
 * Effect: dev settings file moves from ~/.config/Electron/settings.json to
 * ~/.config/sonixd-redux-dev/settings.json, isolating dev data from other
 * Electron dev apps and from the production path (~/.config/Sonixd Redux/).
 * After this change, a fresh login is required in dev mode.
 */
import { app } from 'electron';
import path from 'path';

// E2E test isolation: allow tests to inject a temporary userData directory so
// each test run is fully isolated from production settings and from each other.
// Must be checked before the dev-mode redirect below so tests running against
// the unpackaged build still get the injected path, not the dev path.
if (process.env.SONIXD_USER_DATA) {
  app.setPath('userData', process.env.SONIXD_USER_DATA);
} else if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'sonixd-redux-dev'));
}
