import type { OrganizationId, UserId } from "../import.js";

export interface AssistantThreadRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly authorId: UserId;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Where a page of threads stopped, as the list hands it back.
export interface AssistantThreadCursor {
  readonly updatedAt: Date;
  readonly id: string;
}

// A person's own threads. Every read names the author as well as the tenant: a thread is
// private to whoever started it, and no method here can list another person's.
export abstract class AssistantThreadRepository {
  public abstract findById(
    organizationId: OrganizationId,
    authorId: UserId,
    threadId: string,
  ): Promise<AssistantThreadRecord | null>;

  // Newest activity first, a page at a time.
  public abstract listByAuthor(
    organizationId: OrganizationId,
    authorId: UserId,
    limit: number,
    before: AssistantThreadCursor | null,
  ): Promise<readonly AssistantThreadRecord[]>;

  // Creates the row, or replaces its title and time when it exists.
  public abstract save(thread: AssistantThreadRecord): Promise<void>;

  public abstract touch(
    organizationId: OrganizationId,
    threadId: string,
    updatedAt: Date,
  ): Promise<void>;

  public abstract delete(organizationId: OrganizationId, threadId: string): Promise<void>;
}
