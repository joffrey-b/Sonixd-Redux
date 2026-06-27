/**
 * Webpack config for the Electron preload script.
 *
 * The preload runs in a privileged context between main and renderer.  It must
 * be a standalone file (not served by webpack-dev-server), so it is compiled
 * to src/preload.prod.js and loaded via BrowserWindow webPreferences.preload.
 *
 * Target is 'electron-preload': webpack 5 automatically externalises the
 * built-in 'electron' module and makes Node.js APIs available, while still
 * bundling the electron-redux bridge code and its lodash dependencies.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';
import CheckNodeEnv from '../scripts/CheckNodeEnv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

CheckNodeEnv('production');

// APP_NODE_ENV separates the webpack build mode (always 'production' for the
// preload) from the runtime environment flag the preload exposes to the renderer.
// StartMainDev.mjs passes APP_NODE_ENV=development so the renderer knows to load
// from webpack-dev-server; production builds leave it unset, defaulting to
// 'production'.
const appNodeEnv = process.env.APP_NODE_ENV || 'production';

export default {
  mode: 'production',

  target: 'electron-preload',

  entry: './src/preload.js',

  // electron-redux sets "sideEffects: false" in its package.json, which causes
  // webpack to drop the bare `import 'electron-redux/preload'` as having no side
  // effects.  Override that for the preload module so the bridge setup code
  // (contextBridge.exposeInMainWorld) is always included in the bundle.
  module: {
    rules: [
      {
        test: /node_modules[\\/]electron-redux[\\/].*\.js$/,
        sideEffects: true,
      },
    ],
  },

  output: {
    path: path.join(__dirname, '../../src'),
    filename: 'preload.prod.js',
  },

  plugins: [
    // Override the mode-injected process.env.NODE_ENV with the app-level env so
    // the renderer window receives the correct value regardless of build mode.
    new webpack.DefinePlugin({ __DEV__: JSON.stringify(appNodeEnv === 'development') }),
  ],

  optimization: {
    minimizer: [
      new TerserPlugin({
        parallel: true,
      }),
    ],
  },

  /**
   * Disables webpack processing of __dirname and __filename so that they
   * resolve to the actual runtime path, consistent with the main process.
   */
  node: {
    __dirname: false,
    __filename: false,
  },
};
