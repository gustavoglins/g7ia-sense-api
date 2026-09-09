CREATE TYPE "public"."devices_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."devices_types" AS ENUM('ac', 'dc', 'env', 'act', 'adv');--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sector_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"serial_number" varchar(255),
	"version" varchar(255),
	"mac_address" varchar(255),
	"status" "devices_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_sector_id_idx" ON "devices" USING btree ("sector_id");