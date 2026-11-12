import type { ConversationId, OrganizationId, Principal } from "../import.js";

// One open stream, as the minute's check sees it: the principal it opened with, and the
// room when it is a conversation stream. A user stream has none.
export interface HeldStream {
  readonly principal: Principal;
  readonly conversationId?: ConversationId;
}

// Answers for one tenant's streams, in the order asked: `false` ends that stream and no other.
export type TenantRevalidation = (
  organizationId: OrganizationId,
  held: readonly HeldStream[],
) => Promise<readonly boolean[]>;

interface Registered {
  readonly held: HeldStream;
  readonly revoke: () => void;
}

// Held streams are asked again and end when the answer is no (`CR.4`). One interval a
// process, not a timer a stream: each tick groups what is open by tenant (`RV.4`).
export class StreamRevalidation {
  private readonly registered = new Set<Registered>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  public constructor(
    private readonly everyMs: number,
    private readonly revalidate: TenantRevalidation,
  ) {}

  // A signal that aborts with `signal` or when the check says no. Registering is the only
  // thing a stream does; `stop` on close or abort takes it out again.
  public watch(
    signal: AbortSignal,
    held: HeldStream,
  ): { readonly signal: AbortSignal; readonly stop: () => void } {
    const revoked = new AbortController();
    const entry: Registered = { held, revoke: () => revoked.abort() };
    const stop = () => this.unregister(entry);

    this.registered.add(entry);
    this.start();
    signal.addEventListener("abort", stop, { once: true });

    return { signal: AbortSignal.any([signal, revoked.signal]), stop };
  }

  public get size(): number {
    return this.registered.size;
  }

  // Run one pass now. The interval calls it; it is public so a test need not wait a minute.
  public async tick(): Promise<void> {
    // A tick while the last is still out is skipped: under a slow pool, stacking them
    // would queue another query per tenant every interval onto the same five.
    if (this.ticking) return;
    this.ticking = true;
    try {
      const byTenant = new Map<OrganizationId, Registered[]>();
      for (const entry of this.registered) {
        const tenant = entry.held.principal.organizationId;
        byTenant.set(tenant, [...(byTenant.get(tenant) ?? []), entry]);
      }

      // Serial, so a process never has more than one tenant's checks on its pool.
      for (const [organizationId, entries] of byTenant) {
        await this.askAbout(organizationId, entries);
      }
    } finally {
      this.ticking = false;
    }
  }

  // A check that throws keeps its tenant's streams: a database blip must not drop every
  // open tab at once. It never reaches another tenant's.
  private async askAbout(
    organizationId: OrganizationId,
    entries: readonly Registered[],
  ): Promise<void> {
    try {
      const answers = await this.revalidate(
        organizationId,
        entries.map((entry) => entry.held),
      );
      entries.forEach((entry, at) => {
        if (answers[at] === false) entry.revoke();
      });
    } catch {
      return;
    }
  }

  private unregister(entry: Registered): void {
    this.registered.delete(entry);
    if (this.registered.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.everyMs);
    this.timer.unref();
  }
}
