"use client";

/** PROTOTYPE ONLY (step 3). Opening the register; nothing is saved. Rules: R-CSH-01 and R-CSH-07. */
import { useState } from "react";
import Link from "next/link";
import { Card, Note, styles } from "@/components/ui";
import { formatBRL, toCents, type Cents } from "@/shared/money";

export function OpenCashFlow({ leftYesterday }: { leftYesterday: Cents }) {
  const [opening, setOpening] = useState((leftYesterday / 100).toFixed(2).replace(".", ","));
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");

  let cents: Cents | null = null;
  try {
    cents = toCents(opening);
  } catch {
    cents = null;
  }
  const differs = cents !== null && cents !== leftYesterday;
  const valid = cents !== null && (!differs || reason.trim().length >= 5);

  if (step === "done") {
    return (
      <Card title="Caixa aberto ✓">
        <p>Troco inicial: {formatBRL(cents ?? 0)}</p>
        {differs && <Note>Diferente do que ficou ontem. O dono foi avisado. Motivo: {reason}</Note>}
        <Note>Protótipo: nada foi salvo.</Note>
        <Link href="/" className={`${styles.button} ${styles.buttonBlock}`}>Ir para o início</Link>
      </Card>
    );
  }

  if (step === "confirm") {
    return (
      <Card title="Confirmar abertura">
        <p>Abrir o caixa com <strong>{formatBRL(cents ?? 0)}</strong> de troco?</p>
        {differs && <Note>Diferente do que ficou ontem ({formatBRL(leftYesterday)}). O dono será avisado.</Note>}
        <div className={styles.buttonGrid}>
          <button type="button" className={styles.button} onClick={() => setStep("done")}>Sim, abrir caixa</button>
          <button type="button" className={styles.buttonSecondary} onClick={() => setStep("form")}>Voltar</button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card title="Troco inicial">
        <p>Ontem ficaram <strong>{formatBRL(leftYesterday)}</strong> na gaveta (conferido no fechamento).</p>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="opening">Dinheiro na gaveta agora</label>
          <input id="opening" className={styles.input} inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
          {cents === null && <span className={styles.error}>Valor inválido.</span>}
        </div>
        {differs && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="open-reason">Por que é diferente de ontem? (obrigatório)</label>
            <textarea id="open-reason" className={styles.input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            <Note>O dono é avisado quando o troco inicial não bate com o que ficou no fechamento.</Note>
          </div>
        )}
      </Card>
      <Note>Qualquer pessoa da equipe pode abrir o caixa. Só o dono fecha.</Note>
      <button type="button" className={`${styles.button} ${styles.buttonBlock}`} disabled={!valid} onClick={() => setStep("confirm")}>
        Abrir caixa
      </button>
    </>
  );
}
