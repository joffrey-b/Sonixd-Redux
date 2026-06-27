/* eslint import/no-unresolved: off, import/no-self-import: off */
// CJS wrapper for eslint-plugin-import's webpack resolver.
// The renderer dev config is an ES module (.mjs) which cannot be loaded via
// require(). ESLint's webpack resolver only needs the resolve section to detect
// webpack-aliased imports; we inline the minimal config here rather than importing
// the full dev config (which spawns processes and requires environment variables).
module.exports = {
  resolve: {
    fallback: {
      buffer: require.resolve('buffer/'),
    },
  },
};
