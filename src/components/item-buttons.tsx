"use client";

/**
 * Add services and products to an open comanda with one tap.
 *  - the price comes from the SERVER's catalog, never from this screen;
 *  - a product with not enough stock makes the server ask "do you have it in your hands?" (rule R-STK-04);
 *    "yes" sends the same request again, confirmed, and the owner is told to recount the stock.
 */
import { useState } from "react";
import { addItemAction } from "@/modules/service-orders/api/actions";
import { useIdempotentAction } from "./action-form";
import { Card, Note, styles } from "./ui";
import { formatBRL, type Cents } from "@/shared/money";
import type { ActionResult } from "@/server/run-types";

type Barber = { id: string; name: string };
type Option = { id: string; name: string; price: Cents; stock?: number; favorite?: boolean };
type Answer = ActionResult & { item?: string };

export function ItemButtons({
  comandaId,
  barbers,
  defaultBarberId,
  canPickBarber,
  services,
  products,
}: {
  comandaId: string;
  barbers: Barber[];
  defaultBarberId: string;
  canPickBarber: boolean;
  services: Option[];
  products: Option[];
}) {
  const [barberId, setBarberId] = useState(defaultBarberId);
  const { state, formAction, key } = useIdempotentAction<null>(async (previous, formData): Promise<Answer> => {
    const result = await addItemAction(previous, formData);
    return { ...result, item: String(formData.get("item") ?? "") };
  });
  const answer = state as Answer | null;
  const needsConfirmation = answer && !answer.ok && answer.code === "NEEDS_CONFIRMATION" ? answer : null;
  const confirmedProduct = needsConfirmation?.item ? products.find((p) => `product:${p.id}` === needsConfirmation.item) : undefined;

  return (
    <>
      {canPickBarber && (
        <Card title="Quem fez">
          <div className={styles.field}>
            <label className={styles.label} htmlFor="who">Barbeiro deste item</label>
            <select id="who" className={styles.input} value={barberId} onChange={(e) => setBarberId(e.target.value)}>
              {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </Card>
      )}
      <form action={formAction} style={{ display: "contents" }}>
        <input type="hidden" name="key" value={key} />
        <input type="hidden" name="comandaId" value={comandaId} />
        <input type="hidden" name="barberId" value={barberId} />
        <Card title="Adicionar serviço">
          <div className={styles.buttonGrid}>
            {services.filter((s) => s.favorite).map((s) => (
              <button key={s.id} type="submit" name="item" value={`service:${s.id}`} className={`${styles.buttonSecondary} ${styles.buttonStack}`}>
                {s.name}<small>{formatBRL(s.price)}</small>
              </button>
            ))}
          </div>
          {services.some((s) => !s.favorite) && (
            <details>
              <summary>Outros serviços</summary>
              <div className={styles.buttonGrid}>
                {services.filter((s) => !s.favorite).map((s) => (
                  <button key={s.id} type="submit" name="item" value={`service:${s.id}`} className={`${styles.buttonSecondary} ${styles.buttonStack}`}>
                    {s.name}<small>{formatBRL(s.price)}</small>
                  </button>
                ))}
              </div>
            </details>
          )}
        </Card>
        {products.length > 0 && (
          <Card title="Adicionar produto">
            <div className={styles.buttonGrid}>
              {products.map((p) => (
                <button key={p.id} type="submit" name="item" value={`product:${p.id}`} className={`${styles.buttonSecondary} ${styles.buttonStack}`}>
                  {p.name}<small>{formatBRL(p.price)}</small>
                </button>
              ))}
            </div>
          </Card>
        )}
        {answer && !answer.ok && answer.code !== "NEEDS_CONFIRMATION" && <p role="alert" className={styles.error}>{answer.message}</p>}
        {needsConfirmation && confirmedProduct && (
          <div className={styles.card} role="alertdialog" aria-label="Estoque insuficiente">
            <p>
              <strong>{confirmedProduct.name}</strong>: o estoque no sistema é <strong>{Math.max(confirmedProduct.stock ?? 0, 0)}</strong>. Você tem o produto em mãos para entregar agora?
            </p>
            <button type="submit" name="confirmedItem" value={needsConfirmation.item} className={styles.button}>Sim, tenho em mãos</button>
            <Note>Se confirmar, a venda é registrada e o dono é avisado para conferir a contagem do estoque.</Note>
          </div>
        )}
      </form>
    </>
  );
}
