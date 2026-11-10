import { authed } from "../import.js";

// The answer's stream is `realtime.assistant`, served by `apps/realtime`, not here.
export class AssistantRouter {
  private constructor() {}

  public static readonly list = authed.assistant.list.handler(({ input, context }) =>
    context.container.assistant.list.execute(context.principal, input),
  );

  public static readonly get = authed.assistant.get.handler(({ input, context }) =>
    context.container.assistant.get.execute(context.principal, input),
  );

  public static readonly send = authed.assistant.send.handler(({ input, context }) =>
    context.container.assistant.send.execute(context.principal, input),
  );

  public static readonly cancel = authed.assistant.cancel.handler(async ({ input, context }) => {
    await context.container.assistant.cancel.execute(context.principal, input);
    return { ok: true as const };
  });

  public static readonly rename = authed.assistant.rename.handler(({ input, context }) =>
    context.container.assistant.rename.execute(context.principal, input),
  );

  public static readonly remove = authed.assistant.remove.handler(async ({ input, context }) => {
    await context.container.assistant.remove.execute(context.principal, input);
    return { ok: true as const };
  });

  public static readonly usage = authed.assistant.usage.handler(({ context }) =>
    context.container.assistant.usage.execute(context.principal),
  );

  public static readonly all = {
    list: AssistantRouter.list,
    get: AssistantRouter.get,
    send: AssistantRouter.send,
    cancel: AssistantRouter.cancel,
    rename: AssistantRouter.rename,
    remove: AssistantRouter.remove,
    usage: AssistantRouter.usage,
  };
}
