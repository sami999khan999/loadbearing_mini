import type { OrganizationId, UserId } from "../import.js";

export type AssistantMessageRole = "user" | "assistant";

// `pending` while the worker streams it; every other state is settled, once.
export type AssistantMessageStatus =
  | "pending"
  | "complete"
  | "cancelled"
  | "interrupted"
  | "failed";

// A passage an answer was given: what it was and where it lives, never its text, so a
// reopen re-checks it against what the reader may see now.
export interface AssistantSource {
  readonly kind: "doc" | "document";
  readonly id: string;
  readonly title: string;
  readonly path: string | null;
}

export interface AssistantMessageRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly threadId: string;
  readonly authorId: UserId;
  readonly role: AssistantMessageRole;
  readonly content: string;
  readonly status: AssistantMessageStatus;
  readonly sources: readonly AssistantSource[];
  readonly model: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface AssistantSettlement {
  readonly content: string;
  readonly status: Exclude<AssistantMessageStatus, "pending">;
  readonly sources: readonly AssistantSource[];
  readonly model: string | null;
  readonly completedAt: Date;
}

export abstract class AssistantMessageRepository {
  // The thread's latest `limit`, oldest first: the order a conversation is read and a
  // prompt is built in.
  public abstract listByThread(
    organizationId: OrganizationId,
    threadId: string,
    limit: number,
  ): Promise<readonly AssistantMessageRecord[]>;

  public abstract findInThread(
    organizationId: OrganizationId,
    threadId: string,
    messageId: string,
  ): Promise<AssistantMessageRecord | null>;

  public abstract insert(message: AssistantMessageRecord): Promise<void>;

  // Only a `pending` answer: false when it had already settled, so a retried or a
  // duplicated settle cannot overwrite a finished answer.
  public abstract settle(
    organizationId: OrganizationId,
    threadId: string,
    messageId: string,
    settlement: AssistantSettlement,
  ): Promise<boolean>;

  public abstract deleteByThread(organizationId: OrganizationId, threadId: string): Promise<void>;

  // Answers still `pending` from before `olderThan`, settled `failed`: a worker that died
  // mid-stream leaves one. Returns how many it settled.
  public abstract failStale(organizationId: OrganizationId, olderThan: Date): Promise<number>;
}
