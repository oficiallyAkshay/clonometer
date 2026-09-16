#!/usr/bin/env node
// Launches clonometer.py, which ships next to this file in the npm package,
// under python3 (python on Windows), forwarding argv and the exit status.
"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const script = path.join(__dirname, "..", "clonometer.py");
const python = process.platform === "win32" ? "python" : "python3";

const child = spawn(python, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
});

// When spawn itself fails (e.g. ENOENT), "close" still fires afterwards with
// a synthetic negative code rather than a real exit status. This flag keeps
// that from clobbering the exit code the "error" handler already set.
let spawnFailed = false;

child.on("error", (err) => {
  spawnFailed = true;
  if (err.code === "ENOENT") {
    process.stderr.write("clonometer needs python3 on PATH\n");
  } else {
    process.stderr.write(`clonometer failed to start: ${err.message}\n`);
  }
  process.exitCode = 1;
});

child.on("close", (code, signal) => {
  if (spawnFailed) {
    return;
  }
  process.exitCode = signal ? 1 : code;
});
