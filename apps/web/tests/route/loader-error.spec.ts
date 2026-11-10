import { ForbiddenError, NotFoundError, ValidationError } from "@loadbearing/errors";
import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { LoaderError, type RouteNode } from "../../src/route/-loader-error.js";

const node = (children?: Record<string, RouteNode>): RouteNode => ({
  options: {},
  ...(children ? { children } : {}),
});

const thrownBy = (route: RouteNode, error: unknown): unknown => {
  try {
    route.options.onError?.(error);
  } catch (thrown: unknown) {
    return thrown;
  }
  return undefined;
};

describe("LoaderError.mapNotFound", () => {
  it("reaches every route in the tree, nested ones included", () => {
    const leaf = node();
    const root = node({ branch: node({ leaf }) });

    LoaderError.mapNotFound(root);

    expect(isNotFound(thrownBy(leaf, new NotFoundError("assistant.thread", "x")))).toBe(true);
  });

  // `AI.4`: messaging answers a conversation you are not in with `FORBIDDEN`, and the
  // page rendered a 500 for it.
  it("turns a refusal into the not-found page, and leaves any other failure alone", () => {
    const route = node();
    LoaderError.mapNotFound(route);

    expect(isNotFound(thrownBy(route, new ForbiddenError("messaging.conversation.read")))).toBe(
      true,
    );
    expect(thrownBy(route, new ValidationError([]))).toBeUndefined();
  });

  it("keeps a route's own error hook", () => {
    const own = () => undefined;
    const route: RouteNode = { options: { onError: own } };

    LoaderError.mapNotFound(route);

    expect(route.options.onError).toBe(own);
  });
});
