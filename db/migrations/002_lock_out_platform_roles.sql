-- 002: hosted PostgreSQL (Supabase) hardening.
--
-- Supabase creates the roles anon, authenticated and service_role and, by default, gives
-- them ALL rights on every new table, function and sequence of the `public` schema. Its
-- "Data API" (a ready-made web API) then exposes them to the internet.
-- This system does NOT use that API: the only door is the server, connected as app_user.
-- So everything those roles could reach by default is closed here.
--
-- Safe everywhere: if a role does not exist (plain PostgreSQL), it is skipped.
-- Run as the database OWNER, like every migration.

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      -- what already exists (tables, views, sequences, functions)
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      -- what future migrations will create (default privileges of the role running this file)
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- Functions are executable by everybody (PUBLIC) unless said otherwise, and anon/authenticated
-- inherit PUBLIC. Close that too; app_user keeps the explicit GRANT EXECUTE of migration 001.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
-- (Without "IN SCHEMA": a schema-level default can only ADD rights, it cannot remove the PUBLIC one.
-- It applies to the functions this role creates from now on, which is what we want.)
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
