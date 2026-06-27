/**
 * Webpack config for development electron main process + preload.
 *
 * Why webpack (not esbuild) for the main process dev build:
 *   - Electron 42 embeds Node.js 24, which does NOT expose named exports from
 *     the `electron` module in ESM context (`import { BrowserWindow } from
 *     'electron'` fails at instantiation). webpack's `target: 'electron-main'`
 *     converts all electron imports to CJS `require('electron')`, which
 *     Electron's runtime intercepts correctly.
 *
 * Why we compile a dev preload:
 *   - preload.prod.js is the production-webpack bundle. webpack's EnvironmentPlugin
 *     hardcodes process.env.NODE_ENV = 'production' in that bundle. The preload
 *     exposes process.env.NODE_ENV to the renderer via contextBridge, so
 *     index.html's bootstrap script sees NODE_ENV='production' and loads
 *     renderer.prod.js from disk instead of the webpack dev server. Every source
 *     change is invisible until a full production rebuild.
 *   - Compiling preload.dev.built.js with NODE_ENV='development' fixes this:
 *     index.html correctly requests http://localhost:PORT/dist/renderer.dev.js.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import webpack from 'webpack';
import { merge } from 'webpack-merge';
import baseConfig from './webpack.config.base.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sharedDevOptions = {
  mode: 'development',
  devtool: 'cheap-module-source-map',
  module: {
    rules: [
      {
        test: /\.mjs$/,
        resolve: { fullySpecified: false },
      },
    ],
  },
  optimization: { splitChunks: false, runtimeChunk: false },
  node: { __dirname: false, __filename: false },
};

const mainConfig = merge(baseConfig, sharedDevOptions, {
  target: 'electron-main',
  entry: './src/main.dev.mjs',
  output: {
    path: path.join(__dirname, '../../'),
    filename: './src/main.dev.built.js',
  },
  externals: {
    // electron-devtools-installer dynamic import creates a webpack chunk whose
    // path webpack cannot resolve at runtime (chunk sits in src/ but __dirname
    // points to project root). Marking it external lets Electron's require()
    // load it directly from node_modules.
    'electron-devtools-installer': 'commonjs electron-devtools-installer',
  },
  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'development',
      DEBUG_PROD: false,
      START_MINIMIZED: false,
    }),
    new webpack.IgnorePlugin({
      resourceRegExp: /^(bufferutil|utf-8-validate)$/,
    }),
  ],
});

const preloadConfig = merge(baseConfig, sharedDevOptions, {
  target: 'electron-preload',
  entry: './src/preload.js',
  output: {
    path: path.join(__dirname, '../../src'),
    filename: 'preload.dev.built.js',
  },
  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'development',
    }),
  ],
});

export default [mainConfig, preloadConfig];
