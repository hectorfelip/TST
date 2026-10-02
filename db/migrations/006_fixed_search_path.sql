-- 006: every function resolves names in the `public` schema only (Supabase's security advisor asks for it).
-- Without it, a function runs with the search_path of whoever calls it; with it, nobody can make it pick another table.
ALTER FUNCTION app_barbershop_id() SET search_path = public;
ALTER FUNCTION next_comanda_number() SET search_path = public;
ALTER FUNCTION forbid_modification() SET search_path = public;
ALTER FUNCTION check_time_zone() SET search_path = public;
ALTER FUNCTION ensure_active_owner() SET search_path = public;
