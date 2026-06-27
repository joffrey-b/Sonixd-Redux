/**
 * Build config for electron renderer process
 */

import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import path from 'path';
import webpack from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import { merge } from 'webpack-merge';
import TerserPlugin from 'terser-webpack-plugin';
import baseConfig from './webpack.config.base.mjs';
import CheckNodeEnv from '../scripts/CheckNodeEnv.mjs';
import deleteSourceMaps from '../scripts/DeleteSourceMaps.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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

  // 'electron-renderer' externalizes Node core modules (buffer/events/timers/url/
  // util/net/electron/etc.) as runtime `require()` calls — correct only when
  // `nodeIntegration: true` injects a working `require` into the renderer. With
  // `nodeIntegration: false` (this app's current, more secure configuration — see
  // main.dev.mjs's BrowserWindow webPreferences) the renderer has no `require` at
  // all, and every externalized call throws `ReferenceError: require is not
  // defined` the instant a transitively-bundled package (e.g. `safe-buffer`) first
  // touches one. 'web' is the documented target for `nodeIntegration: false`
  // renderers — it makes webpack bundle/polyfill Node-core-module references
  // instead of leaving them as runtime requires.
  target: 'web',

  // webpack 5 dropped the implicit Node-core-module polyfills ('node-libs-browser')
  // that 'web' relied on in webpack 4. `safe-buffer` (pulled in by `randomstring`,
  // used in Login.tsx for salt/device-ID generation) does a top-level
  // `require('buffer').Buffer` that genuinely executes at runtime — it needs a real
  // `Buffer` implementation, not dead code. `buffer` (npm package) is the standard
  // browser-safe polyfill; ProvidePlugin injects the global `Buffer` wherever code
  // references it without an explicit import, exactly as `safe-buffer` does.
  resolve: {
    fallback: {
      buffer: require.resolve('buffer/'),
    },
  },

  entry: [path.join(__dirname, '../../src/index.tsx')],

  output: {
    path: path.join(__dirname, '../../src/dist'),
    publicPath: './dist/',
    filename: 'renderer.prod.js',
    // baseConfig sets `libraryTarget: 'commonjs2'` — correct for the main/preload
    // builds (real Node `module`/`exports`/`require`), but it wraps this entry point's
    // output in `module.exports = ...`, throwing `ReferenceError: module is not
    // defined` at runtime under `target: 'web'` + `nodeIntegration: false` (no
    // `module` global exists). This entry point is loaded as a plain <script> and
    // exports nothing, so '' disables the library wrapper entirely (verified: produces
    // a clean IIFE with no module/window/this/define reference).
    libraryTarget: '',
  },

  module: {
    rules: [
      {
        test: /\.(css|less|s[ac]ss)$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              // `./dist` can't be inherited for publicPath for styles. Otherwise generated paths will be ./dist/dist
              publicPath: './',
            },
          },
          'css-loader',
          {
            loader: 'less-loader',
            options: {
              lessOptions: {
                javascriptEnabled: true,
              },
            },
          },
        ],
      },
      // All font types: webpack 5 native asset modules.
      // url-loader v4+ with webpack 5 defaults to esModule:true, which emits a tiny JS
      // wrapper file alongside the actual font and puts the wrapper filename in the CSS.
      // Chromium's OTS then rejects it as an invalid font. Native asset modules emit the
      // raw file directly and produce the correct URL in the extracted CSS.
      {
        test: /\.(woff|woff2|ttf|otf|eot)(\?.*)?$/,
        type: 'asset',
        parser: {
          dataUrlCondition: {
            maxSize: 10 * 1024, // inline as data URL if < 10 KB, emit as file otherwise
          },
        },
      },
      // SVG Font
      {
        test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
        use: { loader: 'url-loader', options: { limit: 10000, mimetype: 'image/svg+xml' } },
      },
      // Common Image Formats
      { test: /\.(?:ico|gif|png|jpg|jpeg|webp)$/, use: 'url-loader' },
    ],
  },

  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        parallel: true,
      }),
      new CssMinimizerPlugin(),
    ],
  },

  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'production',
      DEBUG_PROD: false,
    }),

    // Pairs with the `buffer` resolve.fallback above — makes the bare `Buffer`
    // global that `safe-buffer` expects resolve to the polyfill's export.
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),

    new MiniCssExtractPlugin({
      filename: 'style.css',
    }),

    new BundleAnalyzerPlugin({
      analyzerMode: process.env.OPEN_ANALYZER === 'true' ? 'server' : 'disabled',
      openAnalyzer: process.env.OPEN_ANALYZER === 'true',
    }),
  ],
});
