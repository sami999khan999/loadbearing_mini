import { describe, expect, it } from "vitest";
import { MentionText } from "../../src/messaging/mention-text.js";

const ADA = "018f8c00-0000-7000-8000-0000000000a1";

describe("MentionText", () => {
  it("shows a mention as the member's name, and a stranger as someone", () => {
    const nameFor = (userId: string) => (userId === ADA ? "Ada" : null);
    const body = `hi ${MentionText.token(ADA)} and <@018f8c00-0000-7000-8000-0000000000ff>`;

    expect(MentionText.render(body, nameFor)).toBe("hi @Ada and @someone");
  });
});
