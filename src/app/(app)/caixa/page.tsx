import { Badge, ButtonLink, Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { cashRegister, expectedCashInDrawer, paymentMethodLabel, receivedByMethod, type PaymentMethod } from "@/prototype/mock-data";
import { OwnerOnly } from "@/prototype/owner-only";

function CashRegisterPageContent() {
  const cashInDrawer = expectedCashInDrawer(cashRegister.movements);
  const byMethod = receivedByMethod(cashRegister.movements);

  return (
    <>
      <PageHeader
        title="Caixa"
        subtitle={`Aberto às ${cashRegister.openedAt} por ${cashRegister.openedBy}`}
        action={<Badge tone="ok">Aberto</Badge>}
      />

      <Card title="Recebido hoje por forma de pagamento">
        <ul className={styles.list}>
          {(Object.keys(byMethod) as PaymentMethod[]).map((m) => (
            <li key={m} className={styles.row}>
              <span>{paymentMethodLabel[m]}</span>
              <Money cents={byMethod[m]} />
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
                <span className={styles.rowMeta}>{m.time} · {paymentMethodLabel[m.method]}</span>
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
      <ButtonLink href="/caixa/fechar" block>Fechar caixa</ButtonLink>
      <Note>Ao fechar, a pessoa conta o dinheiro da gaveta e o sistema mostra a diferença.</Note>
    </>
  );
}

export default function CashRegisterPage() {
  return (
    <OwnerOnly>
      <CashRegisterPageContent />
    </OwnerOnly>
  );
}
