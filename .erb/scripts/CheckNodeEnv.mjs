// ANSI escape codes — no chalk dependency needed for a one-liner helper
const bgRed = (str) => `\x1b[41m\x1b[97m\x1b[1m${str}\x1b[0m`;

function CheckNodeEnv(expectedEnv) {
  if (!expectedEnv) {
    throw new Error('"expectedEnv" not set');
  }

  if (process.env.NODE_ENV !== expectedEnv) {
    console.log(bgRed(`"process.env.NODE_ENV" must be "${expectedEnv}" to use this webpack config`));
    process.exit(2);
  }
}

export default CheckNodeEnv;
