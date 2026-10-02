-- 004: a password given by SOMEONE ELSE (the owner, the admin) is temporary: its owner must change it
-- at the first login. A password a person chose for themselves is not.

ALTER TABLE employee_credentials ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

-- The session lookup also says whether the password is still temporary (a column was added: recreate it).
DROP FUNCTION session_lookup(uuid);
CREATE FUNCTION session_lookup(p_employee uuid)
  RETURNS TABLE (barbershop_id uuid, name text, role text, active boolean, password_changed_at timestamptz, must_change_password boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT e.barbershop_id, e.name, e.role, e.active, c.password_changed_at, c.must_change_password
    FROM employees e JOIN employee_credentials c ON c.employee_id = e.id
    WHERE e.id = p_employee
  $$;

-- set_password now says if the new password is temporary.
DROP FUNCTION set_password(uuid, text, timestamptz);
CREATE FUNCTION set_password(p_employee uuid, p_hash text, p_at timestamptz, p_temporary boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM employees WHERE id = p_employee AND barbershop_id = app_barbershop_id()) THEN
    RAISE EXCEPTION 'employee not found in this barbershop' USING ERRCODE = '42501';
  END IF;
  INSERT INTO employee_credentials (employee_id, barbershop_id, password_hash, password_changed_at, must_change_password)
  VALUES (p_employee, app_barbershop_id(), p_hash, p_at, p_temporary)
  ON CONFLICT (employee_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash, password_changed_at = EXCLUDED.password_changed_at,
        must_change_password = EXCLUDED.must_change_password, failed_attempts = 0, locked_until = NULL;
END
$$;

REVOKE ALL ON FUNCTION session_lookup(uuid), set_password(uuid, text, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION session_lookup(uuid), set_password(uuid, text, timestamptz, boolean) TO app_user;
