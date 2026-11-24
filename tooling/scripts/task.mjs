#!/usr/bin/env node

// `pnpm <area> <task> [args]` — one root command per area instead of one per task. The
// table below is the whole list; an unknown task prints it rather than guessing.

// @ts-check

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMPOSE = "tooling/scripts/compose.mjs";

/** @typedef {{ readonly command: string, readonly args: readonly string[] }} Step */

/** @param {string} pkg @param {string} script @param {readonly string[]} [rest] @returns {Step} */
const run = (pkg, script, rest = []) => ({
  command: "pnpm",
  args: ["--filter", `@loadbearing/${pkg}`, "run", script, ...rest],
});
/** @param {string} file @param {readonly string[]} [rest] @returns {Step} */
const node = (file, rest = []) => ({ command: "node", args: [file, ...rest] });
/** @param {readonly string[]} profiles @param {readonly string[]} rest @returns {Step} */
const compose = (profiles, rest) =>
  node(COMPOSE, [...profiles.flatMap((profile) => ["--profile", profile]), ...rest]);
/** @type {Step} */
const BUILD_PACKAGES = { command: "pnpm", args: ["build:packages"] };

const APPS = ["web", "worker", "realtime"];

/** @type {Record<string, Record<string, (rest: readonly string[]) => readonly Step[]>>} */
const TASKS = {
  dev: {
    "": () => [
      BUILD_PACKAGES,
      { command: "pnpm", args: ["--filter", "./apps/*", "--parallel", "run", "dev"] },
    ],
    ...Object.fromEntries(APPS.map((app) => [app, () => [BUILD_PACKAGES, run(app, "dev")]])),
  },
  check: {
    // Every gate, in CI's order. `comments` reports and never fails, so it is not one.
    "": () => [
      node("tooling/scripts/check-architecture.mjs"),
      node("tooling/scripts/check-contrast.mjs"),
      { command: "syncpack", args: ["lint"] },
      { command: "sherif", args: ["-r", "unordered-dependencies"] },
    ],
    architecture: () => [node("tooling/scripts/check-architecture.mjs")],
    contrast: () => [node("tooling/scripts/check-contrast.mjs")],
    comments: () => [node("tooling/scripts/comment-density.mjs")],
    deps: () => [{ command: "syncpack", args: ["lint"] }],
    repo: () => [{ command: "sherif", args: ["-r", "unordered-dependencies"] }],
  },
  // Lite's stack has no profiles: `up` starts all of it. `down` names every profile anyway,
  // so a stack started by the big kit's compose file still comes down.
  infra: {
    up: () => [compose([], ["up", "-d"])],
    down: () => [compose(["*"], ["down"])],
    reset: () => [compose(["*"], ["down", "-v"])],
    logs: (rest) => [compose(["*"], ["logs", "-f", ...rest])],
  },
  db: {
    generate: () => [run("infrastructure", "db:generate")],
    migrate: () => [run("infrastructure", "db:migrate")],
    studio: () => [run("infrastructure", "db:studio")],
    partitions: (rest) => [run("infrastructure", "db:partitions", rest)],
  },
  ops: {
    "platform-grant": (rest) => [run("infrastructure", "platform:grant", rest)],
    "queue-replay": (rest) => [run("infrastructure", "queue:replay", rest)],
    "queue-status": (rest) => [run("infrastructure", "queue:status", rest)],
    "queue-pause": (rest) => [run("infrastructure", "queue:pause", rest)],
    "queue-resume": (rest) => [run("infrastructure", "queue:resume", rest)],
    "ai-reindex": (rest) => [run("infrastructure", "ai:reindex", rest)],
    "doc-bench": () => [run("infrastructure", "doc:bench")],
    "doc-rerender": () => [run("infrastructure", "doc:rerender")],
    "auth-tables": () => [run("auth", "auth:tables")],
  },
  smoke: {
    "": () => [run("infrastructure", "smoke")],
    web: () => [run("web", "smoke")],
  },
};

// The commands `pnpm <area> <task> [args]` runs, in order. A task that takes no name is
// keyed `""`, so `pnpm dev` and `pnpm dev web` are both one table lookup.
/** @param {string} area @param {readonly string[]} argv @returns {readonly Step[]} */
export function plan(area, argv) {
  const tasks = TASKS[area];
  if (!tasks) throw new Error(`unknown area ${area} (${Object.keys(TASKS).join(", ")})`);
  const [name = "", ...rest] = argv;
  const named = tasks[name];
  if (named) return named(rest);
  const list = Object.keys(tasks)
    .map((task) => task || "(none)")
    .join(" | ");
  throw new Error(`pnpm ${[area, name].filter(Boolean).join(" ")}: no such task. One of: ${list}`);
}

// Guarded so a spec can import `plan` without running anything.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [area = "", ...argv] = process.argv.slice(2);
  let steps;
  try {
    steps = plan(area, argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
  for (const step of steps) {
    const result = spawnSync(step.command, step.args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
