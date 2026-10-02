-- 003: login (passwords) and idempotency keys. Step 5 (Communication).
--
-- Passwords: each person has one password, stored ONLY as a salted hash made by the server
-- (scrypt). The application role has NO right on the credentials table: it can only call the
-- small functions below, so a bug (or an injection) in a normal query can never read a hash.
-- Brute force: 5 wrong passwords lock that person for 15 minutes.

CREATE TABLE employee_credentials (
  employee_id          uuid PRIMARY KEY,
  barbershop_id        uuid NOT NULL,
  password_hash        text NOT NULL CHECK (length(password_hash) BETWEEN 20 AND 400),
  -- A session created before this moment is refused (a new password logs everybody out).
  password_changed_at  timestamptz NOT NULL DEFAULT now(),
  failed_attempts      integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until         timestamptz,
  FOREIGN KEY (barbershop_id, employee_id) REFERENCES employees (barbershop_id, id)
);
ALTER TABLE employee_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employee_credentials
  USING (barbershop_id = app_barbershop_id()) WITH CHECK (barbershop_id = app_barbershop_id());

-- ---------------------------------------------------------------------------
-- Login. The person is not identified yet, so these look ACROSS barbershops, return the
-- minimum, and run with the rights of the owner (like auth_lookup in migration 001).
-- ---------------------------------------------------------------------------
CREATE FUNCTION login_lookup(p_email text)
  RETURNS TABLE (employee_id uuid, barbershop_id uuid, role text, active boolean, password_hash text, locked_until timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT e.id, e.barbershop_id, e.role, e.active, c.password_hash, c.locked_until
    FROM employees e LEFT JOIN employee_credentials c ON c.employee_id = e.id
    WHERE e.email = lower(btrim(p_email))
  $$;

-- A wrong password. After 5 in a row the person is locked for 15 minutes. When a lock has
-- already expired, counting starts again from 1 (otherwise every later mistake would lock again).
CREATE FUNCTION login_failed(p_employee uuid, p_now timestamptz) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public
  AS $$
    UPDATE employee_credentials SET
      failed_attempts = CASE WHEN locked_until IS NOT NULL AND locked_until <= p_now THEN 1 ELSE failed_attempts + 1 END,
      locked_until = CASE
        WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= p_now THEN 1 ELSE failed_attempts + 1 END) >= 5
          THEN p_now + interval '15 minutes'
        WHEN locked_until IS NOT NULL AND locked_until <= p_now THEN NULL
        ELSE locked_until
      END
    WHERE employee_id = p_employee
  $$;

CREATE FUNCTION login_succeeded(p_employee uuid) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public
  AS $$ UPDATE employee_credentials SET failed_attempts = 0, locked_until = NULL WHERE employee_id = p_employee $$;

-- Every request: who is this session really (role and "active" are read NOW, never trusted from the cookie).
CREATE FUNCTION session_lookup(p_employee uuid)
  RETURNS TABLE (barbershop_id uuid, name text, role text, active boolean, password_changed_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT e.barbershop_id, e.name, e.role, e.active, c.password_changed_at
    FROM employees e JOIN employee_credentials c ON c.employee_id = e.id
    WHERE e.id = p_employee
  $$;

-- ---------------------------------------------------------------------------
-- Changing passwords (inside a barbershop transaction: app.barbershop_id / app.user_id are set).
-- ---------------------------------------------------------------------------
-- Only for an employee of the CURRENT barbershop. WHO may do it (the owner for anybody, a person
-- for himself) is decided by the rules in the application.
CREATE FUNCTION set_password(p_employee uuid, p_hash text, p_at timestamptz) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM employees WHERE id = p_employee AND barbershop_id = app_barbershop_id()) THEN
    RAISE EXCEPTION 'employee not found in this barbershop' USING ERRCODE = '42501';
  END IF;
  INSERT INTO employee_credentials (employee_id, barbershop_id, password_hash, password_changed_at)
  VALUES (p_employee, app_barbershop_id(), p_hash, p_at)
  ON CONFLICT (employee_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash, password_changed_at = EXCLUDED.password_changed_at,
        failed_attempts = 0, locked_until = NULL;
END
$$;

-- The hash of the person who is acting now (to check the current password before changing it).
CREATE FUNCTION own_password_hash() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT password_hash FROM employee_credentials
    WHERE employee_id = NULLIF(current_setting('app.user_id', true), '')::uuid AND barbershop_id = app_barbershop_id()
  $$;

-- ---------------------------------------------------------------------------
-- Idempotency: the same request sent twice (a double tap, a connection that dropped and was
-- retried) must have its effect ONCE. The key is saved in the same transaction as the effect.
-- ---------------------------------------------------------------------------
CREATE TABLE idempotency_keys (
  barbershop_id  uuid NOT NULL REFERENCES barbershops (id),
  key            text NOT NULL CHECK (length(key) BETWEEN 8 AND 100),
  action         text NOT NULL CHECK (length(action) > 0),
  result         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (barbershop_id, key)
);
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON idempotency_keys
  USING (barbershop_id = app_barbershop_id()) WITH CHECK (barbershop_id = app_barbershop_id());

-- ---------------------------------------------------------------------------
-- Rights. NOTHING on employee_credentials: only the functions above.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION login_lookup(text), login_failed(uuid, timestamptz), login_succeeded(uuid), session_lookup(uuid),
  set_password(uuid, text, timestamptz), own_password_hash() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_lookup(text), login_failed(uuid, timestamptz), login_succeeded(uuid), session_lookup(uuid),
  set_password(uuid, text, timestamptz), own_password_hash() TO app_user;
GRANT SELECT, INSERT ON idempotency_keys TO app_user;
