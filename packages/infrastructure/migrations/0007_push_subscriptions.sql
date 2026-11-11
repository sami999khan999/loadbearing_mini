CREATE TABLE "push_subscriptions" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_id_organization_id_pk" PRIMARY KEY("id","organization_id")
) PARTITION BY LIST ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uq" ON "push_subscriptions" USING btree ("organization_id","endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_fk_idx" ON "push_subscriptions" USING btree ("organization_id","user_id");