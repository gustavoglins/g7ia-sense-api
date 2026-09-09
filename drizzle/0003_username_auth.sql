ALTER TABLE "user" ADD COLUMN "username" text NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "username_suffix" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_username_suffix_unique" UNIQUE("username_suffix");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_format" CHECK ("user"."username" ~ '^(admin|[a-z0-9]+[+][a-z0-9]+)@[a-z0-9]{1,100}$' AND length("user"."username") <= 255);