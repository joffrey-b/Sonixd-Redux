import fs from 'fs';
import chalk from 'chalk';
import pkg from '../../package.json' with { type: 'json' };

const { dependencies } = pkg;

if (dependencies) {
  const dependenciesKeys = Object.keys(dependencies);

  // Find packages in node_modules that have a native binding (binding.gyp).
  const nativeDeps = fs
    .readdirSync('node_modules')
    .filter((folder) => fs.existsSync(`node_modules/${folder}/binding.gyp`));

  if (nativeDeps.length === 0) {
    process.exit(0);
  }

  // Check whether any native dep is listed directly in dependencies (not devDependencies).
  // Native deps listed in dependencies get processed by webpack, which doesn't support them.
  // They should live in ./src/package.json instead.
  const filteredRootDependencies = nativeDeps.filter((dep) => dependenciesKeys.includes(dep));

  if (filteredRootDependencies.length > 0) {
    const plural = filteredRootDependencies.length > 1;
    console.log(`
 ${chalk.whiteBright.bgYellow.bold('Webpack does not work with native dependencies.')}
${chalk.bold(filteredRootDependencies.join(', '))} ${
      plural ? 'are native dependencies' : 'is a native dependency'
    } and should be installed inside of the "./src" folder.
 First, uninstall the packages from "./package.json":
${chalk.whiteBright.bgGreen.bold('yarn remove your-package')}
 ${chalk.bold('Then, instead of installing the package to the root "./package.json":')}
${chalk.whiteBright.bgRed.bold('yarn add your-package')}
 ${chalk.bold('Install the package to "./src/package.json"')}
${chalk.whiteBright.bgGreen.bold('cd ./src && yarn add your-package')}
 Read more about native dependencies at:
${chalk.bold(
  'https://electron-react-boilerplate.js.org/docs/adding-dependencies/#module-structure'
)}
 `);
    process.exit(1);
  }
}
