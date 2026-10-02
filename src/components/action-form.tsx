"use client";

/**
 * A form that talks to a server action.
 *  - Sends a random `key` with every request. A double tap (or a retry after the connection dropped)
 *    sends the SAME key, and the server does the thing only once. After an answer arrives, a new key
 *    is made, so the next deliberate tap is a new request.
 *  - Shows the server's refusal in words; buttons are disabled while it works.
 */
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Note, styles } from "./ui";
import type { ActionResult } from "@/server/run-types";

type Action<T> = (previous: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;

const newKey = (): string =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

export function SubmitButton({
  children,
  variant = "primary",
  block = false,
  disabled = false,
  name,
  value,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  block?: boolean;
  disabled?: boolean;
  /** Sent with the form when THIS button is the one pressed. */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const base = variant === "danger" ? styles.buttonDanger : variant === "secondary" ? styles.buttonSecondary : styles.button;
  return (
    <button type="submit" name={name} value={value} className={`${base} ${block ? styles.buttonBlock : ""}`} disabled={pending || disabled} aria-busy={pending}>
      {pending ? "Aguarde…" : children}
    </button>
  );
}

/** The idempotency key logic, for components that need the action's answer themselves. */
export function useIdempotentAction<T>(action: Action<T>) {
  const [state, formAction] = useActionState(action, null);
  const [key, setKey] = useState(newKey);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    // An answer arrived: the next request is a new one. (React's recommended way to react to a change while rendering.)
    setSeen(state);
    setKey(newKey());
  }
  return { state, formAction, key };
}

export function ActionForm<T = null>({
  action,
  children,
  successMessage,
  className,
}: {
  action: Action<T>;
  children: React.ReactNode;
  /** Shown after a success when the action does not redirect. */
  successMessage?: string;
  className?: string;
}) {
  const { state, formAction, key } = useIdempotentAction(action);
  return (
    <form action={formAction} className={className} style={{ display: "contents" }}>
      <input type="hidden" name="key" value={key} />
      {children}
      {state && !state.ok && (
        <p role="alert" className={styles.error}>
          {state.code === "UNAUTHENTICATED" ? (
            <>
              {state.message} <a href="/login">Entrar</a>
            </>
          ) : (
            state.message
          )}
        </p>
      )}
      {state?.ok && successMessage && <Note>✓ {successMessage}</Note>}
    </form>
  );
}
