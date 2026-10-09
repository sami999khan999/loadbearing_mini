import type { LifecycleRule } from "../port/index.js";

// The only rule lite composes. An export is a copy of a tenant's data in a bucket, and
// seven days is how long that is a download rather than a liability.
const EXPORT_PREFIX = "export/";
const EXPORT_DAYS = 7;

// Pure: every rule the bucket receives is composed here, so the converger and anything reading
// it back compare the same thing. Lite has no retention rows or colder class; the big kit does.
export class RetentionRules {
  private constructor() {}

  public static lifecycleFor(): readonly LifecycleRule[] {
    return [{ prefix: EXPORT_PREFIX, expireAfterDays: EXPORT_DAYS }];
  }

  // Whether the bucket already holds what lite composes. Both sides are sorted, so
  // comparing the serialised form is what makes "apply on difference" one expression.
  public static lifecycleMatches(
    expected: readonly LifecycleRule[],
    actual: readonly LifecycleRule[],
  ): boolean {
    return RetentionRules.serialise(expected) === RetentionRules.serialise(actual);
  }

  // One rule as the comparison reads it and the drift line prints it. `export/=7`.
  public static describe(rule: LifecycleRule): string {
    return `${rule.prefix}=${rule.expireAfterDays}`;
  }

  private static serialise(rules: readonly LifecycleRule[]): string {
    return [...rules]
      .sort((left, right) => left.prefix.localeCompare(right.prefix))
      .map((rule) => RetentionRules.describe(rule))
      .join("|");
  }
}
