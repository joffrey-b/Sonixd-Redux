/* eslint global-require: off, import/no-extraneous-dependencies: off */

const developmentEnvironments = ['development', 'test'];

const developmentPlugins = [require('@babel/plugin-transform-runtime')];

const productionPlugins = [
  require('babel-plugin-dev-expression'),

  // babel-preset-react-optimize
  // Note: @babel/plugin-transform-react-inline-elements is intentionally omitted.
  // It injects a _createRawReactElement helper that creates elements with
  // $$typeof = Symbol.for("react.element") — the React 18 legacy type.
  // React 19.2+ changed its internal type to "react.transitional.element" and
  // throws error #525 on any element built with the old symbol.
  require('@babel/plugin-transform-react-constant-elements'),
  require('babel-plugin-transform-react-remove-prop-types'),
];

module.exports = (api) => {
  // See docs about api at https://babeljs.io/docs/en/config-files#apicache

  const development = api.env(developmentEnvironments);

  return {
    presets: [
      // @babel/preset-env will automatically target our browserslist targets
      require('@babel/preset-env'),
      require('@babel/preset-typescript'),
      [require('@babel/preset-react'), { development, runtime: 'automatic' }],
    ],
    plugins: [...(development ? developmentPlugins : productionPlugins)],
  };
};
