import { ActionForm, SubmitButton } from "@/components/action-form";
import { NoAccess } from "@/components/no-access";
import { Badge, Card, Note, PageHeader, styles } from "@/components/ui";
import { changeRoleAction, createEmployeeAction, resetPasswordAction, setActiveAction } from "@/modules/employees/api/actions";
import { loadTeam } from "@/modules/employees/api/queries";
import { requireAction } from "@/server/auth";

export default async function TeamPage() {
  if (!(await requireAction("employee.manage"))) return <NoAccess />;
  const team = await loadTeam();
  return (
    <>
      <PageHeader title="Equipe" />
      <Card>
        <ul className={styles.list}>
          {team.map((e) => (
            <li key={e.id}>
              <details>
                <summary className={styles.row}>
                  <span className={styles.rowMain}>
                    <span>{e.name}{e.isMe && " (você)"}</span>
                    <span className={styles.rowMeta}>{e.role === "owner" ? "Dono" : "Barbeiro"} · {e.email}</span>
                  </span>
                  {e.active ? <Badge tone="ok">Ativo</Badge> : <Badge>Inativo</Badge>}
                </summary>
                <ActionForm action={resetPasswordAction} successMessage="Senha nova salva. A pessoa precisa entrar de novo.">
                  <input type="hidden" name="employeeId" value={e.id} />
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`pw-${e.id}`}>Nova senha para {e.name}</label>
                    <input id={`pw-${e.id}`} name="password" type="text" autoComplete="off" className={styles.input} minLength={8} required />
                  </div>
                  <SubmitButton variant="secondary">Definir senha nova</SubmitButton>
                </ActionForm>
                <ActionForm action={changeRoleAction} successMessage="Papel alterado.">
                  <input type="hidden" name="employeeId" value={e.id} />
                  <input type="hidden" name="role" value={e.role === "owner" ? "barber" : "owner"} />
                  <SubmitButton variant="secondary">{e.role === "owner" ? "Tornar barbeiro" : "Tornar dono"}</SubmitButton>
                </ActionForm>
                <ActionForm action={setActiveAction}>
                  <input type="hidden" name="employeeId" value={e.id} />
                  <input type="hidden" name="active" value={e.active ? "no" : "yes"} />
                  <SubmitButton variant={e.active ? "danger" : "secondary"}>{e.active ? "Desativar pessoa" : "Reativar pessoa"}</SubmitButton>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Adicionar pessoa">
        <ActionForm action={createEmployeeAction} successMessage="Pessoa adicionada.">
          <div className={styles.field}>
            <label className={styles.label} htmlFor="e-name">Nome</label>
            <input id="e-name" name="name" className={styles.input} required minLength={2} maxLength={60} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="e-email">E-mail (é o login)</label>
            <input id="e-email" name="email" type="email" className={styles.input} required autoComplete="off" />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="e-role">Papel</label>
            <select id="e-role" name="role" className={styles.input} defaultValue="barber">
              <option value="barber">Barbeiro</option>
              <option value="owner">Dono</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="e-password">Senha inicial</label>
            <input id="e-password" name="password" type="text" autoComplete="off" className={styles.input} minLength={8} required />
          </div>
          <SubmitButton block>Adicionar pessoa</SubmitButton>
        </ActionForm>
        <Note>Cada pessoa tem o seu próprio login (sem login compartilhado). Combine a senha inicial com ela; depois ela troca em &quot;Mais → Minha senha&quot;. Ninguém é apagado: quem sai é desativado.</Note>
      </Card>
    </>
  );
}
