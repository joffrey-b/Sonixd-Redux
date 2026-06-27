/**
 * Webpack config for production electron main process
 */

import { fileURLToPath } from 'url';
import path from 'path';
import webpack from 'webpack';
import { merge } from 'webpack-merge';
import TerserPlugin from 'terser-webpack-plugin';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import baseConfig from './webpack.config.base.mjs';
import CheckNodeEnv from '../scripts/CheckNodeEnv.mjs';
import deleteSourceMaps from '../scripts/DeleteSourceMaps.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

CheckNodeEnv('production');
deleteSourceMaps();

const devtoolsConfig =
  process.env.DEBUG_PROD === 'true'
    ? {
        devtool: 'source-map',
      }
    : {};

export default merge(baseConfig, {
  ...devtoolsConfig,

  mode: 'production',

  target: 'electron-main',

  entry: './src/main.dev.mjs',

  // main.dev.mjs is a native ESM file. Webpack 5 applies strict "fully-specified"
  // resolution to .mjs files (imports must include explicit extensions). Disable
  // that so relative imports like './redux/playerSlice' and bare specifiers like
  // 'core-js/stable' still resolve through the normal extensions/exports mechanism.
  module: {
    rules: [
      {
        test: /\.mjs$/,
        resolve: {
          fullySpecified: false,
        },
      },
    ],
  },

  output: {
    path: path.join(__dirname, '../../src'),
    filename: 'main.prod.js',
  },

  optimization: {
    minimizer: [
      new TerserPlugin({
        parallel: true,
      }),
    ],
    // The main process is a single Node.js entry point — code splitting serves
    // no purpose here and produces async chunks that are not listed in the
    // electron-builder files config, causing the packaged app to crash on launch.
    splitChunks: false,
    runtimeChunk: false,
  },

  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: process.env.OPEN_ANALYZER === 'true' ? 'server' : 'disabled',
      openAnalyzer: process.env.OPEN_ANALYZER === 'true',
    }),

    new webpack.EnvironmentPlugin({
      NODE_ENV: 'production',
      DEBUG_PROD: false,
      START_MINIMIZED: false,
    }),

    // bufferutil and utf-8-validate are optional native addons for the `ws`
    // WebSocket library (pulled in by discord-rpc). ws falls back to pure-JS
    // implementations when they are absent; suppress the Webpack "module not
    // found" warnings so CI output stays clean.
    new webpack.IgnorePlugin({
      resourceRegExp: /^(bufferutil|utf-8-validate)$/,
    }),
  ],

  /**
   * Disables webpack processing of __dirname and __filename.
   * If you run the bundle in node.js it falls back to these values of node.js.
   * https://github.com/webpack/webpack/issues/2010
   */
  node: {
    __dirname: false,
    __filename: false,
  },
});
