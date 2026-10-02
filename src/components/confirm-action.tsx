"use client";

/**
 * One action with a confirmation step ("are you sure?") before it happens.
 * Used wherever a mistake is costly: no-show, cancel, discard. In the
 * prototype nothing is saved; the rules in src/modules do the real work.
 */
import { useState } from "react";
import { Note, styles } from "./ui";

type Variant = "primary" | "secondary" | "danger";

const variantClass: Record<Variant, string> = {
  primary: styles.button,
  secondary: styles.buttonSecondary,
  danger: styles.buttonDanger,
};

export function ConfirmAction({
  label,
  question,
  confirmLabel,
  doneMessage,
  variant = "secondary",
  block = true,
  disabledHint,
  reasonRequired = false,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  doneMessage: string;
  variant?: Variant;
  block?: boolean;
  /** When set, the button is disabled and this text explains why. */
  disabledHint?: string;
  reasonRequired?: boolean;
}) {
  const [step, setStep] = useState<"idle" | "asking" | "done">("idle");
  const [reason, setReason] = useState("");
  const reasonOk = !reasonRequired || reason.trim().length >= 5;

  if (step === "done") {
    return (
      <div className={styles.card} role="status">
        <strong>✓ {doneMessage}</strong>
        {reasonRequired && reason.trim() && <Note>Motivo: {reason.trim()}</Note>}
        <Note>Protótipo: nada foi salvo.</Note>
      </div>
    );
  }

  if (step === "asking") {
    return (
      <div className={styles.card} role="alertdialog" aria-label={label}>
        <p>{question}</p>
        {reasonRequired && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`reason-${label}`}>Motivo (obrigatório)</label>
            <textarea id={`reason-${label}`} className={styles.input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            {!reasonOk && reason.length > 0 && <span className={styles.error}>Escreva pelo menos 5 caracteres.</span>}
          </div>
        )}
        <div className={styles.buttonGrid}>
          <button type="button" className={variant === "danger" ? styles.buttonDanger : styles.button} disabled={!reasonOk} onClick={() => setStep("done")}>
            {confirmLabel}
          </button>
          <button type="button" className={styles.buttonSecondary} onClick={() => setStep("idle")}>Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${variantClass[variant]} ${block ? styles.buttonBlock : ""}`}
        disabled={!!disabledHint}
        onClick={() => setStep("asking")}
      >
        {label}
      </button>
      {disabledHint && <Note>{disabledHint}</Note>}
    </>
  );
}
