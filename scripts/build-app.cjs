// Call the CLI directly: nested Yarn 1 scripts consume the Cargo `--` separator.
const { run } = require("@tauri-apps/cli");

const args = process.argv.slice(2);
const separator = args.indexOf("--");
const tauriArgs = separator < 0 ? args : args.slice(0, separator);
const cargoArgs = separator < 0 ? [] : args.slice(separator + 1);
if (!cargoArgs.includes("--locked")) cargoArgs.push("--locked");

run(["build", ...tauriArgs, "--", ...cargoArgs], "nextchat").catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
