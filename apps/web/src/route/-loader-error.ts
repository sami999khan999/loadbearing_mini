import { notFound } from "@tanstack/react-router";
import { ErrorNormalizer } from "~/import.js";

// Hyphen-prefixed: not a route. Structural rather than `AnyRoute`, which would make the
// registered router's type depend on itself.
export interface RouteNode {
  readonly options: { onError?: (error: unknown) => void };
  readonly children?: unknown;
}

// Every route, so no page has to remember it: `ensureQueryData` rethrows the server's
// `NOT_FOUND`, which would otherwise render as a 500.
export class LoaderError {
  private constructor() {}

  public static mapNotFound(route: RouteNode): void {
    route.options.onError ??= LoaderError.toNotFound;
    const children = route.children;
    if (children === null || typeof children !== "object") return;
    for (const child of Object.values(children as Record<string, RouteNode>)) {
      LoaderError.mapNotFound(child);
    }
  }

  private static toNotFound(this: void, error: unknown): void {
    if (ErrorNormalizer.normalize(error).code === "NOT_FOUND") throw notFound();
  }
}
