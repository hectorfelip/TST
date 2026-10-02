import { ActionForm, SubmitButton } from "@/components/action-form";
import { styles } from "@/components/ui";
import type { ActionResult } from "@/server/run-types";

export function ClientForm<T>({
  action,
  submitLabel,
  initial,
  clientId,
}: {
  action: (previous: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;
  submitLabel: string;
  initial?: { name: string; phone: string; notes: string };
  clientId?: string;
}) {
  return (
    <ActionForm action={action} successMessage={clientId ? "Dados salvos." : undefined}>
      {clientId && <input type="hidden" name="clientId" value={clientId} />}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="name">Nome</label>
        <input id="name" name="name" className={styles.input} defaultValue={initial?.name} required minLength={2} maxLength={80} />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="phone">Telefone (opcional)</label>
        <input id="phone" name="phone" className={styles.input} inputMode="tel" placeholder="(11) 98888-1111" defaultValue={initial?.phone} />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="notes">Observações (opcional)</label>
        <textarea id="notes" name="notes" className={styles.input} rows={2} maxLength={500} defaultValue={initial?.notes} placeholder="Ex.: corte baixo nas laterais, máquina 1" />
      </div>
      <SubmitButton block>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
