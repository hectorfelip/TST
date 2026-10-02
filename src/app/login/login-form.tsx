"use client";

import { useActionState } from "react";
import { loginAction } from "@/modules/auth/api/actions";
import { SubmitButton } from "@/components/action-form";
import { Note, styles } from "@/components/ui";

export function LoginForm({ passwordChanged }: { passwordChanged: boolean }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} style={{ display: "contents" }}>
      {passwordChanged && <Note>Senha trocada. Entre com a senha nova.</Note>}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" className={styles.input} autoComplete="username" required />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" className={styles.input} autoComplete="current-password" required />
      </div>
      {state && !state.ok && <p role="alert" className={styles.error}>{state.message}</p>}
      <SubmitButton block>Entrar</SubmitButton>
    </form>
  );
}
