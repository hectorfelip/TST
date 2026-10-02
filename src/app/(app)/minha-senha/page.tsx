import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Note, PageHeader, styles } from "@/components/ui";
import { changeOwnPasswordAction } from "@/modules/auth/api/actions";
import { requireAuth } from "@/server/auth";

export default async function MyPasswordPage() {
  const { mustChangePassword } = await requireAuth({ allowTemporary: true });
  return (
    <>
      <PageHeader title={mustChangePassword ? "Escolha a sua senha" : "Minha senha"} />
      {mustChangePassword && (
        <Card title="Primeiro acesso">
          <p>A senha que você recebeu é temporária: outra pessoa a conhece. Escolha uma senha só sua para continuar.</p>
        </Card>
      )}
      <Card>
        <ActionForm action={changeOwnPasswordAction}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="current">{mustChangePassword ? "Senha temporária (a que você recebeu)" : "Senha atual"}</label>
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
      <Note>Depois de trocar, você entra de novo com a senha nova, e os outros aparelhos onde você estava logado saem. A senha nova precisa ser diferente da atual.</Note>
    </>
  );
}
