import { fileURLToPath } from 'url';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';
import pkg from '../../src/package.json' with { type: 'json' };

const { dependencies } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeModulesPath = path.join(__dirname, '../../src/node_modules');

if (Object.keys(dependencies || {}).length > 0 && fs.existsSync(nodeModulesPath)) {
  const electronRebuildCmd =
    '../node_modules/.bin/electron-rebuild --no-parallel --force --types prod,dev,optional --module-dir .';
  const cmd =
    process.platform === 'win32' ? electronRebuildCmd.replace(/\//g, '\\') : electronRebuildCmd;
  execSync(cmd, {
    cwd: path.join(__dirname, '../../src'),
    stdio: 'inherit',
  });
}
