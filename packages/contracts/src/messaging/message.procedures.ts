import { oc } from "../import.js";
import { Envelope } from "../primitive/index.js";
import { MessageContract } from "./message.contract.js";

export class MessageProcedures {
  private constructor() {}

  // Pages backwards from the newest, so the shape is `{ items, nextCursor }` read as
  // "older than this" rather than the forward keyset every other list uses.
  public static readonly list = oc
    .route({ method: "GET", path: "/messages" })
    .input(MessageContract.listQuery)
    .output(MessageContract.page);

  public static readonly send = oc
    .route({ method: "POST", path: "/messages" })
    .input(MessageContract.send)
    .output(MessageContract.entity);

  public static readonly edit = oc
    .route({ method: "PUT", path: "/messages/{messageId}" })
    .input(MessageContract.edit)
    .output(MessageContract.entity);

  public static readonly remove = oc
    .route({ method: "DELETE", path: "/messages/{messageId}" })
    .input(MessageContract.remove)
    .output(Envelope.acknowledged);

  public static readonly typing = oc
    .route({ method: "POST", path: "/messages/typing" })
    .input(MessageContract.typing)
    .output(Envelope.acknowledged);

  public static readonly react = oc
    .route({ method: "POST", path: "/messages/{messageId}/reactions" })
    .input(MessageContract.react)
    .output(Envelope.acknowledged);

  public static readonly thread = oc
    .route({ method: "GET", path: "/messages/{messageId}/thread" })
    .input(MessageContract.threadQuery)
    .output(MessageContract.threadPage);

  public static readonly attachmentUpload = oc
    .route({ method: "POST", path: "/messages/attachments" })
    .input(MessageContract.attachmentUpload)
    .output(MessageContract.attachmentUploaded);

  public static readonly attachmentUrl = oc
    .route({ method: "GET", path: "/messages/attachments/{attachmentId}" })
    .input(MessageContract.attachmentLink)
    .output(MessageContract.attachmentUrl);

  public static readonly all = {
    list: MessageProcedures.list,
    send: MessageProcedures.send,
    react: MessageProcedures.react,
    thread: MessageProcedures.thread,
    attachmentUpload: MessageProcedures.attachmentUpload,
    attachmentUrl: MessageProcedures.attachmentUrl,
    edit: MessageProcedures.edit,
    remove: MessageProcedures.remove,
    typing: MessageProcedures.typing,
  } as const;
}
