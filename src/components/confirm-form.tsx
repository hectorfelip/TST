"use client";

/**
 * "Are you sure?" before something costly (no-show, cancel, discard...). The first tap only asks;
 * the second one (inside the question box) really sends. Optionally asks for a reason.
 */
import { useState } from "react";
import { ActionForm, SubmitButton } from "./action-form";
import { Note, styles } from "./ui";
import type { ActionResult } from "@/server/run-types";

export function ConfirmForm<T = null>({
  action,
  fields,
  label,
  question,
  confirmLabel,
  variant = "secondary",
  disabledHint,
  reasonLabel,
  successMessage,
}: {
  action: (previous: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;
  /** Hidden values the action needs (ids). */
  fields: Record<string, string>;
  label: string;
  question: string;
  confirmLabel: string;
  variant?: "primary" | "secondary" | "danger";
  /** When set, the button is disabled and this text says why. */
  disabledHint?: string;
  /** When set, a reason (at least 5 characters) is required and sent as `reason`. */
  reasonLabel?: string;
  successMessage?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const reasonOk = !reasonLabel || reason.trim().length >= 5;
  const base = variant === "danger" ? styles.buttonDanger : variant === "primary" ? styles.button : styles.buttonSecondary;

  if (!asking) {
    return (
      <>
        <button type="button" className={`${base} ${styles.buttonBlock}`} disabled={!!disabledHint} onClick={() => setAsking(true)}>
          {label}
        </button>
        {disabledHint && <Note>{disabledHint}</Note>}
      </>
    );
  }
  return (
    <div className={styles.card} role="alertdialog" aria-label={label}>
      <p>{question}</p>
      <ActionForm action={action} successMessage={successMessage}>
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {reasonLabel && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`reason-${label}`}>{reasonLabel} (obrigatório)</label>
            <textarea id={`reason-${label}`} name="reason" className={styles.input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            {reason.length > 0 && !reasonOk && <span className={styles.error}>Escreva pelo menos 5 caracteres.</span>}
          </div>
        )}
        <div className={styles.buttonGrid}>
          <SubmitButton variant={variant === "danger" ? "danger" : "primary"} disabled={!reasonOk}>{confirmLabel}</SubmitButton>
          <button type="button" className={styles.buttonSecondary} onClick={() => setAsking(false)}>Voltar</button>
        </div>
      </ActionForm>
    </div>
  );
}
