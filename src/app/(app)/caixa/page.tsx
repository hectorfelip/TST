import { Badge, ButtonLink, Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { cashRegister, paymentMethodLabel, type PaymentMethod } from "@/prototype/mock-data";

export default function CashRegisterPage() {
  const cashInDrawer = cashRegister.movements.reduce((sum, m) => sum + m.amount, 0);

  return (
    <>
      <PageHeader
        title="Caixa"
        subtitle={`Aberto às ${cashRegister.openedAt} por ${cashRegister.openedBy}`}
        action={<Badge tone="ok">Aberto</Badge>}
      />

      <Card title="Recebido hoje por forma de pagamento">
        <ul className={styles.list}>
          {(Object.keys(cashRegister.byMethod) as PaymentMethod[]).map((m) => (
            <li key={m} className={styles.row}>
              <span>{paymentMethodLabel[m]}</span>
              <Money cents={cashRegister.byMethod[m]} />
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Dinheiro na gaveta">
        <div className={styles.total}>
          <span>Esperado</span>
          <Money cents={cashInDrawer} />
        </div>
        <Note>Troco inicial + dinheiro recebido − despesas pagas em dinheiro.</Note>
      </Card>

      <Card title="Movimentações">
        <ul className={styles.list}>
          {cashRegister.movements.map((m, i) => (
            <li key={i} className={styles.row}>
              <span className={styles.rowMain}>
                <span>{m.description}</span>
                <span className={styles.rowMeta}>{m.time}</span>
              </span>
              <strong><Money cents={m.amount} /></strong>
            </li>
          ))}
        </ul>
      </Card>

      <div className={styles.buttonGrid}>
        <ButtonLink href="/caixa" variant="secondary">Lançar despesa</ButtonLink>
        <ButtonLink href="/caixa" variant="secondary">Retirada (sangria)</ButtonLink>
      </div>
      <ButtonLink href="/caixa" block>Fechar caixa</ButtonLink>
      <Note>Ao fechar, a pessoa conta o dinheiro da gaveta e o sistema mostra a diferença.</Note>
    </>
  );
}
