CREATE TABLE "conversation_members" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_read_message_id" uuid,
	"muted_at" timestamp with time zone,
	CONSTRAINT "conversation_members_id_organization_id_pk" PRIMARY KEY("id","organization_id")
) PARTITION BY LIST ("organization_id");
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"direct_key" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_message_id" uuid,
	CONSTRAINT "conversations_id_organization_id_pk" PRIMARY KEY("id","organization_id")
) PARTITION BY LIST ("organization_id");
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"uploader_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "message_attachments_id_organization_id_created_at_pk" PRIMARY KEY("id","organization_id","created_at")
) PARTITION BY LIST ("organization_id");
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "message_reactions_id_organization_id_created_at_pk" PRIMARY KEY("id","organization_id","created_at")
) PARTITION BY LIST ("organization_id");
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"body" text NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"parent_id" uuid,
	"parent_created_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_id_organization_id_created_at_pk" PRIMARY KEY("id","organization_id","created_at")
) PARTITION BY LIST ("organization_id");
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "last_event_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_members_uq" ON "conversation_members" USING btree ("organization_id","conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "conversation_members_mine_idx" ON "conversation_members" USING btree ("organization_id","user_id","last_read_at");--> statement-breakpoint
CREATE INDEX "conversation_members_conversation_fk_idx" ON "conversation_members" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_members_user_fk_idx" ON "conversation_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_direct_uq" ON "conversations" USING btree ("organization_id","direct_key") WHERE direct_key is not null;--> statement-breakpoint
CREATE INDEX "conversations_recent_idx" ON "conversations" USING btree ("organization_id",coalesce("last_message_at", "created_at") desc,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "message_attachments_page_idx" ON "message_attachments" USING btree ("organization_id","conversation_id","created_at","message_id");--> statement-breakpoint
CREATE INDEX "message_attachments_uploader_fk_idx" ON "message_attachments" USING btree ("organization_id","uploader_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_reactions_once_uq" ON "message_reactions" USING btree ("organization_id","message_id","user_id","emoji","created_at");--> statement-breakpoint
CREATE INDEX "message_reactions_page_idx" ON "message_reactions" USING btree ("organization_id","conversation_id","created_at","message_id");--> statement-breakpoint
CREATE INDEX "message_reactions_user_fk_idx" ON "message_reactions" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "messages_keyset_idx" ON "messages" USING btree ("organization_id","conversation_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_conversation_fk_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("organization_id","conversation_id","parent_id","created_at","id") WHERE "messages"."parent_id" is not null;