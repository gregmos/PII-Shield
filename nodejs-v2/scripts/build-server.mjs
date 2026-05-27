#!/usr/bin/env node

// Builds the MCP server bundle: two vite passes (review + setup iframes,
// each inlined into a single HTML via vite-plugin-singlefile) + one esbuild
// pass that bundles src/index.ts → dist/server.bundle.mjs with the .html
// text loader inlining both HTMLs as string literals.
//
// Exists so `npm run build:server` works cross-platform — Windows CI runners
// can't use `INPUT=foo vite build` env-prefix syntax.

import { spawnSync } from "node:child_process";

// One string + shell: true keeps Node 24+ happy (DEP0190 fires when you mix
// args array with shell: true) and lets us prepend `INPUT=…` cleanly on POSIX.
// On Windows we use `cmd /c set INPUT=… && …` which works the same way.
function run(label, command) {
  console.log(`\n${label}`);
  const result = spawnSync(command, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`✗ failed: ${command}`);
    process.exit(result.status ?? 1);
  }
}

const isWindows = process.platform === "win32";
const withInput = (input, cmd) =>
  isWindows ? `set "INPUT=${input}" && ${cmd}` : `INPUT=${input} ${cmd}`;

run("1. vite build → dist/ui/review.html", withInput("review.html", "npx vite build"));
run("2. vite build → dist/ui/setup.html", withInput("setup.html", "npx vite build"));
run("3. esbuild → dist/server.bundle.mjs", "node esbuild.config.mjs");

console.log("\n✓ Server bundle ready at dist/server.bundle.mjs");
