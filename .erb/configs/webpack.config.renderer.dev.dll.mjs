/**
 * Builds the DLL for development electron renderer process
 */

import { fileURLToPath } from 'url';
import path from 'path';
import webpack from 'webpack';
import { merge } from 'webpack-merge';
import baseConfig from './webpack.config.base.mjs';
import CheckNodeEnv from '../scripts/CheckNodeEnv.mjs';
import { rendererModule } from './webpack.config.renderer.module.mjs';
import rootPkg from '../../package.json' with { type: 'json' };

const { dependencies } = rootPkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

CheckNodeEnv('development');

const dist = path.join(__dirname, '../dll');

export default merge(baseConfig, {
  context: path.join(__dirname, '../..'),

  devtool: 'eval',

  mode: 'development',

  // Deliberately NOT 'web' (unlike the renderer configs — see webpack.config.renderer.prod.mjs).
  // This DLL's entry blindly pre-bundles every package in package.json's `dependencies`
  // (~40, including main-process-only ones like electron-updater/electron-store/fs-extra
  // that reference raw `fs`/`node:util`/etc. and have no browser equivalent). Under
  // 'web', webpack must resolve every Node-core-module reference at build time and
  // fails outright on these. Under 'electron-renderer', such requires are simply left
  // as runtime calls — safe, because the renderer's actual code never imports those
  // packages, so the calls are never reached. The only packages the renderer DOES
  // import through here that touch Node core modules (randomstring/safe-buffer →
  // buffer, discord-rpc → timers/net) are fixed at the source (buffer polyfill in
  // the renderer configs; discord-rpc relocated to the main process), so no runtime
  // 'require is not defined' crash reaches this DLL's code either.
  target: 'electron-renderer',

  externals: ['fsevents', 'crypto-browserify'],

  /**
   * Shared loader rules — imported directly from webpack.config.renderer.module.mjs
   * instead of the old pattern of require()-ing webpack.config.renderer.dev.js
   * (which relied on CJS module.parent detection).
   */
  module: rendererModule,

  entry: {
    // Excludes 'randomstring' and 'discord-rpc': both reach into Node-core modules
    // (buffer via safe-buffer; timers/net) that this 'electron-renderer'-targeted DLL
    // would leave as runtime `require()` calls — fatal under `nodeIntegration: false`.
    // Skipping them here means the dev renderer's own compilation (webpack.config.
    // renderer.dev.mjs, target: 'web') bundles them directly instead, where the
    // buffer polyfill (randomstring) and main-process relocation (discord-rpc)
    // already make them safe. See the buffer-polyfill / discord-rpc-relocation
    // comments in webpack.config.renderer.prod.mjs and src/hooks/useDiscordRpc.ts.
    renderer: Object.keys(dependencies || {}).filter((dep) => dep !== 'randomstring' && dep !== 'discord-rpc'),
  },

  output: {
    library: 'renderer',
    path: dist,
    filename: '[name].dev.dll.js',
    libraryTarget: 'var',
  },

  plugins: [
    new webpack.DllPlugin({
      path: path.join(dist, '[name].json'),
      name: '[name]',
    }),

    new webpack.EnvironmentPlugin({
      NODE_ENV: 'development',
    }),

    new webpack.LoaderOptionsPlugin({
      debug: true,
      options: {
        context: path.join(__dirname, '../../src'),
        output: {
          path: path.join(__dirname, '../dll'),
        },
      },
    }),
  ],
});
