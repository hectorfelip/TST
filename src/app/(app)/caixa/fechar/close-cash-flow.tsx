"use client";

/** PROTOTYPE ONLY (step 2). Cash-register closing with local state; nothing is saved. */
import { useState } from "react";
import Link from "next/link";
import { Card, Note, styles } from "@/components/ui";
import { formatBRL, toCents, type Cents } from "@/shared/money";

type Pending = { number: number; total: Cents };

export function CloseCashFlow({
  expected,
  emptyComandas,
  pendingComandas,
}: {
  expected: Cents;
  emptyComandas: number;
  pendingComandas: Pending[];
}) {
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [closed, setClosed] = useState(false);
  const [noShowsCancelled, setNoShowsCancelled] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const pending = noShowsCancelled ? [] : pendingComandas;
  const pendingTotal = pending.reduce((sum, c) => sum + c.total, 0);

  let countedCents: Cents | null = null;
  try {
    countedCents = counted.trim() === "" ? null : toCents(counted);
  } catch {
    countedCents = null;
  }
  const invalid = counted.trim() !== "" && countedCents === null;
  const difference = countedCents === null ? null : countedCents - expected;
  const needsReason = difference !== null && difference !== 0;
  // R-CSH-05 (revised): open comandas never block closing.
  const canClose = difference !== null && (!needsReason || reason.trim().length >= 5);

  if (closed) {
    return (
      <Card title="Caixa fechado ✓">
        <p>Esperado {formatBRL(expected)} · contado {formatBRL(countedCents ?? 0)}</p>
        {needsReason && <Note>Diferença de {formatBRL(difference ?? 0)}: {reason}</Note>}
        {emptyComandas > 0 && <p>{emptyComandas} comanda(s) vazia(s) descartada(s) automaticamente.</p>}
        {noShowsCancelled && <p>{pendingComandas.length} comanda(s) cancelada(s): cliente não compareceu.</p>}
        {pending.length > 0 && (
          <p>
            {pending.length} comanda(s) com itens ficaram pendentes para amanhã ({formatBRL(pendingTotal)}).
          </p>
        )}
        <Note>Protótipo: nada foi salvo.</Note>
        <Link href="/" className={`${styles.button} ${styles.buttonBlock}`}>Voltar ao painel</Link>
      </Card>
    );
  }

  return (
    <>
      {(emptyComandas > 0 || pending.length > 0) && (
        <Card title="Comandas abertas">
          {emptyComandas > 0 && <p>{emptyComandas} comanda(s) vazia(s) serão descartadas automaticamente.</p>}
          {pending.length > 0 && (
            <>
              <p>
                {pending.map((c) => `#${c.number}`).join(", ")} têm itens ({formatBRL(pendingTotal)}). Se não forem pagas,
                ficam <strong>pendentes</strong> para amanhã.
              </p>
              {confirmingCancel ? (
                <>
                  <p>
                    Cancelar {pending.map((c) => `#${c.number}`).join(", ")} com o motivo &quot;Cliente não compareceu&quot;? Fica
                    registrado no histórico.
                  </p>
                  <div className={styles.buttonGrid}>
                    <button type="button" className={styles.buttonDanger} onClick={() => setNoShowsCancelled(true)}>
                      Sim, cancelar
                    </button>
                    <button type="button" className={styles.buttonSecondary} onClick={() => setConfirmingCancel(false)}>
                      Não
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className={`${styles.buttonSecondary} ${styles.buttonBlock}`} onClick={() => setConfirmingCancel(true)}>
                  Cancelar todas: cliente não compareceu
                </button>
              )}
              <Link href="/comandas" className={`${styles.buttonSecondary} ${styles.buttonBlock}`}>Ver comandas abertas</Link>
            </>
          )}
          <Note>Comandas abertas não impedem o fechamento do caixa.</Note>
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
