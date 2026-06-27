import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import webpack from 'webpack';
// ANSI escape codes — no chalk dependency needed for a one-liner
const bgYellow = (str) => `\x1b[43m\x1b[30m\x1b[1m${str}\x1b[0m`;
import { merge } from 'webpack-merge';
import { spawn, execSync } from 'child_process';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import baseConfig from './webpack.config.base.mjs';
import CheckNodeEnv from '../scripts/CheckNodeEnv.mjs';
import { rendererModule } from './webpack.config.renderer.module.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// When an ESLint server is running, we can't set the NODE_ENV so we'll check if it's
// at the dev webpack config is not accidentally run in a production environment
if (process.env.NODE_ENV === 'production') {
  CheckNodeEnv('development');
}

const port = process.env.PORT || 4343;
const publicPath = `http://localhost:${port}/dist`;
const dllDir = path.join(__dirname, '../dll');
const manifest = path.resolve(dllDir, 'renderer.json');

/**
 * Warn if the DLL is not built and rebuild it on the spot.
 * Note: module.parent detection (CJS-only) is no longer needed — the DLL
 * config now imports rendererModule directly from webpack.config.renderer.module.mjs
 * instead of requiring this file.
 */
if (!(fs.existsSync(dllDir) && fs.existsSync(manifest))) {
  console.log(
    bgYellow('The DLL files are missing. Sit back while we build them for you with "yarn build-dll"')
  );
  execSync('yarn postinstall');
}

export default merge(baseConfig, {
  devtool: 'inline-source-map',

  mode: 'development',

  // See the matching comment in webpack.config.renderer.prod.mjs — must stay in
  // sync with the prod renderer config's target, or dev would mask exactly the
  // 'require is not defined' crash that only manifests in the prod/packaged build.
  target: 'web',

  // See the matching buffer-polyfill comment in webpack.config.renderer.prod.mjs —
  // must stay in sync, or `randomstring`/`safe-buffer` would crash in dev but not prod
  // (the DLL deliberately excludes 'randomstring' so this compilation handles it
  // directly — see webpack.config.renderer.dev.dll.mjs).
  resolve: {
    fallback: {
      buffer: require.resolve('buffer/'),
    },
  },

  entry: [new URL('../../src/index.tsx', import.meta.url).pathname],

  output: {
    publicPath: `http://localhost:${port}/dist/`,
    filename: 'renderer.dev.js',
    // See the matching `libraryTarget` comment in webpack.config.renderer.prod.mjs —
    // must stay in sync, or dev would mask the `ReferenceError: module is not defined`
    // that only manifests in the prod/packaged build (baseConfig's 'commonjs2' wrapper
    // assumes a real Node `module` global, which doesn't exist under `target: 'web'`).
    libraryTarget: '',
  },

  module: rendererModule,

  plugins: [
    new webpack.DllReferencePlugin({
      context: path.join(__dirname, '../dll'),
      manifest: JSON.parse(fs.readFileSync(manifest, 'utf-8')),
      sourceType: 'var',
    }),

    new webpack.NoEmitOnErrorsPlugin(),

    // Pairs with the `buffer` resolve.fallback above — see the matching comment
    // in webpack.config.renderer.prod.mjs.
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),

    new webpack.EnvironmentPlugin({
      NODE_ENV: 'development',
    }),

    new webpack.LoaderOptionsPlugin({
      debug: true,
    }),

    new ReactRefreshWebpackPlugin(),
  ],

  node: {
    __dirname: false,
    __filename: false,
  },
  infrastructureLogging: {
    level: 'verbose',
  },
  devServer: {
    port,
    hot: true,
    host: '127.0.0.1',
    // webpack-dev-server v5 blocks requests whose Host header is not on the
    // allowlist. Electron loads index.html via file:// and then requests the
    // bundle from localhost. The Host header ('localhost:PORT') is fine, but
    // the Origin header is 'null' (file:// origin) which triggers a 403.
    // 'all' disables the check so the dev server is reachable from file://.
    allowedHosts: 'all',
    headers: { 'Access-Control-Allow-Origin': '*' },
    historyApiFallback: {
      verbose: true,
      disableDotRule: false,
    },
    devMiddleware: {
      publicPath,
      stats: 'errors-only',
    },
    static: {
      directory: path.join(__dirname, 'dist'),
      watch: {
        aggregateTimeout: 300,
        ignored: /node_modules/,
        interval: 100,
      },
    },
    // webpack-dev-server v5: setupMiddlewares replaces onBeforeSetupMiddleware
    setupMiddlewares(middlewares, devServer) {
      if (!devServer) throw new Error('webpack-dev-server is not defined');
      console.log('Starting Main Process...');
      spawn('npm', ['run', 'start:main'], {
        shell: true,
        env: process.env,
        stdio: 'inherit',
      })
        .on('close', (code) => process.exit(code))
        .on('error', (spawnError) => console.error(spawnError));
      return middlewares;
    },
  },
});
