import { ActionForm, SubmitButton } from "@/components/action-form";
import { NoAccess } from "@/components/no-access";
import { Badge, ButtonLink, Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { expenseAction, withdrawalAction } from "@/modules/finance/api/actions";
import { loadCashPage } from "@/modules/finance/api/queries";
import type { PaymentMethod } from "@/modules/finance/rules/cash-register";
import { requireAction } from "@/server/auth";

const methodLabel: Record<PaymentMethod, string> = { cash: "Dinheiro", pix: "Pix", debit: "Débito", credit: "Crédito" };

export default async function CashRegisterPage() {
  if (!(await requireAction("cash.view"))) return <NoAccess />;
  const page = await loadCashPage();

  if (page.kind === "closed") {
    return (
      <>
        <PageHeader title="Caixa" action={<Badge tone="warning">Fechado</Badge>} />
        <Card title="O caixa está fechado">
          <p>Abra o caixa com o troco da gaveta para começar a receber pagamentos.</p>
          <ButtonLink href="/caixa/abrir" block>Abrir caixa</ButtonLink>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Caixa" subtitle={`Aberto às ${page.openedLabel}`} action={<Badge tone="ok">Aberto</Badge>} />

      <Card title="Recebido hoje por forma de pagamento">
        <ul className={styles.list}>
          {(Object.keys(page.byMethod) as PaymentMethod[]).map((m) => (
            <li key={m} className={styles.row}>
              <span>{methodLabel[m]}</span>
              <Money cents={page.byMethod[m]} />
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Dinheiro na gaveta">
        <div className={styles.total}>
          <span>Esperado</span>
          <Money cents={page.expectedCash} />
        </div>
        <Note>Troco inicial + dinheiro recebido − despesas e retiradas pagas em dinheiro.</Note>
      </Card>

      <Card title="Movimentações">
        <ul className={styles.list}>
          {page.movements.map((m) => (
            <li key={m.id} className={styles.row}>
              <span className={styles.rowMain}>
                <span>{m.description}</span>
                <span className={styles.rowMeta}>{m.time} · {methodLabel[m.method]}</span>
              </span>
              <strong><Money cents={m.amount} /></strong>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Lançar despesa">
        <ActionForm action={expenseAction} successMessage="Despesa lançada.">
          <div className={styles.field}>
            <label className={styles.label} htmlFor="exp-desc">O que foi? (obrigatório)</label>
            <input id="exp-desc" name="description" className={styles.input} placeholder="Ex.: café e açúcar" required />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="exp-amount">Valor</label>
            <input id="exp-amount" name="amount" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" required />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="exp-method">Pago com</label>
            <select id="exp-method" name="method" className={styles.input} defaultValue="cash">
              {Object.entries(methodLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <SubmitButton variant="secondary">Lançar despesa</SubmitButton>
        </ActionForm>
      </Card>

      <Card title="Retirada (sangria)">
        <ActionForm action={withdrawalAction} successMessage="Retirada registrada.">
          <div className={styles.field}>
            <label className={styles.label} htmlFor="wd-amount">Valor retirado da gaveta</label>
            <input id="wd-amount" name="amount" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" required />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="wd-reason">Motivo (obrigatório)</label>
            <input id="wd-reason" name="reason" className={styles.input} placeholder="Ex.: retirada do dono" required />
          </div>
          <SubmitButton variant="secondary">Registrar retirada</SubmitButton>
        </ActionForm>
        <Note>Não pode ser maior que o dinheiro que está na gaveta. Fica registrada com o seu nome.</Note>
      </Card>

      <ButtonLink href="/caixa/fechar" block>Fechar caixa</ButtonLink>
      <Note>Ao fechar, a pessoa conta o dinheiro da gaveta e o sistema mostra a diferença.</Note>
    </>
  );
}
