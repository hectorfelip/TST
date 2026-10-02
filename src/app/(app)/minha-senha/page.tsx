import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Note, PageHeader, styles } from "@/components/ui";
import { changeOwnPasswordAction } from "@/modules/auth/api/actions";
import { requireAuth } from "@/server/auth";

export default async function MyPasswordPage() {
  await requireAuth();
  return (
    <>
      <PageHeader title="Minha senha" />
      <Card>
        <ActionForm action={changeOwnPasswordAction}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="current">Senha atual</label>
            <input id="current" name="current" type="password" autoComplete="current-password" className={styles.input} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Senha nova</label>
            <input id="password" name="password" type="password" autoComplete="new-password" className={styles.input} minLength={8} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirm">Repita a senha nova</label>
            <input id="confirm" name="confirm" type="password" autoComplete="new-password" className={styles.input} minLength={8} required />
          </div>
          <SubmitButton block>Trocar senha</SubmitButton>
        </ActionForm>
      </Card>
      <Note>Depois de trocar, você precisa entrar de novo, e as outras telas onde você estava logado também saem.</Note>
    </>
  );
}
