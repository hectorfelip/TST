"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Note, styles } from "@/components/ui";
import { payComandaAction } from "@/modules/service-orders/api/actions";
import { formatBRL, toCents, type Cents } from "@/shared/money";

type Method = "pix" | "cash" | "debit" | "credit";
const methods: { value: Method; label: string }[] = [
  { value: "pix", label: "Pix" },
  { value: "cash", label: "Dinheiro" },
  { value: "debit", label: "Débito" },
  { value: "credit", label: "Crédito" },
];

function parse(value: string): Cents | null {
  if (value.trim() === "") return 0;
  try {
    return toCents(value);
  } catch {
    return null;
  }
}

/** The totals shown here are for the person to read: the SERVER recomputes everything and is the one that decides. */
export function PayForm({ comandaId, subtotal, isOwner, registerOpen }: { comandaId: string; subtotal: Cents; isOwner: boolean; registerOpen: boolean }) {
  const [method, setMethod] = useState<Method | null>(null);
  const [received, setReceived] = useState("");
  const [discount, setDiscount] = useState("");

  const discountCents = isOwner ? parse(discount) : 0;
  const discountValid = discountCents !== null && discountCents >= 0 && discountCents <= subtotal;
  const total = subtotal - (discountValid ? (discountCents ?? 0) : 0);
  const receivedCents = parse(received);
  const change = method === "cash" && receivedCents ? receivedCents - total : null;
  const canConfirm = registerOpen && method !== null && discountValid && (change === null || change >= 0);

  return (
    <ActionForm action={payComandaAction}>
      <input type="hidden" name="comandaId" value={comandaId} />
      <input type="hidden" name="method" value={method ?? ""} />
      {discountValid && (discountCents ?? 0) > 0 && (
        <Card>
          <div className={styles.row}><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
          <div className={styles.total}><span>Total com desconto</span><span>{formatBRL(total)}</span></div>
        </Card>
      )}
      <Card title="Forma de pagamento">
        <div className={styles.buttonGrid}>
          {methods.map((m) => (
            <button key={m.value} type="button" className={m.value === method ? styles.button : styles.buttonSecondary} aria-pressed={m.value === method} onClick={() => setMethod(m.value)}>
              {m.label}
            </button>
          ))}
        </div>
        {method === "cash" && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="received">Dinheiro recebido (opcional, para calcular o troco)</label>
            <input id="received" name="received" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" value={received} onChange={(e) => setReceived(e.target.value)} />
            {receivedCents === null && <span className={styles.error}>Valor inválido.</span>}
            {change !== null && change >= 0 && <strong>Troco: {formatBRL(change)}</strong>}
            {change !== null && change < 0 && <span className={styles.error}>Faltam {formatBRL(-change)}.</span>}
          </div>
        )}
      </Card>
      {isOwner ? (
        <Card title="Desconto (só o dono)">
          <div className={styles.field}>
            <label className={styles.label} htmlFor="discount">Valor do desconto</label>
            <input id="discount" name="discount" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            {!discountValid && <span className={styles.error}>Desconto inválido ou maior que o total.</span>}
          </div>
          <Note>O sistema guarda quem deu o desconto e de quanto.</Note>
        </Card>
      ) : (
        <Note>Desconto só pode ser dado pelo dono.</Note>
      )}
      <Card title="Observação (opcional)">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="note">Ex.: pagamento dividido</label>
          <textarea id="note" name="note" className={styles.input} rows={2} maxLength={280} />
        </div>
        <Note>
          Pagamento dividido fica para a versão 2. Até lá: escolha a forma de maior valor e escreva aqui como foi pago (ex.: &quot;R$ 20
          dinheiro + R$ 25 Pix&quot;). O dono corrige no fechamento do caixa.
        </Note>
      </Card>
      <SubmitButton block disabled={!canConfirm}>Confirmar pagamento</SubmitButton>
      <Link href={`/comandas/${comandaId}`} className={`${styles.buttonSecondary} ${styles.buttonBlock}`}>Voltar</Link>
    </ActionForm>
  );
}
