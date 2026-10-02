import type { BarbershopSettings } from "@/modules/barbershops/rules/settings";
import { can, requirePermission } from "@/modules/auth/rules/permissions";
import type { AuditEntry } from "@/shared/audit";
import type { Cents } from "@/shared/money";
import { fail, ok, type Result } from "@/shared/result";
import { assertSameTenant, type TenantContext } from "@/shared/tenant";

export type Client = {
  id: string;
  barbershopId: string;
  name: string;
  /** Digits only, e.g. "11988881111". Optional so registration is fast. */
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  /** Set when the client's personal data was erased (LGPD). */
  anonymizedAt: Date | null;
};

export type ClientInput = { name: string; phone: string; notes: string };

/** One past visit, as the comandas module reports it. */
export type ClientVisit = { comandaId: string; at: Date; barberId: string; description: string; amount: Cents };

export const ANONYMIZED_NAME = "Cliente removido";
const MAX_NOTES = 500;

/** Brazilian phone: DDD + 8 digits (landline) or DDD + 9 + 8 digits (mobile). */
export function normalizePhone(raw: string): Result<string | null> {
  const digits = raw.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (digits === "") return ok(null);
  const valid = (digits.length === 10 && /^[1-9]{2}[2-8]/.test(digits)) || (digits.length === 11 && /^[1-9]{2}9/.test(digits));
  return valid ? ok(digits) : fail("INVALID_INPUT", "Telefone inválido. Use DDD + número, ex.: (11) 98888-1111.");
}

/** "11988881111" -> "(11) 98888-1111". Anything unexpected is shown as it is. */
export function formatPhone(digits: string | null): string {
  if (!digits) return "";
  const m = /^(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : digits;
}

function validate(input: ClientInput): Result<{ name: string; phone: string | null; notes: string | null }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return fail("INVALID_INPUT", "Nome deve ter de 2 a 80 caracteres.");
  const phone = normalizePhone(input.phone);
  if (!phone.ok) return phone;
  const notes = input.notes.trim();
  if (notes.length > MAX_NOTES) return fail("INVALID_INPUT", `Observações devem ter no máximo ${MAX_NOTES} caracteres.`);
  return ok({ name, phone: phone.value, notes: notes === "" ? null : notes });
}

/**
 * R-CLI-01: owner and barbers can register a client (fast registration at the chair).
 * R-CLI-02: the same phone cannot belong to two clients of the same barbershop.
 * The data layer passes `phoneOwner` = the client that already has this phone, if any.
 */
export function createClient(
  ctx: TenantContext,
  input: ClientInput & { id: string; at: Date },
  phoneOwner: Client | null,
): Result<Client> {
  const allowed = requirePermission(ctx, "client.create");
  if (!allowed.ok) return allowed;
  const valid = validate(input);
  if (!valid.ok) return valid;
  if (valid.value.phone && phoneOwner && phoneOwner.barbershopId === ctx.barbershopId) {
    return fail("NOT_ALLOWED", "Já existe um cliente com este telefone.");
  }
  return ok({ id: input.id, barbershopId: ctx.barbershopId, createdAt: input.at, anonymizedAt: null, ...valid.value });
}

/** R-CLI-03: only the owner edits clients. */
export function updateClient(ctx: TenantContext, client: Client, input: ClientInput, phoneOwner: Client | null): Result<Client> {
  const allowed = requirePermission(ctx, "client.edit");
  if (!allowed.ok) return allowed;
  const tenant = assertSameTenant(ctx, client);
  if (!tenant.ok) return tenant;
  if (client.anonymizedAt) return fail("INVALID_STATE", "Este cliente foi removido.");
  const valid = validate(input);
  if (!valid.ok) return valid;
  if (valid.value.phone && phoneOwner && phoneOwner.id !== client.id && phoneOwner.barbershopId === ctx.barbershopId) {
    return fail("NOT_ALLOWED", "Já existe um cliente com este telefone.");
  }
  return ok({ ...client, ...valid.value });
}

/**
 * R-CLI-04 (LGPD): on request, the owner erases the client's personal data.
 * Name, phone and notes are erased; comandas and money history stay (with no
 * personal data) because the shop needs them for its accounts. Audited.
 */
export function anonymizeClient(ctx: TenantContext, client: Client, at: Date): Result<{ client: Client; audit: AuditEntry }> {
  const allowed = requirePermission(ctx, "client.anonymize");
  if (!allowed.ok) return allowed;
  const tenant = assertSameTenant(ctx, client);
  if (!tenant.ok) return tenant;
  if (client.anonymizedAt) return fail("INVALID_STATE", "Os dados deste cliente já foram removidos.");
  return ok({
    client: { ...client, name: ANONYMIZED_NAME, phone: null, notes: null, anonymizedAt: at },
    audit: { barbershopId: ctx.barbershopId, action: "client.anonymized", userId: ctx.userId, at, entityId: client.id, details: {} },
  });
}

export type ClientView = {
  id: string;
  name: string;
  /** null when the user may not see it (barbers) or when there is none. */
  phone: string | null;
  notes: string | null;
  visits: ClientVisit[];
  lastVisitAt: Date | null;
  /** Times the client booked and did not show up (any role can see it). */
  noShowCount: number;
};

/**
 * R-CLI-05 (decision B, step 2): the client base is shared, but a barber
 * sees only the name, the notes and HIS OWN visits — no phone number and no
 * visits with other barbers. The owner sees everything.
 */
export function clientViewFor(
  ctx: TenantContext,
  client: Client,
  visits: readonly ClientVisit[],
  noShowCount: number,
): Result<ClientView> {
  const tenant = assertSameTenant(ctx, client);
  if (!tenant.ok) return tenant;
  const visible = can(ctx.role, "client.view_full_history") ? [...visits] : visits.filter((v) => v.barberId === ctx.userId);
  const lastVisitAt = visits.reduce<Date | null>((latest, v) => (!latest || v.at > latest ? v.at : latest), null);
  return ok({
    id: client.id,
    name: client.name,
    phone: can(ctx.role, "client.view_phone") ? client.phone : null,
    notes: client.notes,
    visits: visible.sort((a, b) => b.at.getTime() - a.at.getTime()),
    lastVisitAt,
    noShowCount,
  });
}

/** Search by name, or by phone digits. Barbers can search by phone but never see it. */
export function matchesSearch(client: Pick<Client, "name" | "phone" | "anonymizedAt">, term: string): boolean {
  if (client.anonymizedAt) return false;
  const text = term.trim().toLowerCase();
  if (text === "") return true;
  const digits = text.replace(/\D/g, "");
  return client.name.toLowerCase().includes(text) || (digits.length >= 4 && (client.phone ?? "").includes(digits));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * R-CLI-06: a client is "Sumido" (away) when the last visit was more than
 * `awayAfterDays` days ago (a setting per barbershop). A client with no
 * visit yet is new, not away.
 */
export function isAway(lastVisitAt: Date | null, now: Date, settings: Pick<BarbershopSettings, "awayAfterDays">): boolean {
  if (!lastVisitAt) return false;
  return (now.getTime() - lastVisitAt.getTime()) / DAY_MS > settings.awayAfterDays;
}
