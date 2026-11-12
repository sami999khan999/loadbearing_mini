import {
  type AssistantThreadPage,
  type ListAssistantThreadsInput,
  ValidationError,
} from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type {
  AssistantThreadCursor,
  AssistantThreadRepository,
} from "./assistant-thread.repository.js";

// Always the actor's own: the repository has no way to list anyone else's.
export class ListAssistantThreadsUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly threads: AssistantThreadRepository,
  ) {}

  public async execute(
    actor: Principal,
    input: ListAssistantThreadsInput,
  ): Promise<AssistantThreadPage> {
    this.authorizer.assert(actor, "ai.assistant.use");

    // One more than the page, so a full last page is known to be the last.
    const rows = await this.threads.listByAuthor(
      actor.organizationId,
      actor.userId,
      input.limit + 1,
      input.cursor ? ListAssistantThreadsUseCase.decode(input.cursor) : null,
    );
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > input.limit && last ? `${last.updatedAt.toISOString()}|${last.id}` : null,
    };
  }

  // Opaque to the client, which echoes back what it was given; anything else is refused.
  private static decode(cursor: string): AssistantThreadCursor {
    const [iso, id, ...rest] = cursor.split("|");
    const updatedAt = new Date(iso ?? "");
    if (rest.length > 0 || !id || Number.isNaN(updatedAt.getTime())) {
      throw new ValidationError([{ field: "cursor", rule: "format" }]);
    }
    return { updatedAt, id };
  }
}
