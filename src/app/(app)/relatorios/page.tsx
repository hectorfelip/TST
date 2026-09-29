import { Card, Money, Note, PageHeader, Stat, styles } from "@/components/ui";
import { formatBRL } from "@/shared/money";
import { monthReport, paymentMethodLabel, type PaymentMethod } from "@/prototype/mock-data";
import { OwnerOnly } from "@/prototype/owner-only";

function ReportsPageContent() {
  const r = monthReport;

  return (
    <>
      <PageHeader title="Relatórios" subtitle={r.label} />

      <div className={styles.stats}>
        <Stat label="Entradas" value={formatBRL(r.income)} />
        <Stat label="Saídas" value={formatBRL(r.expenses)} />
        <Stat label="Resultado" value={formatBRL(r.income - r.expenses)} />
      </div>

      <Card title="Por barbeiro">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Barbeiro</th><th className={styles.num}>Comandas</th><th className={styles.num}>Faturado</th></tr>
            </thead>
            <tbody>
              {r.byBarber.map((b) => (
                <tr key={b.name}>
                  <td>{b.name}</td>
                  <td className={styles.num}>{b.comandas}</td>
                  <td className={styles.num}><Money cents={b.revenue} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>Comissão fica para a versão 2. Os dados já são guardados.</Note>
      </Card>

      <Card title="Por forma de pagamento">
        <ul className={styles.list}>
          {(Object.keys(r.byMethod) as PaymentMethod[]).map((m) => (
            <li key={m} className={styles.row}>
              <span>{paymentMethodLabel[m]}</span>
              <Money cents={r.byMethod[m]} />
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Serviços mais vendidos">
        <ul className={styles.list}>
          {r.topServices.map((s) => (
            <li key={s.name} className={styles.row}>
              <span>{s.name}</span>
              <span>{s.count}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export default function ReportsPage() {
  return (
    <OwnerOnly>
      <ReportsPageContent />
    </OwnerOnly>
  );
}
