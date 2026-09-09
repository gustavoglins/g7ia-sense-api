-- Deferred checks allow company, admin and credentials to be provisioned together.
-- Lock the company row to serialize concurrent membership changes.
CREATE FUNCTION enforce_company_admin(target_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE suffix text;
BEGIN
  SELECT username_suffix INTO suffix FROM companies WHERE id = target_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "user" WHERE company_id = target_id AND username = 'admin@' || suffix
  ) THEN
    RAISE EXCEPTION 'Company must have its system-created administrator' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "user" WHERE company_id = target_id AND split_part(username, '@', 2) <> suffix
  ) THEN
    RAISE EXCEPTION 'Username suffix must match the company' USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION check_company_admin_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM enforce_company_admin(NEW.id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION check_user_company_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM enforce_company_admin(OLD.company_id); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM enforce_company_admin(NEW.company_id); END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER company_requires_admin
AFTER INSERT OR UPDATE ON companies
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_company_admin_trigger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER user_preserves_company_admin
AFTER INSERT OR UPDATE OR DELETE ON "user"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_user_company_trigger();
--> statement-breakpoint
DO $$
DECLARE company_row record;
BEGIN
  FOR company_row IN SELECT id FROM companies LOOP
    PERFORM enforce_company_admin(company_row.id);
  END LOOP;
END;
$$;
