import {
  type AssistantThreadCursor,
  type AssistantThreadRecord,
  type AssistantThreadRepository,
  and,
  desc,
  eq,
  type OrganizationId,
  type Placement,
  sql,
  type UserId,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { assistantThreads } from "../schema/index.js";

export class PgAssistantThreadRepository
  extends BaseRepository
  implements AssistantThreadRepository
{
  // A person's threads are tenant-produced.
  protected override readonly placement: Placement = "routed";

  public async findById(
    organizationId: OrganizationId,
    authorId: UserId,
    threadId: string,
  ): Promise<AssistantThreadRecord | null> {
    const [row] = await this.db
      .select()
      .from(assistantThreads)
      .where(
        and(
          eq(assistantThreads.organizationId, organizationId),
          eq(assistantThreads.id, threadId),
          // The author in the predicate, never a check after: another person's thread is
          // not found, the same answer a thread that does not exist gets.
          eq(assistantThreads.authorId, authorId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // The keyset in the index's own order, so a page is one index range.
  public async listByAuthor(
    organizationId: OrganizationId,
    authorId: UserId,
    limit: number,
    before: AssistantThreadCursor | null,
  ): Promise<readonly AssistantThreadRecord[]> {
    return this.db
      .select()
      .from(assistantThreads)
      .where(
        and(
          eq(assistantThreads.organizationId, organizationId),
          eq(assistantThreads.authorId, authorId),
          before
            ? sql`(${assistantThreads.updatedAt}, ${assistantThreads.id}) < (${before.updatedAt}, ${before.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(assistantThreads.updatedAt), desc(assistantThreads.id))
      .limit(limit);
  }

  public async save(thread: AssistantThreadRecord): Promise<void> {
    await this.db
      .insert(assistantThreads)
      .values(thread)
      .onConflictDoUpdate({
        target: [assistantThreads.id, assistantThreads.organizationId],
        set: { title: thread.title, updatedAt: thread.updatedAt },
      });
  }

  public async touch(
    organizationId: OrganizationId,
    threadId: string,
    updatedAt: Date,
  ): Promise<void> {
    await this.db
      .update(assistantThreads)
      .set({ updatedAt })
      .where(
        and(eq(assistantThreads.organizationId, organizationId), eq(assistantThreads.id, threadId)),
      );
  }

  public async delete(organizationId: OrganizationId, threadId: string): Promise<void> {
    await this.db
      .delete(assistantThreads)
      .where(
        and(eq(assistantThreads.organizationId, organizationId), eq(assistantThreads.id, threadId)),
      );
  }
}
