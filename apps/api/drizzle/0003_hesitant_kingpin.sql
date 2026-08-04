CREATE TYPE "public"."kitchen_status" AS ENUM('pending', 'processing', 'completed');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('dine_in', 'take_away');--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'transfer';--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'non_cash';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'kitchen';--> statement-breakpoint
CREATE TABLE "category_option_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_id" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_multiple" boolean DEFAULT false NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_options" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_opname_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_opname_items" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "stock_opname_items" ADD COLUMN "stock_in_entries" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "order_type" "order_type" DEFAULT 'dine_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "table_no" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "kitchen_status" "kitchen_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "category_option_groups" ADD CONSTRAINT "category_option_groups_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_options" ADD CONSTRAINT "category_options_group_id_category_option_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."category_option_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_option_groups_categoryId_idx" ON "category_option_groups" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "category_options_groupId_idx" ON "category_options" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "stock_opname_items" ADD CONSTRAINT "stock_opname_items_category_id_stock_opname_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."stock_opname_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_opname_items_categoryId_idx" ON "stock_opname_items" USING btree ("category_id");