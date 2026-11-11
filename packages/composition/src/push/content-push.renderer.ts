import type { ContentSource, PushPayload, RenderedPush } from "../import.js";

// A push's words: the kind's title and body from the `notification` catalog, in the
// recipient's locale (`26.3`). Here for the reason the mail renderer is.
export class ContentPushRenderer {
  public constructor(
    private readonly content: ContentSource,
    private readonly baseUrl: string,
  ) {}

  public async render(payload: PushPayload): Promise<RenderedPush> {
    const t = await this.content.translator(payload.locale, ["notification"]);
    return {
      title: t.t(`notification.kind.${payload.kind}.title` as never),
      body: t.t(`notification.kind.${payload.kind}.body` as never),
      url: payload.link ? `${this.baseUrl}${payload.link}` : null,
    };
  }
}
