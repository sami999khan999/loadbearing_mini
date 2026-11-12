// The `<@id>` token a mention is stored as, shown as `@Name` (`26.7`). Someone no longer in
// the room reads as `@someone`, never as their id.
export class MentionText {
  private constructor() {}

  public static token(userId: string): string {
    return `<@${userId}>`;
  }

  public static render(body: string, nameFor?: (userId: string) => string | null): string {
    return body.replaceAll(
      /<@([0-9a-f-]{36})>/g,
      (_, userId: string) => `@${nameFor?.(userId) ?? "someone"}`,
    );
  }
}
