CREATE TYPE "public"."device_api_key_type" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TABLE "device_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"type" "device_api_key_type" NOT NULL,
	"api_key" varchar(128) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "device_api_keys_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
ALTER TABLE "device_api_keys" ADD CONSTRAINT "device_api_keys_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_api_keys_device_type_unique" ON "device_api_keys" USING btree ("device_id","type");
--> statement-breakpoint
-- Existing devices receive a generated READ and WRITE API key pair.
INSERT INTO "device_api_keys" ("device_id", "type", "api_key")
SELECT d."id", key_type."type"::"device_api_key_type",
       'g7_' || key_type."type" || '_' ||
       replace(gen_random_uuid()::text, '-', '') ||
       replace(gen_random_uuid()::text, '-', '')
FROM "devices" d
CROSS JOIN (VALUES ('read'), ('write')) AS key_type("type");
--> statement-breakpoint
CREATE FUNCTION enforce_device_api_keys(target_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  read_count integer;
  write_count integer;
  total_count integer;
BEGIN
  PERFORM 1 FROM "devices" WHERE "id" = target_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT
    count(*) FILTER (WHERE "type" = 'read'),
    count(*) FILTER (WHERE "type" = 'write'),
    count(*)
  INTO read_count, write_count, total_count
  FROM "device_api_keys"
  WHERE "device_id" = target_id;

  IF read_count <> 1 OR write_count <> 1 OR total_count <> 2 THEN
    RAISE EXCEPTION 'Device must have exactly one READ and one WRITE API key'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION check_device_api_keys_from_device() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM enforce_device_api_keys(NEW."id");
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION check_device_api_keys_from_key() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM enforce_device_api_keys(OLD."device_id"); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM enforce_device_api_keys(NEW."device_id"); END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER device_requires_api_keys
AFTER INSERT OR UPDATE ON "devices"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_device_api_keys_from_device();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER device_api_keys_preserve_pair
AFTER INSERT OR UPDATE OR DELETE ON "device_api_keys"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_device_api_keys_from_key();
--> statement-breakpoint
DO $$
DECLARE device_row record;
BEGIN
  FOR device_row IN SELECT "id" FROM "devices" LOOP
    PERFORM enforce_device_api_keys(device_row."id");
  END LOOP;
END;
$$;
