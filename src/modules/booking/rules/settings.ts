/**
 * The online booking link of a barbershop: on/off, its address, who approves, and when the shop is open.
 * Same pattern as the other settings: each barbershop chooses its own way (owner only, audited).
 */
import { requirePermission } from "@/modules/auth/rules/permissions";
import type { AuditEntry } from "@/shared/audit";
import { fail, ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { formatMinutes } from "@/shared/time";

export type BookingSettings = {
  enabled: boolean;
  /** The address: /agendar/<slug>. null until the owner chooses one. */
  slug: string | null;
  /** true = every online booking waits for the barbershop to approve it. */
  requiresApproval: boolean;
  /** Bits: Sunday = 1, Monday = 2 ... Saturday = 64. */
  openDays: number;
  openMinute: number;
  closeMinute: number;
  slotMinutes: number;
  /** The earliest a client can book: this many minutes from now. */
  minNoticeMinutes: number;
};

export const SLOT_OPTIONS = [10, 15, 20, 30, 45, 60] as const;
export const MONDAY_TO_SATURDAY = 0b1111110;

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  enabled: false,
  slug: null,
  requiresApproval: false,
  openDays: MONDAY_TO_SATURDAY,
  openMinute: 9 * 60,
  closeMinute: 19 * 60,
  slotMinutes: 30,
  minNoticeMinutes: 60,
};

export const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

/** Is the barbershop open on this weekday (0 = Sunday)? */
export function isOpenOn(openDays: number, weekday: number): boolean {
  return (openDays & (1 << weekday)) !== 0;
}

export function maskFromDays(days: readonly number[]): number {
  return days.reduce((mask, d) => (Number.isInteger(d) && d >= 0 && d <= 6 ? mask | (1 << d) : mask), 0);
}

export function daysFromMask(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => isOpenOn(mask, d));
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Barbearia do Zé!" -> "barbearia-do-ze". */
export function suggestSlug(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : `barbearia-${base}`.replace(/-+$/g, "");
}

export function validateSlug(raw: string): Result<string> {
  const slug = raw.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 40) return fail("INVALID_INPUT", "O endereço deve ter de 3 a 40 caracteres.");
  if (!SLUG.test(slug)) return fail("INVALID_INPUT", "Use só letras minúsculas sem acento, números e hífen (ex.: barbearia-do-ze).");
  return ok(slug);
}

export function validateBookingSettings(input: BookingSettings): Result<BookingSettings> {
  if (input.slug !== null) {
    const slug = validateSlug(input.slug);
    if (!slug.ok) return slug;
    input = { ...input, slug: slug.value };
  }
  if (input.enabled && input.slug === null) return fail("INVALID_INPUT", "Escolha o endereço do link antes de ligá-lo.");
  if (!Number.isInteger(input.openDays) || input.openDays < 1 || input.openDays > 127) return fail("INVALID_INPUT", "Marque pelo menos um dia de funcionamento.");
  if (!Number.isInteger(input.openMinute) || !Number.isInteger(input.closeMinute) || input.openMinute < 0 || input.closeMinute > 24 * 60) {
    return fail("INVALID_INPUT", "Horário de funcionamento inválido.");
  }
  if (input.openMinute >= input.closeMinute) return fail("INVALID_INPUT", "A barbearia precisa abrir antes de fechar.");
  if (!(SLOT_OPTIONS as readonly number[]).includes(input.slotMinutes)) return fail("INVALID_INPUT", "Intervalo entre horários inválido.");
  if (!Number.isInteger(input.minNoticeMinutes) || input.minNoticeMinutes < 0 || input.minNoticeMinutes > 24 * 60) {
    return fail("INVALID_INPUT", "Antecedência mínima deve ser de 0 a 24 horas.");
  }
  if (input.closeMinute - input.openMinute < input.slotMinutes) return fail("INVALID_INPUT", "O horário de funcionamento é menor que o intervalo escolhido.");
  return ok(input);
}

/** Only the owner changes it; the change is audited ("old → new"). */
export function updateBookingSettings(
  ctx: TenantContext,
  current: BookingSettings,
  next: BookingSettings,
  at: Date,
): Result<{ settings: BookingSettings; audit: AuditEntry }> {
  const allowed = requirePermission(ctx, "settings.manage");
  if (!allowed.ok) return allowed;
  const valid = validateBookingSettings(next);
  if (!valid.ok) return valid;
  const show = (key: keyof BookingSettings, v: BookingSettings[keyof BookingSettings]) =>
    key === "openMinute" || key === "closeMinute" ? formatMinutes(Number(v)) : String(v);
  const changes: Record<string, string> = {};
  for (const key of Object.keys(current) as (keyof BookingSettings)[]) {
    if (current[key] !== valid.value[key]) changes[key] = `${show(key, current[key])} → ${show(key, valid.value[key])}`;
  }
  if (Object.keys(changes).length === 0) return fail("INVALID_INPUT", "Nenhuma alteração para salvar.");
  return ok({
    settings: valid.value,
    audit: { barbershopId: ctx.barbershopId, action: "booking.settings_changed", userId: ctx.userId, at, entityId: ctx.barbershopId, details: changes },
  });
}
