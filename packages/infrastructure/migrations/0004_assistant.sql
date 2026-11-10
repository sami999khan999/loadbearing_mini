CREATE TABLE "ai_usage" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_id_organization_id_created_at_pk" PRIMARY KEY("id","organization_id","created_at"),
	CONSTRAINT "ai_usage_tokens_ck" CHECK ("ai_usage"."input_tokens" >= 0 and "ai_usage"."output_tokens" >= 0)
) PARTITION BY LIST ("organization_id");
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp (3) with time zone,
	CONSTRAINT "assistant_messages_id_organization_id_created_at_pk" PRIMARY KEY("id","organization_id","created_at")
) PARTITION BY LIST ("organization_id");
--> statement-breakpoint
CREATE TABLE "assistant_threads" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_threads_id_organization_id_pk" PRIMARY KEY("id","organization_id")
) PARTITION BY LIST ("organization_id");
--> statement-breakpoint
CREATE INDEX "ai_usage_period_idx" ON "ai_usage" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_user_idx" ON "ai_usage" USING btree ("organization_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_thread_fk_idx" ON "ai_usage" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "ai_usage_message_fk_idx" ON "ai_usage" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "assistant_messages_thread_idx" ON "assistant_messages" USING btree ("organization_id","thread_id","created_at","id");--> statement-breakpoint
CREATE INDEX "assistant_messages_thread_fk_idx" ON "assistant_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "assistant_messages_pending_idx" ON "assistant_messages" USING btree ("organization_id","created_at") WHERE "assistant_messages"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "assistant_threads_author_idx" ON "assistant_threads" USING btree ("organization_id","author_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);