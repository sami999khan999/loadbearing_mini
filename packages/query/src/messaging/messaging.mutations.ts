import type {
  ApiClient,
  AttachmentLinkInput,
  ConversationMemberInput,
  CreateConversationInput,
  DeleteMessageInput,
  EditMessageInput,
  LeaveConversationInput,
  MarkConversationReadInput,
  MessageAttachmentType,
  ReactToMessageInput,
  SendMessageInput,
  TypingInput,
} from "../import.js";
import { QueryKeys } from "../key/index.js";
import { useAppMutation } from "../runtime/index.js";

type Message = Awaited<ReturnType<ApiClient["message"]["send"]>>;
type Page = Awaited<ReturnType<ApiClient["message"]["list"]>>;
type Pages = { readonly pages: readonly Page[]; readonly pageParams: readonly unknown[] };

export class MessagingMutations {
  private constructor() {}

  // Optimistic on the newest page, keyed by the `clientId` the caller generated. The
  // stream replaces the drawn row by that key rather than guessing which one arrived.
  public static useSend(client: ApiClient, conversationId: string) {
    return useAppMutation<Message, SendMessageInput, Pages>({
      mutationFn: (input) => client.message.send(input),
      // The conversation list too: a send moves this room to the top of it.
      invalidates: [QueryKeys.conversation.all()],
      optimistic: {
        queryKey: QueryKeys.message.list(conversationId),
        // A reply belongs to its thread, never the room's own list (`26.1`).
        apply: (cached, input) =>
          input.parent
            ? cached
            : {
                ...cached,
                pages: cached.pages.map((page, index) =>
                  index === 0
                    ? { ...page, items: [MessagingMutations.pending(input), ...page.items] }
                    : page,
                ),
              },
      },
    });
  }

  public static useEdit(client: ApiClient) {
    return useAppMutation<Message, EditMessageInput>({
      mutationFn: (input) => client.message.edit(input),
      invalidates: [QueryKeys.message.all()],
    });
  }

  // A refetch of the page rather than an optimistic count: the counts are everyone's, and
  // the room's other tabs refetch from the same frame anyway (`26.1`).
  public static useReact(client: ApiClient) {
    return useAppMutation<{ ok: true }, ReactToMessageInput>({
      mutationFn: (input) => client.message.react(input),
      invalidates: [QueryKeys.message.all()],
    });
  }

  // Sign, then POST the bytes straight to storage (`26.1`), as a doc image goes. The answer
  // is what a send names: the id storage now holds, and the file's own name and type.
  public static useUploadAttachment(client: ApiClient) {
    return useAppMutation<
      { readonly id: string; readonly name: string; readonly contentType: MessageAttachmentType },
      { readonly conversationId: string; readonly file: File }
    >({
      mutationFn: async ({ conversationId, file }) => {
        const contentType = file.type as MessageAttachmentType;
        const signed = await client.message.attachmentUpload({
          conversationId,
          contentType,
          size: file.size,
        });
        // Storage reads the policy's fields first and stops at the file, so it goes last.
        const form = new FormData();
        for (const [name, value] of Object.entries(signed.post.fields)) form.append(name, value);
        form.append("file", file);
        const response = await fetch(signed.post.url, { method: "POST", body: form });
        if (!response.ok) throw new Error("UNAVAILABLE");
        return { id: signed.attachmentId, name: file.name.slice(0, 200), contentType };
      },
    });
  }

  // A link valid for minutes, opened at once rather than stored anywhere.
  public static useOpenAttachment(client: ApiClient) {
    return useAppMutation<{ url: string }, AttachmentLinkInput>({
      mutationFn: (input) => client.message.attachmentUrl(input),
    });
  }

  public static useDelete(client: ApiClient) {
    return useAppMutation<{ ok: true }, DeleteMessageInput>({
      mutationFn: (input) => client.message.remove(input),
      invalidates: [QueryKeys.message.all()],
    });
  }

  // Optimistic on the list rather than the conversation: the badge going to zero is what
  // opening a room is judged by, and the room itself is already on screen.
  public static useMarkRead(client: ApiClient) {
    return useAppMutation<{ ok: true }, MarkConversationReadInput>({
      mutationFn: (input) => client.conversation.markRead(input),
      invalidates: [QueryKeys.conversation.all()],
    });
  }

  public static useCreateConversation(client: ApiClient) {
    return useAppMutation<
      Awaited<ReturnType<ApiClient["conversation"]["create"]>>,
      CreateConversationInput
    >({
      mutationFn: (input) => client.conversation.create(input),
      invalidates: [QueryKeys.conversation.all()],
    });
  }

  public static useAddMember(client: ApiClient) {
    return useAppMutation<{ ok: true }, ConversationMemberInput>({
      mutationFn: (input) => client.conversation.addMember(input),
      invalidates: [QueryKeys.conversation.all()],
    });
  }

  public static useLeave(client: ApiClient) {
    return useAppMutation<{ ok: true }, LeaveConversationInput>({
      mutationFn: (input) => client.conversation.leave(input),
      invalidates: [QueryKeys.conversation.all()],
    });
  }

  // No invalidation and no optimism: it changes nothing here, and the composer throttles
  // it so this is called at most once every two seconds anyway.
  public static useStartTyping(client: ApiClient) {
    return useAppMutation<{ ok: true }, TypingInput>({
      mutationFn: (input) => client.message.typing(input),
    });
  }

  // The row drawn before the server has one. `id` is the client id so the key that
  // replaces it and the key that identifies it are the same string.
  private static pending(input: SendMessageInput): Message {
    // Size unknown until the server reads it; the confirmed row replaces this one.
    const attachments: Message["attachments"] = input.attachments.map((file) => ({
      ...file,
      size: 0,
    }));
    return {
      id: input.clientId,
      conversationId: input.conversationId,
      authorId: "",
      clientId: input.clientId,
      body: input.body,
      deleted: false,
      editedAt: null,
      createdAt: new Date(),
      reactions: [] as Message["reactions"],
      attachments,
    } as Message;
  }
}
