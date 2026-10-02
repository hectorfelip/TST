"use client";

/** Opening the register. Rules: R-CSH-01 and R-CSH-07 (a different amount from what was left needs a reason and tells the owner). */
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Note, styles } from "@/components/ui";
import { openRegisterAction } from "@/modules/finance/api/actions";
import { formatBRL, toCents, type Cents } from "@/shared/money";

export function OpenCashFlow({ leftYesterday }: { leftYesterday: Cents | null }) {
  const [opening, setOpening] = useState(leftYesterday === null ? "" : (leftYesterday / 100).toFixed(2).replace(".", ","));
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);

  let cents: Cents | null = null;
  try {
    cents = opening.trim() === "" ? null : toCents(opening);
  } catch {
    cents = null;
  }
  const differs = cents !== null && leftYesterday !== null && cents !== leftYesterday;
  const valid = cents !== null && (!differs || reason.trim().length >= 5);

  return (
    <ActionForm action={openRegisterAction}>
      <input type="hidden" name="opening" value={opening} />
      <input type="hidden" name="reason" value={differs ? reason : ""} />
      {asking ? (
        <Card title="Confirmar abertura">
          <p>Abrir o caixa com <strong>{formatBRL(cents ?? 0)}</strong> de troco?</p>
          {differs && leftYesterday !== null && <Note>Diferente do que ficou ontem ({formatBRL(leftYesterday)}). O dono será avisado.</Note>}
          <div className={styles.buttonGrid}>
            <SubmitButton>Sim, abrir caixa</SubmitButton>
            <button type="button" className={styles.buttonSecondary} onClick={() => setAsking(false)}>Voltar</button>
          </div>
        </Card>
      ) : (
        <>
          <Card title="Troco inicial">
            {leftYesterday !== null ? (
              <p>No último fechamento ficaram <strong>{formatBRL(leftYesterday)}</strong> na gaveta (conferido).</p>
            ) : (
              <p>Este é o primeiro caixa: informe o dinheiro que está na gaveta.</p>
            )}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="opening">Dinheiro na gaveta agora</label>
              <input id="opening" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" value={opening} onChange={(e) => setOpening(e.target.value)} />
              {opening.trim() !== "" && cents === null && <span className={styles.error}>Valor inválido.</span>}
            </div>
            {differs && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="open-reason">Por que é diferente do que ficou? (obrigatório)</label>
                <textarea id="open-reason" className={styles.input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                <Note>O dono é avisado quando o troco inicial não bate com o que ficou no fechamento.</Note>
              </div>
            )}
          </Card>
          <Note>Qualquer pessoa da equipe pode abrir o caixa. Só o dono fecha.</Note>
          <button type="button" className={`${styles.button} ${styles.buttonBlock}`} disabled={!valid} onClick={() => setAsking(true)}>
            Abrir caixa
          </button>
        </>
      )}
    </ActionForm>
  );
}
