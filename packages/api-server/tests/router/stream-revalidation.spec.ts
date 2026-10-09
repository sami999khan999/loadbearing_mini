import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type HeldStream,
  StreamRevalidation,
  type TenantRevalidation,
} from "../../src/router/stream-revalidation.js";

// `CR.4`: a removed member's stream ends. `RV.4`: one interval for the process, asking
// once per tenant.
const stream = (organizationId: string, userId = "u"): HeldStream =>
  ({ principal: { organizationId, userId } }) as unknown as HeldStream;

const tenantOf = (held: HeldStream): string => held.principal.organizationId;

describe("StreamRevalidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts the stream the first time the check says no", async () => {
    let allowed = true;
    const registry = new StreamRevalidation(1_000, (_org, held) =>
      Promise.resolve(held.map(() => allowed)),
    );
    const watched = registry.watch(new AbortController().signal, stream("a"));

    await vi.advanceTimersByTimeAsync(1_000);
    expect(watched.signal.aborted).toBe(false);

    allowed = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(watched.signal.aborted).toBe(true);
    watched.stop();
  });

  it("asks once per tenant with every stream of that tenant, however many", async () => {
    const asked: { organizationId: string; users: string[] }[] = [];
    const revalidate: TenantRevalidation = (organizationId, held) => {
      asked.push({ organizationId, users: held.map((entry) => entry.principal.userId) });
      return Promise.resolve(held.map(() => true));
    };
    const registry = new StreamRevalidation(1_000, revalidate);
    const signal = new AbortController().signal;
    registry.watch(signal, stream("a", "1"));
    registry.watch(signal, stream("b", "2"));
    registry.watch(signal, stream("a", "3"));
    registry.watch(signal, stream("a", "4"));

    await vi.advanceTimersByTimeAsync(1_000);

    expect(asked).toEqual([
      { organizationId: "a", users: ["1", "3", "4"] },
      { organizationId: "b", users: ["2"] },
    ]);
  });

  // Only the stream answered `false` ends; its neighbours in the same batch carry on.
  it("ends only the stream whose answer is no", async () => {
    const registry = new StreamRevalidation(1_000, (_org, held) =>
      Promise.resolve(held.map((entry) => entry.principal.userId !== "gone")),
    );
    const signal = new AbortController().signal;
    const kept = registry.watch(signal, stream("a", "stays"));
    const ended = registry.watch(signal, stream("a", "gone"));

    await vi.advanceTimersByTimeAsync(1_000);

    expect(kept.signal.aborted).toBe(false);
    expect(ended.signal.aborted).toBe(true);
  });

  // A database blip is not a revocation: dropping every open tab at once would put them
  // all back on the reconnect path together. And one tenant's failure is that tenant's.
  it("keeps the streams of a tenant whose check fails, and still asks the others", async () => {
    const registry = new StreamRevalidation(1_000, (organizationId, held) =>
      organizationId === "a"
        ? Promise.reject(new Error("shard down"))
        : Promise.resolve(held.map(() => false)),
    );
    const signal = new AbortController().signal;
    const failing = registry.watch(signal, stream("a"));
    const refused = registry.watch(signal, stream("b"));

    await vi.advanceTimersByTimeAsync(3_000);

    expect(failing.signal.aborted).toBe(false);
    expect(refused.signal.aborted).toBe(true);
  });

  it("asks nothing about a stream once it has stopped, or its request has aborted", async () => {
    const revalidate = vi.fn<TenantRevalidation>((_org, held) =>
      Promise.resolve(held.map(() => true)),
    );
    const registry = new StreamRevalidation(1_000, revalidate);
    const request = new AbortController();
    const aborted = registry.watch(request.signal, stream("a", "aborted"));
    const stopped = registry.watch(new AbortController().signal, stream("a", "stopped"));
    const open = registry.watch(new AbortController().signal, stream("a", "open"));

    request.abort();
    expect(aborted.signal.aborted).toBe(true);
    stopped.stop();
    expect(registry.size).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(revalidate.mock.calls[0]?.[1].map(tenantOf)).toEqual(["a"]);
    expect(revalidate.mock.calls[0]?.[1].map((entry) => entry.principal.userId)).toEqual(["open"]);
    open.stop();
  });

  it("runs no interval while nothing is open", async () => {
    const revalidate = vi.fn<TenantRevalidation>(() => Promise.resolve([]));
    const registry = new StreamRevalidation(1_000, revalidate);
    registry.watch(new AbortController().signal, stream("a")).stop();

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(revalidate).not.toHaveBeenCalled();
  });

  // `RV.4`. A check slower than the interval queued a second one behind it on a pool of five.
  it("starts no pass while the last one is still out", async () => {
    let finish: (answers: readonly boolean[]) => void = () => undefined;
    const revalidate = vi.fn<TenantRevalidation>(
      () =>
        new Promise<readonly boolean[]>((resolve) => {
          finish = resolve;
        }),
    );
    const registry = new StreamRevalidation(1_000, revalidate);
    const watched = registry.watch(new AbortController().signal, stream("a"));

    await vi.advanceTimersByTimeAsync(3_000);
    expect(revalidate).toHaveBeenCalledTimes(1);

    finish([true]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(revalidate).toHaveBeenCalledTimes(2);
    watched.stop();
  });
});
