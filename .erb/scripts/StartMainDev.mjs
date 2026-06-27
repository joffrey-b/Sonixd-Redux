/**
 * Dev-mode main-process launcher.
 *
 * Why webpack (not esbuild): Electron 42 embeds Node.js 24, which does not
 * expose named exports from the `electron` module in ESM context. Every form
 * of ESM `import { BrowserWindow } from 'electron'` fails at instantiation.
 * webpack with `target: 'electron-main'` converts those imports to CJS
 * `require('electron')`, which Electron's runtime intercepts correctly —
 * identical to how `yarn build:main` produces the working production bundle.
 *
 * Why we delete ELECTRON_RUN_AS_NODE: that environment variable makes the
 * Electron binary behave as plain Node.js (no app object, no BrowserWindow,
 * no module patches). It may be set by the parent shell, by electron-builder
 * helpers, or by the Claude Code environment. Stripping it lets Electron
 * initialise as a real GUI main process.
 */
import { execSync } from 'child_process';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const electronBin = require('electron');
const projectRoot = path.resolve(__dirname, '../../');
const outFile = path.join(projectRoot, 'src', 'main.dev.built.js');

const t0 = Date.now();
console.log('[StartMainDev] webpack: building preload...');
execSync(
  'cross-env NODE_ENV=production APP_NODE_ENV=development node node_modules/.bin/webpack --config .erb/configs/webpack.config.preload.mjs',
  { stdio: 'inherit', cwd: projectRoot }
);
console.log(`[StartMainDev] webpack: preload built in ${Date.now() - t0}ms`);

const t1 = Date.now();
console.log('[StartMainDev] webpack: building main process...');
execSync(
  'node node_modules/.bin/webpack --config .erb/configs/webpack.config.main.dev.mjs',
  { stdio: 'inherit', cwd: projectRoot }
);
console.log(`[StartMainDev] webpack: main built in ${Date.now() - t1}ms`);

const spawnEnv = { ...process.env };
delete spawnEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBin, [outFile], {
  stdio: 'inherit',
  env: spawnEnv,
  cwd: projectRoot,
});

child.on('close', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
