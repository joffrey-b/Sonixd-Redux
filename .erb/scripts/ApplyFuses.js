const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

module.exports = async ({ appOutDir, packager }) => {
  const platform = packager.platform.buildConfigurationKey; // 'mac', 'win', 'linux'

  let executableName;
  if (platform === 'mac') {
    const appName = packager.appInfo.productFilename;
    executableName = path.join(`${appName}.app`, 'Contents', 'MacOS', 'Electron');
  } else if (platform === 'win') {
    executableName = `${packager.appInfo.productFilename}.exe`;
  } else {
    // Linux — electron-builder names the actual binary via the LinuxPackager
    // instance's own `executableName` (defaults to the sanitized, lowercased
    // product name, e.g. "sonixd-redux"), not appInfo.productFilename (which
    // stays "Sonixd Redux"). Same distinction electron-builder itself makes
    // internally (see platformPackager.js's afterPack handling).
    executableName = packager.executableName;
  }

  const electronBinaryPath = path.join(appOutDir, executableName);

  console.log(`Applying Electron Fuses to: ${electronBinaryPath}`);

  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });

  console.log('Electron Fuses applied successfully.');
};
