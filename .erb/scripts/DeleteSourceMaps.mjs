import { fileURLToPath } from 'url';
import path from 'path';
import { rimrafSync } from 'rimraf';
import { globSync } from 'glob';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function deleteSourceMaps() {
  // rimrafSync@6 does not expand glob patterns — passing a path with '*' throws
  // EINVAL on Windows. Use globSync to expand first, then delete each match.
  const srcDir = path.join(__dirname, '../../src').split(path.sep).join('/');
  globSync(`${srcDir}/*.js.map`).forEach((f) => rimrafSync(f));
  globSync(`${srcDir}/dist/*.js.map`).forEach((f) => rimrafSync(f));
  globSync(`${srcDir}/dist/*.css.map`).forEach((f) => rimrafSync(f));
}

export default deleteSourceMaps;
