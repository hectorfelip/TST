-- 007: online booking (the public link) and what the calendar needs.
--
-- * booking_settings: one row per barbershop (link on/off, the address, opening hours, slot length).
-- * employees.takes_online_bookings: who can be chosen on the public page.
-- * comandas: where an appointment came from ('staff' or 'online'), whether an online one still waits for approval,
--   how long it lasts (to know when the barber is free again) and a hash of the visitor's address (to limit abuse).
-- * booking_shop_by_slug(): how the PUBLIC page finds a barbershop from the address (nobody is logged in there).

CREATE TABLE booking_settings (
  barbershop_id       uuid PRIMARY KEY REFERENCES barbershops (id),
  enabled             boolean NOT NULL DEFAULT false,
  -- The address: /agendar/<slug>. Lower case letters, digits and single dashes.
  slug                text CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 40),
  requires_approval   boolean NOT NULL DEFAULT false,
  -- Open days as bits: Sunday = 1, Monday = 2, Tuesday = 4 ... Saturday = 64. 126 = Monday to Saturday.
  open_days           smallint NOT NULL DEFAULT 126 CHECK (open_days BETWEEN 1 AND 127),
  open_minute         smallint NOT NULL DEFAULT 540 CHECK (open_minute BETWEEN 0 AND 1439),     -- 09:00
  close_minute        smallint NOT NULL DEFAULT 1140 CHECK (close_minute BETWEEN 1 AND 1440),   -- 19:00
  slot_minutes        smallint NOT NULL DEFAULT 30 CHECK (slot_minutes IN (10, 15, 20, 30, 45, 60)),
  min_notice_minutes  smallint NOT NULL DEFAULT 60 CHECK (min_notice_minutes BETWEEN 0 AND 1440),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (open_minute < close_minute),
  -- A link that is ON always has an address.
  CHECK (NOT enabled OR slug IS NOT NULL)
);
CREATE UNIQUE INDEX booking_settings_slug_key ON booking_settings (slug) WHERE slug IS NOT NULL;
ALTER TABLE booking_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON booking_settings
  USING (barbershop_id = app_barbershop_id()) WITH CHECK (barbershop_id = app_barbershop_id());

ALTER TABLE employees ADD COLUMN takes_online_bookings boolean NOT NULL DEFAULT true;
-- Owners are NOT offered by default (many only manage); the owner switches himself on in "Equipe" if he cuts hair too.
UPDATE employees SET takes_online_bookings = false WHERE role = 'owner';

ALTER TABLE comandas
  ADD COLUMN source              text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'online')),
  ADD COLUMN online_status       text CHECK (online_status IN ('pending', 'confirmed')),
  ADD COLUMN appointment_minutes smallint CHECK (appointment_minutes BETWEEN 5 AND 480),
  ADD COLUMN online_ip_hash      text CHECK (length(online_ip_hash) <= 64);
-- online <=> it has an approval status; only appointments can wait for approval; the address hash exists only for online ones.
ALTER TABLE comandas
  ADD CONSTRAINT comandas_online_consistency CHECK ((source = 'online') = (online_status IS NOT NULL)),
  ADD CONSTRAINT comandas_online_has_appointment CHECK (online_status IS NULL OR appointment_at IS NOT NULL),
  ADD CONSTRAINT comandas_ip_only_online CHECK (online_ip_hash IS NULL OR source = 'online');
CREATE INDEX comandas_online_ip_idx ON comandas (barbershop_id, online_ip_hash, created_at) WHERE online_ip_hash IS NOT NULL;
CREATE INDEX comandas_online_recent_idx ON comandas (barbershop_id, created_at) WHERE source = 'online';

-- The public page: from the address to the barbershop. Only barbershops with the link ON are found.
CREATE FUNCTION booking_shop_by_slug(p_slug text)
  RETURNS TABLE (barbershop_id uuid, name text, time_zone text, requires_approval boolean, open_days smallint,
                 open_minute smallint, close_minute smallint, slot_minutes smallint, min_notice_minutes smallint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT b.id, b.name, b.time_zone, s.requires_approval, s.open_days, s.open_minute, s.close_minute, s.slot_minutes, s.min_notice_minutes
    FROM booking_settings s JOIN barbershops b ON b.id = s.barbershop_id
    WHERE s.enabled AND s.slug = lower(btrim(p_slug))
  $$;

REVOKE ALL ON FUNCTION booking_shop_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking_shop_by_slug(text) TO app_user;
GRANT SELECT, INSERT, UPDATE ON booking_settings TO app_user;
