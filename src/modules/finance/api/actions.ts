"use server";
import { redirect } from "next/navigation";
import { act, type ActionResult } from "@/server/run";
import { money, text } from "@/server/form";
import { refreshScreens } from "@/server/refresh";
import { fail, ok } from "@/shared/result";
import { openRegisterCmd, recordExpenseCmd, recordWithdrawalCmd } from "../data/commands";
import { PAYMENT_METHODS, type PaymentMethod } from "../rules/cash-register";

const idem = (formData: FormData, action: string) => ({ key: text(formData, "key"), action });

/** The owner OR a barber opens the register. A different amount from what was left yesterday needs a reason (and the owner is told). */
export async function openRegisterAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "cash.open", idempotency: idem(formData, "cash.open") }, async (tx, ctx) => {
    const amount = money(formData, "opening", "Troco inicial");
    if (!amount.ok) return amount;
    if (amount.value === null) return fail("INVALID_INPUT", "Informe o dinheiro que está na gaveta.");
    const opened = await openRegisterCmd(tx, ctx, { openingCash: amount.value, reason: text(formData, "reason") || null });
    return opened.ok ? ok(null) : opened;
  });
  if (result.ok) {
    refreshScreens();
    redirect("/");
  }
  return result;
}

export async function expenseAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "cash.expense", idempotency: idem(formData, "cash.expense") }, async (tx, ctx) => {
    const amount = money(formData, "amount", "Valor");
    if (!amount.ok) return amount;
    const method = text(formData, "method");
    if (!(PAYMENT_METHODS as readonly string[]).includes(method)) return fail("INVALID_INPUT", "Escolha como foi pago.");
    const saved = await recordExpenseCmd(tx, ctx, { amount: amount.value ?? 0, method: method as PaymentMethod, description: text(formData, "description") });
    return saved.ok ? ok(null) : saved;
  });
  if (result.ok) refreshScreens();
  return result;
}

export async function withdrawalAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "cash.withdrawal", idempotency: idem(formData, "cash.withdrawal") }, async (tx, ctx) => {
    const amount = money(formData, "amount", "Valor");
    if (!amount.ok) return amount;
    const saved = await recordWithdrawalCmd(tx, ctx, { amount: amount.value ?? 0, reason: text(formData, "reason") });
    return saved.ok ? ok(null) : saved;
  });
  if (result.ok) refreshScreens();
  return result;
}
