import {
  type AssistantSource,
  check,
  index,
  integer,
  jsonb,
  type OrganizationId,
  pgTable,
  primaryKey,
  sql,
  text,
  timestamp,
  type UserId,
  uuid,
} from "../../import.js";

// The AI assistant's conversations (`AI.1`). Private to their author: every read names the
// author as well as the tenant, which is why every index leads with both.
export const assistantThreads = pgTable(
  "assistant_threads",
  {
    id: uuid("id").notNull(),
    // Routed, so no key to the catalog — decision `24.1`.
    organizationId: uuid("organization_id").$type<OrganizationId>().notNull(),
    // No foreign key, for the reason `messages.author_id` gives.
    authorId: uuid("author_id").$type<UserId>().notNull(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    // The last message's time, which the thread list is ordered by.
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    // A thread spans months, so it takes no month level: the tenant key only.
    primaryKey({ columns: [t.id, t.organizationId] }),
    index("assistant_threads_author_idx").on(
      t.organizationId,
      t.authorId,
      t.updatedAt.desc(),
      t.id.desc(),
    ),
  ],
);

// One row per question and one per answer. An answer is written `pending`, filled as the
// worker streams it, and settled once; the text is never written per token.
export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: uuid("id").notNull(),
    organizationId: uuid("organization_id").$type<OrganizationId>().notNull(),
    // No key, for the reason `conversation_members` gives. The nightly orphan pass counts.
    threadId: uuid("thread_id").notNull(),
    authorId: uuid("author_id").$type<UserId>().notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull().default(""),
    status: text("status", {
      enum: ["pending", "complete", "cancelled", "interrupted", "failed"],
    })
      .notNull()
      .default("complete"),
    // The passages an answer was given, as ids and titles, never their text: a reopen
    // re-checks each against what the reader may see now.
    sources: jsonb("sources").$type<readonly AssistantSource[]>().notNull().default([]),
    model: text("model"),
    // Milliseconds, like `messages.created_at`: the keyset hands it back as a predicate.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, precision: 3 }),
  },
  (t) => [
    // Both partition keys, and `id` first so the key still reads as the row's identity.
    primaryKey({ columns: [t.id, t.organizationId, t.createdAt] }),
    index("assistant_messages_thread_idx").on(t.organizationId, t.threadId, t.createdAt, t.id),
    index("assistant_messages_thread_fk_idx").on(t.threadId),
    // The nightly sweep's: answers a worker stopped streaming and never settled.
    index("assistant_messages_pending_idx")
      .on(t.organizationId, t.createdAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);

// What each answer cost, append-only: the meter the daily budget and the usage panel read.
// Singular, as an append-only table is.
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").notNull(),
    organizationId: uuid("organization_id").$type<OrganizationId>().notNull(),
    userId: uuid("user_id").$type<UserId>().notNull(),
    threadId: uuid("thread_id").notNull(),
    messageId: uuid("message_id").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.organizationId, t.createdAt] }),
    index("ai_usage_period_idx").on(t.organizationId, t.createdAt),
    index("ai_usage_user_idx").on(t.organizationId, t.userId, t.createdAt),
    index("ai_usage_thread_fk_idx").on(t.threadId),
    index("ai_usage_message_fk_idx").on(t.messageId),
    check("ai_usage_tokens_ck", sql`${t.inputTokens} >= 0 and ${t.outputTokens} >= 0`),
  ],
);
