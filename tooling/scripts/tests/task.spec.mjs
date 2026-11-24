// What each root command runs. The table is the contract: CI and the docs name these.

// @ts-check

import { describe, expect, it } from "vitest";

import { plan } from "../task.mjs";

const line = (area, ...argv) =>
  plan(area, argv).map((step) => [step.command, ...step.args].join(" "));

describe("plan", () => {
  it("builds the packages before starting every app, or one", () => {
    expect(line("dev")).toEqual([
      "pnpm build:packages",
      "pnpm --filter ./apps/* --parallel run dev",
    ]);
    expect(line("dev", "web")).toEqual([
      "pnpm build:packages",
      "pnpm --filter @loadbearing/web run dev",
    ]);
  });

  it("runs every gate with no name, and one with a name", () => {
    expect(line("check")).toHaveLength(4);
    expect(line("check", "architecture")).toEqual(["node tooling/scripts/check-architecture.mjs"]);
  });

  it("brings the whole stack up, and down across every profile", () => {
    expect(line("infra", "up")).toEqual(["node tooling/scripts/compose.mjs up -d"]);
    expect(line("infra", "down")).toEqual(["node tooling/scripts/compose.mjs --profile * down"]);
  });

  it("passes a task's own arguments through", () => {
    expect(line("ops", "platform-grant", "a@b.test")).toEqual([
      "pnpm --filter @loadbearing/infrastructure run platform:grant a@b.test",
    ]);
    expect(line("db", "migrate")).toEqual([
      "pnpm --filter @loadbearing/infrastructure run db:migrate",
    ]);
  });

  it("names the tasks rather than guessing at an unknown one", () => {
    expect(() => plan("db", ["seed"])).toThrow(/no such task. One of: generate \| migrate/);
    expect(() => plan("nope", [])).toThrow(/unknown area/);
  });
});
