/**
 * Shared webpack module/loader rules for the electron renderer process.
 *
 * Extracted into its own file so both webpack.config.renderer.dev.mjs and
 * webpack.config.renderer.dev.dll.mjs can import the same ruleset without
 * one config needing to import the other (which required the old CJS
 * module.parent detection trick).
 */

export const rendererModule = {
  rules: [
    {
      test: /\.[jt]sx?$/,
      exclude: /node_modules/,
      use: [
        {
          loader: 'babel-loader',
          options: {
            plugins: ['react-refresh/babel'],
          },
        },
      ],
    },
    {
      test: /\.global\.css$/,
      use: [
        { loader: 'style-loader' },
        { loader: 'css-loader', options: { sourceMap: true } },
        { loader: 'less-loader', options: { lessOptions: { javascriptEnabled: true } } },
      ],
    },
    {
      test: /^((?!\.global).)*\.css$/,
      use: [
        { loader: 'style-loader' },
        {
          loader: 'css-loader',
          options: { modules: {}, sourceMap: true, importLoaders: 1 },
        },
        { loader: 'less-loader', options: { lessOptions: { javascriptEnabled: true } } },
      ],
    },
    {
      test: /\.less$/i,
      use: [
        { loader: 'style-loader' },
        { loader: 'css-loader' },
        { loader: 'less-loader', options: { lessOptions: { javascriptEnabled: true } } },
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
};
