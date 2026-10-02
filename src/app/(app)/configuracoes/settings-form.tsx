"use client";

/**
 * PROTOTYPE ONLY (step 3). The option of the barbershop for pending comandas.
 * Rules: R-SET-01 (option + custom deadline) and R-SET-02 (only the owner,
 * audited), in src/modules/barbershops/rules/settings.ts.
 */
import { useState } from "react";
import { Card, Note, styles } from "@/components/ui";
import { savePendingSettings } from "@/prototype/actions";

type Pending = { number: number; client: string; daysAgo: number };

const MIN = 1;
const MAX = 30;

export function SettingsForm({ initialEnabled, initialDays, pending }: { initialEnabled: boolean; initialDays: number; pending: Pending[] }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [daysText, setDaysText] = useState(String(initialDays));
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [error, setError] = useState<string | null>(null);

  const days = Number(daysText);
  const daysValid = daysText.trim() !== "" && Number.isInteger(days) && days >= MIN && days <= MAX;
  const valid = !enabled || daysValid;
  // The deadline is remembered even when the option is off.
  const savedDays = daysValid ? days : initialDays;
  const changed = enabled !== initialEnabled || (enabled && savedDays !== initialDays);
  // Preview (expirePendingComandas): which pending comandas would be cancelled right away?
  const wouldCancel = enabled && daysValid ? pending.filter((p) => p.daysAgo >= days) : [];

  if (step === "done") {
    return (
      <Card title="Configurações salvas ✓">
        <p>
          {enabled
            ? `Comandas pendentes são canceladas automaticamente depois de ${savedDays} ${savedDays === 1 ? "dia" : "dias"}.`
            : "Comandas pendentes não são canceladas sozinhas: esperam até você receber ou cancelar."}
        </p>
        <Note>Registrado quem mudou e de quê → para quê. No protótipo, as outras telas já usam essa escolha.</Note>
      </Card>
    );
  }

  if (step === "confirm") {
    return (
      <Card title="Confirmar mudança">
        <p>
          {enabled ? (
            <>Cancelar comandas pendentes <strong>automaticamente depois de {savedDays} {savedDays === 1 ? "dia" : "dias"}</strong>?</>
          ) : (
            <>Deixar de cancelar comandas pendentes sozinho? Elas ficam esperando até <strong>você</strong> receber ou cancelar.</>
          )}
        </p>
        {wouldCancel.length > 0 && (
          <Note>
            Atenção: {wouldCancel.map((p) => `#${p.number} (${p.client})`).join(", ")} já {wouldCancel.length === 1 ? "passou" : "passaram"} desse prazo
            e {wouldCancel.length === 1 ? "será cancelada" : "serão canceladas"} na próxima rotina diária.
          </Note>
        )}
        {error && <span className={styles.error}>{error}</span>}
        <div className={styles.buttonGrid}>
          <button
            type="button"
            className={styles.button}
            onClick={async () => {
              const result = await savePendingSettings(enabled, savedDays);
              if (result.ok) setStep("done");
              else setError(result.message);
            }}
          >
            Sim, salvar
          </button>
          <button type="button" className={styles.buttonSecondary} onClick={() => setStep("form")}>Voltar</button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card title="Comandas pendentes">
        <p className={styles.rowMeta}>
          Pendente = serviço lançado e ainda não pago, que o dono deixou esperando ao fechar o caixa.
        </p>
        <label className={styles.row} style={{ cursor: "pointer" }}>
          <span className={styles.rowMain}>
            <strong>Cancelar pendentes automaticamente</strong>
            <span className={styles.rowMeta}>{enabled ? "Ligado" : "Desligado"}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Cancelar pendentes automaticamente"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: 28, height: 28 }}
          />
        </label>

        {enabled ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="days">Prazo (dias)</label>
            <input
              id="days"
              className={styles.input}
              type="number"
              inputMode="numeric"
              min={MIN}
              max={MAX}
              value={daysText}
              onChange={(e) => setDaysText(e.target.value)}
            />
            {!daysValid && <span className={styles.error}>Informe um número inteiro de {MIN} a {MAX} dias.</span>}
            <Note>
              Depois desse prazo, a comanda que continuar sem pagamento é cancelada pelo sistema. Você vê a contagem em cada
              fechamento de caixa e no painel.
            </Note>
          </div>
        ) : (
          <Note>
            Desligado: a comanda pendente fica esperando até você receber ou cancelar. Você continua sendo alertado de todas em cada
            fechamento de caixa.
          </Note>
        )}

        {wouldCancel.length > 0 && (
          <div className={styles.card} role="alert">
            <strong>
              {wouldCancel.length} comanda(s) já passaram desse prazo
            </strong>
            <span className={styles.rowMeta}>
              {wouldCancel.map((p) => `#${p.number} ${p.client} (${p.daysAgo} dias)`).join(", ")} seriam canceladas na próxima rotina diária.
            </span>
          </div>
        )}
      </Card>

      <button type="button" className={`${styles.button} ${styles.buttonBlock}`} disabled={!valid || !changed} onClick={() => setStep("confirm")}>
        Revisar e salvar
      </button>
      {!changed && <Note>Nada mudou ainda.</Note>}
    </>
  );
}
