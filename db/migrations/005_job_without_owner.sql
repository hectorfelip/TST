-- 005: the daily job without the owner connection.
-- The scheduled job must look at EVERY barbershop, which Row Level Security forbids to the application role. Instead of giving
-- the online app the owner's password (a very powerful secret on a public server), two tiny functions do exactly what the job needs.

-- The ids of all barbershops (unguessable UUIDs; no names, no data).
CREATE FUNCTION list_barbershop_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM barbershops ORDER BY created_at $$;

-- Forgets idempotency keys older than a moment; says how many.
CREATE FUNCTION forget_old_idempotency_keys(p_before timestamptz) RETURNS integer
  LANGUAGE sql SECURITY DEFINER SET search_path = public
  AS $$ WITH gone AS (DELETE FROM idempotency_keys WHERE created_at < p_before RETURNING 1) SELECT count(*)::int FROM gone $$;

REVOKE ALL ON FUNCTION list_barbershop_ids(), forget_old_idempotency_keys(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_barbershop_ids(), forget_old_idempotency_keys(timestamptz) TO app_user;
