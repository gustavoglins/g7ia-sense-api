CREATE TYPE "public"."sectors_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(255),
	"status" "sectors_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "sectors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sectors_installation_id_idx" ON "sectors" USING btree ("installation_id");