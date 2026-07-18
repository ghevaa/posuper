ALTER TYPE "public"."payment_method" ADD VALUE 'qris';--> statement-breakpoint
CREATE TABLE "stock_opname_items" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"product_id" text,
	"product_name" text NOT NULL,
	"unit" text DEFAULT 'Pcs' NOT NULL,
	"stock_start" integer DEFAULT 0 NOT NULL,
	"stock_in" integer DEFAULT 0 NOT NULL,
	"stock_real" integer DEFAULT 0 NOT NULL,
	"usage" integer DEFAULT 0 NOT NULL,
	"waste" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "stock_opname_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"date" timestamp NOT NULL,
	"user_id" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "payment_method" "payment_method" DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "midtrans_order_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "midtrans_snap_token" text;--> statement-breakpoint
ALTER TABLE "stock_opname_items" ADD CONSTRAINT "stock_opname_items_session_id_stock_opname_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."stock_opname_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opname_items" ADD CONSTRAINT "stock_opname_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opname_sessions" ADD CONSTRAINT "stock_opname_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_opname_items_sessionId_idx" ON "stock_opname_items" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "stock_opname_sessions_date_idx" ON "stock_opname_sessions" USING btree ("date");