#!/usr/bin/env node
/**
 * Stop hook (strict): when this session edited code, run the project's test,
 * lint and typecheck commands and BLOCK until they pass, feeding the failing
 * output back so the agent fixes its own errors. Enforces the slice loop in
 * CLAUDE.md §"Canonical commands": test + lint + typecheck all green before a
 * task counts as done.
 *
 * Scoped by set-files-changed.mjs: sessions that touched no file exit silently.
 * Fails open — if npm or the scripts are missing (pre-scaffold repo), exits 0
 * rather than blocking forever.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseHookEvent, readStdinRaw } from "./hook-io.mjs";
import { sessionScratchDir } from "./session-scratch.mjs";

const event = parseHookEvent(readStdinRaw()) ?? {};

// Anti-loop guard: skip when already inside a stop-hook chain.
if (event?.stop_hook_active) process.exit(0);

// Purpose A — operational directory (see .claude/rules/hooks-cwd-resolution.md).
const cwdArg = typeof event.cwd === "string" && event.cwd ? event.cwd : "";
const projectDir = cwdArg || process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Purpose B — session-scoped flag written by set-files-changed.mjs.
const sessionId = typeof event.session_id === "string" ? event.session_id : "nosession";
let editedAnything = false;
try {
  const flag = path.join(sessionScratchDir(sessionId), "files-changed");
  editedAnything = fs.readFileSync(flag, "utf8").trim().length > 0;
} catch {
  // No flag file: this session edited nothing worth verifying.
}
if (!editedAnything) process.exit(0);

// No package.json yet (repo not scaffolded) — nothing to run.
const pkgPath = path.join(projectDir, "package.json");
let scripts = {};
try {
  scripts = JSON.parse(fs.readFileSync(pkgPath, "utf8"))?.scripts ?? {};
} catch {
  process.exit(0);
}

const npmCli = process.env.npm_execpath;
const failures = [];

for (const name of ["test", "lint", "typecheck"]) {
  if (!scripts[name]) continue; // script not defined — skip, don't invent it.

  // Invoke npm's JS entrypoint via node when available; the `npm`/`npm.cmd`
  // shim cannot be spawned without a shell on Windows
  // (see .claude/rules/hooks-cross-platform.md).
  const run = npmCli
    ? spawnSync(process.execPath, [npmCli, "run", name, "--silent"], {
        cwd: projectDir,
        encoding: "utf8",
        windowsHide: true,
      })
    : spawnSync("npm", ["run", name, "--silent"], {
        cwd: projectDir,
        encoding: "utf8",
        windowsHide: true,
        shell: process.platform === "win32",
      });

  // Command could not be launched at all (npm absent) — fail open.
  if (run.error) process.exit(0);

  if (run.status !== 0) {
    const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
    failures.push(`--- npm run ${name} (exit ${run.status}) ---\n${out.slice(-4000)}`);
  }
}

if (failures.length > 0) {
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        `Verification failed — fix these before finishing:\n\n${failures.join("\n\n")}\n\n` +
        `CLAUDE.md requires npm run test, lint and typecheck to pass before a task is done.`,
    }),
  );
  process.exit(0);
}

process.exit(0);
