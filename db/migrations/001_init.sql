-- 001_init.sql — database schema of the barbershop MVP (step 4).
--
-- The rules of step 3 are the first line of defence. This schema is the
-- second: it refuses states that the rules never produce, even if the code
-- has a bug. Main guarantees:
--   * every row belongs to ONE barbershop (barbershop_id) and Row Level
--     Security hides the other barbershops from the application role;
--   * rows can never point to a row of ANOTHER barbershop (composite foreign keys);
--   * money is an integer number of cents, never a decimal;
--   * history is append-only: movements and audit entries cannot be changed or deleted;
--   * nothing is deleted: people, services and products are deactivated;
--   * stock and cash are DERIVED from movements, never stored as totals.
--
-- Run as the database OWNER (not as app_user). The application connects as `app_user`.
--
-- CAUTION when writing CHECK constraints: PostgreSQL ACCEPTS a row when the
-- condition is NULL ("unknown"). `length(reason) >= 5` is NULL when reason is
-- NULL, so it would let an EMPTY reason through. Every CHECK below that
-- depends on a nullable column says explicitly what to do with NULL.

-- ---------------------------------------------------------------------------
-- Application role: no superuser, cannot bypass Row Level Security.
-- Production: set its password outside this file (ALTER ROLE app_user PASSWORD '...').
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- The barbershop of the current transaction. The application sets it with
--   SELECT set_config('app.barbershop_id', '<uuid>', true)
-- at the start of every transaction. Not set (or empty) = NULL = no row matches (fails closed).
CREATE FUNCTION app_barbershop_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.barbershop_id', true), '')::uuid $$;

-- History tables cannot be changed, even by the owner.
CREATE FUNCTION forbid_modification() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
END
$$;

-- ---------------------------------------------------------------------------
-- Barbershops (tenants) and their settings (R-SET-01)
-- ---------------------------------------------------------------------------
CREATE TABLE barbershops (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  away_after_days      integer NOT NULL DEFAULT 30 CHECK (away_after_days BETWEEN 7 AND 365),
  auto_cancel_pending  boolean NOT NULL DEFAULT true,
  pending_expiry_days  integer NOT NULL DEFAULT 5 CHECK (pending_expiry_days BETWEEN 1 AND 30),
  time_zone            text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION check_time_zone() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.time_zone) THEN
    RAISE EXCEPTION 'unknown time zone: %', NEW.time_zone USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER barbershops_time_zone BEFORE INSERT OR UPDATE OF time_zone ON barbershops
  FOR EACH ROW EXECUTE FUNCTION check_time_zone();

-- ---------------------------------------------------------------------------
-- Team (R-EMP-01..03). Nobody is deleted: people are deactivated.
-- ---------------------------------------------------------------------------
CREATE TABLE employees (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id  uuid NOT NULL REFERENCES barbershops (id),
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 60),
  -- The e-mail is the login: stored in lower case, unique in the WHOLE system.
  email          text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  role           text NOT NULL CHECK (role IN ('owner', 'barber')),
  active         boolean NOT NULL DEFAULT true,
  -- Link to the authentication provider (step 5). Passwords never live in this database.
  auth_user_id   text UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbershop_id, id)
);
CREATE UNIQUE INDEX employees_email_key ON employees (email);

-- R-EMP-02: a barbershop always keeps at least one active owner. Checked when
-- the transaction commits, so a transaction can swap owners.
CREATE FUNCTION ensure_active_owner() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM employees WHERE barbershop_id = NEW.barbershop_id AND role = 'owner' AND active) THEN
    RAISE EXCEPTION 'barbershop % must keep at least one active owner', NEW.barbershop_id USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER employees_keep_owner AFTER INSERT OR UPDATE OF role, active ON employees
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_active_owner();

-- ---------------------------------------------------------------------------
-- Services catalog (R-SRV-01..03)
-- ---------------------------------------------------------------------------
CREATE TABLE services (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id     uuid NOT NULL REFERENCES barbershops (id),
  name              text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 60),
  price_cents       integer NOT NULL CHECK (price_cents > 0),
  duration_minutes  integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  favorite          boolean NOT NULL DEFAULT false,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbershop_id, id),
  CHECK (NOT favorite OR active) -- a deactivated service leaves the favorites
);

-- ---------------------------------------------------------------------------
-- Products (R-STK-01). The quantity in stock is NOT a column: see product_stock.
-- ---------------------------------------------------------------------------
CREATE TABLE products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id     uuid NOT NULL REFERENCES barbershops (id),
  name              text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  use               text NOT NULL CHECK (use IN ('sale', 'internal')),
  sale_price_cents  integer,
  min_stock         integer NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbershop_id, id),
  CHECK ((use = 'sale' AND sale_price_cents IS NOT NULL AND sale_price_cents > 0)
      OR (use = 'internal' AND sale_price_cents IS NULL))
);

-- ---------------------------------------------------------------------------
-- Clients (R-CLI-01..04). LGPD: personal data is erased, the row stays.
-- ---------------------------------------------------------------------------
CREATE TABLE clients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id  uuid NOT NULL REFERENCES barbershops (id),
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  -- Digits only: DDD + 8 digits (landline) or DDD + 9 + 8 digits (mobile).
  phone          text CHECK (phone ~ '^[1-9][1-9]([2-8][0-9]{7}|9[0-9]{8})$'),
  notes          text CHECK (length(notes) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now(),
  anonymized_at  timestamptz,
  UNIQUE (barbershop_id, id),
  CHECK (anonymized_at IS NULL OR (phone IS NULL AND notes IS NULL AND name = 'Cliente removido'))
);
-- R-CLI-02: the same phone cannot belong to two clients of the same barbershop.
CREATE UNIQUE INDEX clients_phone_key ON clients (barbershop_id, phone) WHERE phone IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Cash registers (R-CSH-01..08)
-- ---------------------------------------------------------------------------
CREATE TABLE cash_registers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id       uuid NOT NULL REFERENCES barbershops (id),
  status              text NOT NULL CHECK (status IN ('open', 'closed')),
  opened_at           timestamptz NOT NULL,
  opened_by           uuid NOT NULL,
  opening_cash_cents  integer NOT NULL CHECK (opening_cash_cents >= 0),
  -- Why the opening cash differed from what was left yesterday (R-CSH-07).
  opening_reason      text,
  closed_at           timestamptz,
  closed_by           uuid,
  counted_cash_cents  integer CHECK (counted_cash_cents >= 0),
  -- counted - expected. Positive = extra money, negative = missing money.
  difference_cents    integer,
  difference_reason   text,
  -- Cash that stays in the drawer for the next day.
  left_in_drawer_cents integer CHECK (left_in_drawer_cents >= 0),
  UNIQUE (barbershop_id, id),
  FOREIGN KEY (barbershop_id, opened_by) REFERENCES employees (barbershop_id, id),
  FOREIGN KEY (barbershop_id, closed_by) REFERENCES employees (barbershop_id, id),
  CHECK (
    (status = 'open' AND closed_at IS NULL AND closed_by IS NULL AND counted_cash_cents IS NULL
       AND difference_cents IS NULL AND left_in_drawer_cents IS NULL)
    OR
    (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND counted_cash_cents IS NOT NULL
       AND difference_cents IS NOT NULL AND left_in_drawer_cents IS NOT NULL
       AND left_in_drawer_cents <= counted_cash_cents)
  ),
  -- A difference always has a reason (R-CSH-05). A different opening amount too (R-CSH-07).
  CHECK (difference_cents IS NULL OR difference_cents = 0 OR COALESCE(length(btrim(difference_reason)), 0) >= 5),
  CHECK (opening_reason IS NULL OR length(btrim(opening_reason)) >= 5)
);
-- R-CSH-01: only ONE open register per barbershop.
CREATE UNIQUE INDEX one_open_register_per_shop ON cash_registers (barbershop_id) WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- Comandas (R-CMD-01..22)
-- ---------------------------------------------------------------------------
CREATE TABLE comandas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id         uuid NOT NULL REFERENCES barbershops (id),
  -- Sequential per barbershop, with no gaps and no duplicates (next_comanda_number).
  number                integer NOT NULL CHECK (number > 0),
  client_id             uuid,
  opened_by             uuid NOT NULL,
  opened_at             timestamptz NOT NULL,
  status                text NOT NULL CHECK (status IN ('open', 'closed', 'cancelled', 'discarded', 'no_show')),

  discount_cents        integer,
  discount_given_by     uuid,
  discount_at           timestamptz,

  payment_method        text CHECK (payment_method IN ('cash', 'pix', 'debit', 'credit')),
  payment_total_cents   integer CHECK (payment_total_cents >= 0),
  payment_received_cash_cents integer,
  payment_change_cents  integer CHECK (payment_change_cents >= 0),
  payment_register_id   uuid,

  note                  text CHECK (length(note) <= 280),

  appointment_at        timestamptz,
  appointment_barber_id uuid,
  pending_since         timestamptz,
  no_show_by            uuid,
  no_show_at            timestamptz,

  closed_at             timestamptz,
  closed_by             uuid,
  cancellation_reason   text CHECK (length(btrim(cancellation_reason)) >= 5),
  -- An employee id, or the word 'system' when the comanda expired by itself (R-CMD-22).
  cancellation_by       text,
  cancellation_at       timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (barbershop_id, number),
  UNIQUE (barbershop_id, id),
  FOREIGN KEY (barbershop_id, client_id)             REFERENCES clients (barbershop_id, id),
  FOREIGN KEY (barbershop_id, opened_by)             REFERENCES employees (barbershop_id, id),
  FOREIGN KEY (barbershop_id, discount_given_by)     REFERENCES employees (barbershop_id, id),
  FOREIGN KEY (barbershop_id, appointment_barber_id) REFERENCES employees (barbershop_id, id),
  FOREIGN KEY (barbershop_id, no_show_by)            REFERENCES employees (barbershop_id, id),
  FOREIGN KEY (barbershop_id, closed_by)             REFERENCES employees (barbershop_id, id),
  FOREIGN KEY (barbershop_id, payment_register_id)   REFERENCES cash_registers (barbershop_id, id),

  -- Which fields each state must (or must not) have.
  CHECK (
    (status = 'open' AND closed_at IS NULL AND payment_method IS NULL AND cancellation_reason IS NULL AND no_show_at IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND payment_method IS NOT NULL
        AND payment_total_cents IS NOT NULL AND payment_register_id IS NOT NULL
        AND cancellation_reason IS NULL AND no_show_at IS NULL)
    -- A cancelled comanda may or may not have been paid before (a paid one keeps its payment as history).
    OR (status = 'cancelled' AND cancellation_reason IS NOT NULL AND cancellation_by IS NOT NULL
        AND cancellation_at IS NOT NULL AND no_show_at IS NULL)
    OR (status = 'discarded' AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND payment_method IS NULL
        AND cancellation_reason IS NULL AND no_show_at IS NULL)
    OR (status = 'no_show' AND no_show_at IS NOT NULL AND no_show_by IS NOT NULL AND appointment_at IS NOT NULL
        AND payment_method IS NULL AND cancellation_reason IS NULL)
  ),
  CHECK ((discount_cents IS NULL AND discount_given_by IS NULL AND discount_at IS NULL)
      OR (discount_cents IS NOT NULL AND discount_cents > 0 AND discount_given_by IS NOT NULL AND discount_at IS NOT NULL)),
  CHECK ((appointment_at IS NULL) = (appointment_barber_id IS NULL)),
  CHECK (appointment_at IS NULL OR client_id IS NOT NULL),        -- R-CMD-20: an appointment needs a client
  CHECK (pending_since IS NULL OR status = 'open'),
  -- Cash received: only for cash, covering the total; the change is exactly the difference.
  CHECK ((payment_received_cash_cents IS NULL AND payment_change_cents IS NULL)
      OR (payment_received_cash_cents IS NOT NULL AND payment_change_cents IS NOT NULL
          AND payment_method IS NOT NULL AND payment_method = 'cash'
          AND payment_total_cents IS NOT NULL
          AND payment_received_cash_cents >= payment_total_cents
          AND payment_change_cents = payment_received_cash_cents - payment_total_cents))
);
CREATE INDEX comandas_status_idx ON comandas (barbershop_id, status);
CREATE INDEX comandas_client_idx ON comandas (barbershop_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX comandas_agenda_idx ON comandas (barbershop_id, appointment_at) WHERE appointment_at IS NOT NULL;

-- Items. A removed item is kept (removed_at / removed_by), never deleted (R-CMD-21).
CREATE TABLE comanda_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                   bigint GENERATED ALWAYS AS IDENTITY,  -- keeps the order in which items were added
  barbershop_id         uuid NOT NULL REFERENCES barbershops (id),
  comanda_id            uuid NOT NULL,
  kind                  text NOT NULL CHECK (kind IN ('service', 'product')),
  service_id            uuid,
  product_id            uuid,
  -- Snapshot of the name and price at the moment the item was added (R-CMD-05).
  name                  text NOT NULL CHECK (length(btrim(name)) > 0),
  unit_price_cents      integer NOT NULL CHECK (unit_price_cents > 0),
  quantity              integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  barber_id             uuid NOT NULL,
  added_by              uuid NOT NULL,
  added_at              timestamptz NOT NULL,
  -- R-STK-04: the person confirmed having the product in hand although the system stock was lower.
  sold_without_stock_by uuid,
  sold_without_stock_at timestamptz,
  removed_by            uuid,
  removed_at            timestamptz,
  UNIQUE (barbershop_id, id),
  FOREIGN KEY (barbershop_id, comanda_id)            REFERENCES comandas (barbershop_id, id),
  FOREIGN KEY (barbershop_id, service_id)            REFERENCES services (barbershop_id, id),
  FOREIGN KEY (barbershop_id, product_id)            REFERENCES products (barbershop_id, id),
  FOREIGN KEY (barbershop_id, barber_id)             REFERENCES employees (barbershop_id, id),
  FOREIGN KEY (barbershop_id, added_by)              REFERENCES employees (barbershop_id, id),
  FOREIGN KEY (barbershop_id, sold_without_stock_by) REFERENCES employees (barbershop_id, id),
  FOREIGN KEY (barbershop_id, removed_by)            REFERENCES employees (barbershop_id, id),
  CHECK ((kind = 'service' AND service_id IS NOT NULL AND product_id IS NULL AND sold_without_stock_by IS NULL)
      OR (kind = 'product' AND product_id IS NOT NULL AND service_id IS NULL)),
  CHECK ((sold_without_stock_by IS NULL) = (sold_without_stock_at IS NULL)),
  CHECK ((removed_by IS NULL) = (removed_at IS NULL))
);
CREATE INDEX comanda_items_comanda_idx ON comanda_items (barbershop_id, comanda_id, seq);

-- Comanda numbers: one counter per barbershop. Two barbers opening a comanda
-- at the same second wait for each other on the counter row, so numbers never
-- repeat. If the transaction fails, the number is given back (no gaps).
CREATE TABLE comanda_counters (
  barbershop_id  uuid PRIMARY KEY REFERENCES barbershops (id),
  last_number    integer NOT NULL CHECK (last_number >= 0)
);

CREATE FUNCTION next_comanda_number() RETURNS integer
  LANGUAGE sql
  AS $$
    INSERT INTO comanda_counters AS c (barbershop_id, last_number)
    VALUES (app_barbershop_id(), 1)
    ON CONFLICT (barbershop_id) DO UPDATE SET last_number = c.last_number + 1
    RETURNING last_number
  $$;

-- ---------------------------------------------------------------------------
-- Stock movements: append-only history. The quantity in stock is the SUM.
-- ---------------------------------------------------------------------------
CREATE TABLE stock_movements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id  uuid NOT NULL REFERENCES barbershops (id),
  product_id     uuid NOT NULL,
  type           text NOT NULL CHECK (type IN ('purchase', 'sale', 'sale_reversal', 'adjustment', 'internal_use', 'loss')),
  quantity       integer NOT NULL CHECK (quantity <> 0),  -- positive = in, negative = out
  at             timestamptz NOT NULL,
  user_id        uuid NOT NULL,
  comanda_id     uuid,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (barbershop_id, product_id) REFERENCES products (barbershop_id, id),
  FOREIGN KEY (barbershop_id, user_id)    REFERENCES employees (barbershop_id, id),
  FOREIGN KEY (barbershop_id, comanda_id) REFERENCES comandas (barbershop_id, id),
  CHECK ((type = 'purchase' AND quantity > 0) OR (type = 'sale' AND quantity < 0)
      OR (type = 'sale_reversal' AND quantity > 0) OR (type IN ('internal_use', 'loss') AND quantity < 0)
      OR type = 'adjustment'),
  CHECK (type NOT IN ('internal_use', 'loss', 'adjustment') OR COALESCE(length(btrim(reason)), 0) >= 5),  -- R-STK-05/06
  CHECK ((type IN ('sale', 'sale_reversal')) = (comanda_id IS NOT NULL))
);
CREATE INDEX stock_movements_product_idx ON stock_movements (barbershop_id, product_id);
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();
CREATE TRIGGER stock_movements_no_truncate BEFORE TRUNCATE ON stock_movements
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

-- R-STK-02: quantity in stock = sum of the movements. It runs with the rights
-- of the caller, so Row Level Security applies to it too.
CREATE VIEW product_stock WITH (security_invoker = true) AS
  SELECT p.barbershop_id, p.id AS product_id, COALESCE(SUM(m.quantity), 0)::integer AS stock
  FROM products p
  LEFT JOIN stock_movements m ON m.barbershop_id = p.barbershop_id AND m.product_id = p.id
  GROUP BY p.barbershop_id, p.id;

-- ---------------------------------------------------------------------------
-- Cash movements: append-only history. Cash in the drawer = SUM of method 'cash' (R-CSH-02).
-- ---------------------------------------------------------------------------
CREATE TABLE cash_movements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id  uuid NOT NULL REFERENCES barbershops (id),
  register_id    uuid NOT NULL,
  type           text NOT NULL CHECK (type IN ('opening', 'sale', 'sale_reversal', 'payment_correction', 'expense', 'withdrawal')),
  method         text NOT NULL CHECK (method IN ('cash', 'pix', 'debit', 'credit')),
  amount_cents   integer NOT NULL,                          -- positive = money in, negative = money out
  description    text NOT NULL CHECK (length(btrim(description)) > 0),
  comanda_id     uuid,
  user_id        uuid NOT NULL,
  at             timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (barbershop_id, register_id) REFERENCES cash_registers (barbershop_id, id),
  FOREIGN KEY (barbershop_id, comanda_id)  REFERENCES comandas (barbershop_id, id),
  FOREIGN KEY (barbershop_id, user_id)     REFERENCES employees (barbershop_id, id),
  CHECK (amount_cents <> 0 OR type = 'opening'),
  CHECK ((type = 'opening' AND method = 'cash' AND amount_cents >= 0)
      OR (type = 'sale' AND amount_cents > 0)
      OR (type = 'sale_reversal' AND amount_cents < 0)
      OR type = 'payment_correction'
      OR (type = 'expense' AND amount_cents < 0)
      OR (type = 'withdrawal' AND method = 'cash' AND amount_cents < 0)),
  CHECK ((type IN ('sale', 'sale_reversal', 'payment_correction')) = (comanda_id IS NOT NULL))
);
CREATE INDEX cash_movements_register_idx ON cash_movements (barbershop_id, register_id);
CREATE TRIGGER cash_movements_append_only BEFORE UPDATE OR DELETE ON cash_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();
CREATE TRIGGER cash_movements_no_truncate BEFORE TRUNCATE ON cash_movements
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

-- ---------------------------------------------------------------------------
-- Audit log (section 6 of the rules): append-only.
-- user_id is text because it can be the word 'system'; it has no foreign key
-- on purpose, so the trail survives whatever happens to the person.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barbershop_id  uuid NOT NULL REFERENCES barbershops (id),
  action         text NOT NULL CHECK (length(action) > 0),
  user_id        text NOT NULL,
  at             timestamptz NOT NULL,
  entity_id      text NOT NULL,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_shop_idx ON audit_log (barbershop_id, at DESC);
CREATE INDEX audit_log_action_idx ON audit_log (barbershop_id, action, at DESC);
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

-- ---------------------------------------------------------------------------
-- Row Level Security: the application only sees the rows of its barbershop.
-- (The owner of the tables, used by migrations and admin scripts, is not
-- subject to it. The app must NEVER connect as the owner: see assertSafeAppRole.)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employees', 'services', 'products', 'clients', 'cash_registers', 'comandas',
                           'comanda_items', 'comanda_counters', 'stock_movements', 'cash_movements', 'audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (barbershop_id = app_barbershop_id()) WITH CHECK (barbershop_id = app_barbershop_id())',
      t);
  END LOOP;
END
$$;
ALTER TABLE barbershops ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON barbershops USING (id = app_barbershop_id()) WITH CHECK (id = app_barbershop_id());

-- ---------------------------------------------------------------------------
-- Functions that must look ACROSS barbershops (the person is not logged in yet).
-- They return the minimum and run with the rights of the owner.
-- ---------------------------------------------------------------------------
-- Login: which barbershop and which role does this e-mail belong to?
CREATE FUNCTION auth_lookup(p_email text)
  RETURNS TABLE (employee_id uuid, barbershop_id uuid, role text, active boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT e.id, e.barbershop_id, e.role, e.active FROM employees e WHERE e.email = lower(btrim(p_email)) $$;

-- Is this e-mail already used by anyone (R-EMP-01)? Says yes/no, nothing more.
CREATE FUNCTION email_taken(p_email text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM employees WHERE email = lower(btrim(p_email))) $$;

REVOKE ALL ON FUNCTION auth_lookup(text), email_taken(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Rights of the application role. Nothing can be DELETEd by the app.
-- History tables only accept INSERT and SELECT.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, UPDATE ON barbershops TO app_user;
GRANT SELECT, INSERT, UPDATE ON employees, services, products, clients, cash_registers, comandas, comanda_items, comanda_counters TO app_user;
GRANT SELECT, INSERT ON stock_movements, cash_movements, audit_log TO app_user;
GRANT SELECT ON product_stock TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT EXECUTE ON FUNCTION app_barbershop_id(), next_comanda_number(), auth_lookup(text), email_taken(text) TO app_user;
