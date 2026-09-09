CREATE TABLE "telemetry_ac" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"device_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"v1" text,
	"a1" text,
	"fp1" text,
	"rssi" text
);
--> statement-breakpoint
CREATE TABLE "telemetry_dc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"device_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vdc1" text,
	"cc1" text,
	"vdc2" text,
	"cc2" text,
	"vdc3" text,
	"cc3" text,
	"rssi" text
);
--> statement-breakpoint
CREATE TABLE "telemetry_env" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"device_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"temp" text,
	"humidity" text,
	"solar" text,
	"light" text,
	"wind" text,
	"h2" text,
	"rssi" text
);
--> statement-breakpoint
ALTER TABLE "telemetry_ac" ADD CONSTRAINT "telemetry_ac_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_dc" ADD CONSTRAINT "telemetry_dc_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_env" ADD CONSTRAINT "telemetry_env_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telemetry_ac_device_time_idx" ON "telemetry_ac" USING btree ("device_id","time");--> statement-breakpoint
CREATE INDEX "telemetry_dc_device_time_idx" ON "telemetry_dc" USING btree ("device_id","time");--> statement-breakpoint
CREATE INDEX "telemetry_env_device_time_idx" ON "telemetry_env" USING btree ("device_id","time");