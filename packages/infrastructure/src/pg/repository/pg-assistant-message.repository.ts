import {
  type AssistantMessageRecord,
  type AssistantMessageRepository,
  type AssistantSettlement,
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  type OrganizationId,
  type Placement,
  type UserId,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { assistantMessages } from "../schema/index.js";

export class PgAssistantMessageRepository
  extends BaseRepository
  implements AssistantMessageRepository
{
  protected override readonly placement: Placement = "routed";

  // The newest `limit`, read backwards off the thread index and turned round: the prompt
  // and the screen both want them oldest first.
  public async listByThread(
    organizationId: OrganizationId,
    threadId: string,
    limit: number,
  ): Promise<readonly AssistantMessageRecord[]> {
    const rows = await this.db
      .select()
      .from(assistantMessages)
      .where(
        and(
          eq(assistantMessages.organizationId, organizationId),
          eq(assistantMessages.threadId, threadId),
        ),
      )
      .orderBy(desc(assistantMessages.createdAt), desc(assistantMessages.id))
      .limit(limit);
    return rows.reverse();
  }

  public async findInThread(
    organizationId: OrganizationId,
    threadId: string,
    messageId: string,
  ): Promise<AssistantMessageRecord | null> {
    const [row] = await this.db
      .select()
      .from(assistantMessages)
      .where(
        and(
          eq(assistantMessages.organizationId, organizationId),
          eq(assistantMessages.threadId, threadId),
          eq(assistantMessages.id, messageId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  public async insert(message: AssistantMessageRecord): Promise<void> {
    await this.db.insert(assistantMessages).values(message);
  }

  // Guarded on `pending` in the statement itself, so two settles racing for one answer
  // produce exactly one winner.
  public async settle(
    organizationId: OrganizationId,
    threadId: string,
    messageId: string,
    settlement: AssistantSettlement,
  ): Promise<boolean> {
    const updated = await this.db
      .update(assistantMessages)
      .set(settlement)
      .where(
        and(
          eq(assistantMessages.organizationId, organizationId),
          eq(assistantMessages.threadId, threadId),
          eq(assistantMessages.id, messageId),
          eq(assistantMessages.status, "pending"),
        ),
      )
      .returning({ id: assistantMessages.id });
    return updated.length > 0;
  }

  public async deleteByThread(organizationId: OrganizationId, threadId: string): Promise<void> {
    await this.db
      .delete(assistantMessages)
      .where(
        and(
          eq(assistantMessages.organizationId, organizationId),
          eq(assistantMessages.threadId, threadId),
        ),
      );
  }

  // Off the partial `pending` index, which holds only what is generating or stuck.
  public async countPending(
    organizationId: OrganizationId,
    authorId: UserId,
    since: Date,
  ): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(assistantMessages)
      .where(
        and(
          eq(assistantMessages.organizationId, organizationId),
          eq(assistantMessages.status, "pending"),
          gte(assistantMessages.createdAt, since),
          eq(assistantMessages.authorId, authorId),
        ),
      );
    return Number(row?.value ?? 0);
  }

  // The node's tenants at once, off each partition's partial `pending` index: the sweep
  // reads only what is stuck. A batch is chosen first, so one statement locks only it.
  public async failStale(olderThan: Date, limit: number): Promise<number> {
    const stuck = this.db
      .select({ id: assistantMessages.id })
      .from(assistantMessages)
      .where(
        and(eq(assistantMessages.status, "pending"), lt(assistantMessages.createdAt, olderThan)),
      )
      .limit(limit);
    const updated = await this.db
      .update(assistantMessages)
      .set({ status: "failed", completedAt: new Date() })
      .where(
        and(
          inArray(assistantMessages.id, stuck),
          eq(assistantMessages.status, "pending"),
          lt(assistantMessages.createdAt, olderThan),
        ),
      )
      .returning({ id: assistantMessages.id });
    return updated.length;
  }
}
