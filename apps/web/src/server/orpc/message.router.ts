import { authed } from "../import.js";

export class MessageRouter {
  private constructor() {}

  public static readonly list = authed.message.list.handler(({ input, context }) =>
    context.container.messaging.listMessages.execute(context.principal, input),
  );

  public static readonly attachmentUpload = authed.message.attachmentUpload.handler(
    ({ input, context }) =>
      context.container.messaging.requestAttachmentUpload.execute(context.principal, input),
  );

  public static readonly attachmentUrl = authed.message.attachmentUrl.handler(
    ({ input, context }) =>
      context.container.messaging.openAttachment.execute(context.principal, input),
  );

  public static readonly thread = authed.message.thread.handler(({ input, context }) =>
    context.container.messaging.listThread.execute(context.principal, input),
  );

  public static readonly react = authed.message.react.handler(async ({ input, context }) => {
    await context.container.messaging.react.execute(context.principal, input);
    return { ok: true as const };
  });

  public static readonly send = authed.message.send.handler(({ input, context }) =>
    context.container.messaging.send.execute(context.principal, input),
  );

  public static readonly edit = authed.message.edit.handler(({ input, context }) =>
    context.container.messaging.edit.execute(context.principal, input),
  );

  public static readonly remove = authed.message.remove.handler(async ({ input, context }) => {
    await context.container.messaging.remove.execute(context.principal, input);
    return { ok: true as const };
  });

  public static readonly typing = authed.message.typing.handler(async ({ input, context }) => {
    await context.container.messaging.typing.execute(context.principal, input);
    return { ok: true as const };
  });

  public static readonly all = {
    react: MessageRouter.react,
    thread: MessageRouter.thread,
    attachmentUpload: MessageRouter.attachmentUpload,
    attachmentUrl: MessageRouter.attachmentUrl,
    list: MessageRouter.list,
    send: MessageRouter.send,
    edit: MessageRouter.edit,
    remove: MessageRouter.remove,
    typing: MessageRouter.typing,
  };
}
