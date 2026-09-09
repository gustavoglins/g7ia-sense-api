CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'user');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;
--> statement-breakpoint
-- Preserve the administrators created before explicit roles existed.
UPDATE "user" SET "role" = 'admin' WHERE "username" LIKE 'admin@%';
