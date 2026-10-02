"use client";

/** PROTOTYPE ONLY (step 2). Cash-register closing with local state; nothing is saved. */
import { useState } from "react";
import Link from "next/link";
import { Card, Note, styles } from "@/components/ui";
import { formatBRL, toCents, type Cents } from "@/shared/money";

export function CloseCashFlow({ expected, openComandas }: { expected: Cents; openComandas: number }) {
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [closed, setClosed] = useState(false);

  let countedCents: Cents | null = null;
  try {
    countedCents = counted.trim() === "" ? null : toCents(counted);
  } catch {
    countedCents = null;
  }
  const invalid = counted.trim() !== "" && countedCents === null;
  const difference = countedCents === null ? null : countedCents - expected;
  const needsReason = difference !== null && difference !== 0;
  // R-CSH-05: closing is blocked while comandas are open.
  const canClose = openComandas === 0 && difference !== null && (!needsReason || reason.trim().length >= 5);

  if (closed) {
    return (
      <Card title="Caixa fechado ✓">
        <p>Esperado {formatBRL(expected)} · contado {formatBRL(countedCents ?? 0)}</p>
        {needsReason && <Note>Diferença de {formatBRL(difference ?? 0)}: {reason}</Note>}
        <Note>Protótipo: nada foi salvo.</Note>
        <Link href="/" className={`${styles.button} ${styles.buttonBlock}`}>Voltar ao painel</Link>
      </Card>
    );
  }

  return (
    <>
      {openComandas > 0 && (
        <Card title={`Atenção: ${openComandas} comandas abertas`}>
          <p>Feche, cancele ou descarte as comandas abertas. O caixa só fecha quando não houver nenhuma aberta.</p>
          <Link href="/comandas" className={styles.buttonSecondary}>Ver comandas abertas</Link>
        </Card>
      )}
      <Card title="1. Conte o dinheiro da gaveta">
        <div className={styles.row}><span>Esperado pelo sistema</span><strong>{formatBRL(expected)}</strong></div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="counted">Valor contado</label>
          <input id="counted" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" value={counted} onChange={(e) => setCounted(e.target.value)} />
          {invalid && <span className={styles.error}>Valor inválido.</span>}
        </div>
        {difference !== null && (
          <div className={styles.total}>
            <span>{difference === 0 ? "Bateu" : difference > 0 ? "Sobra" : "Falta"}</span>
            <span>{formatBRL(Math.abs(difference))}</span>
          </div>
        )}
      </Card>
      {needsReason && (
        <Card title="2. Motivo da diferença (obrigatório)">
          <div className={styles.field}>
            <label className={styles.label} htmlFor="reason">O que aconteceu?</label>
            <textarea id="reason" className={styles.input} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Pix da comanda #1023 foi marcado como dinheiro" />
          </div>
          <Note>A diferença fica registrada. Não ajuste o valor só para zerar.</Note>
        </Card>
      )}
      <button type="button" className={`${styles.button} ${styles.buttonBlock}`} disabled={!canClose} onClick={() => setClosed(true)}>
        Fechar caixa
      </button>
      <Link href="/caixa" className={`${styles.buttonSecondary} ${styles.buttonBlock}`}>Voltar</Link>
    </>
  );
}
