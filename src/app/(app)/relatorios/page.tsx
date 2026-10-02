import { NoAccess } from "@/components/no-access";
import { Card, Money, Note, PageHeader, Stat, styles } from "@/components/ui";
import { loadReports } from "@/modules/finance/api/queries";
import type { PaymentMethod } from "@/modules/finance/rules/cash-register";
import { requireAction } from "@/server/auth";
import { formatBRL } from "@/shared/money";

const methodLabel: Record<PaymentMethod, string> = { cash: "Dinheiro", pix: "Pix", debit: "Débito", credit: "Crédito" };

export default async function ReportsPage() {
  if (!(await requireAction("report.view"))) return <NoAccess />;
  const r = await loadReports();

  return (
    <>
      <PageHeader title="Relatórios" subtitle={r.label} />

      <div className={styles.stats}>
        <Stat label="Entradas" value={formatBRL(r.income)} />
        <Stat label="Saídas (despesas)" value={formatBRL(r.expenses)} />
        <Stat label="Resultado" value={formatBRL(r.income - r.expenses)} />
      </div>
      {r.withdrawals > 0 && <Note>Retiradas do caixa no mês: {formatBRL(r.withdrawals)}. Não entram nas saídas: é dinheiro que saiu da gaveta, não despesa.</Note>}

      <Card title="Por barbeiro">
        {r.byBarber.length === 0 ? (
          <p className={styles.rowMeta}>Nenhum atendimento pago neste mês.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Barbeiro</th><th className={styles.num}>Comandas</th><th className={styles.num}>Valor atendido</th></tr>
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
        )}
        <Note>Valor atendido não é comissão a pagar. O cálculo da comissão fica para a versão 2 (os dados já são guardados); até lá, calcule e confira as comissões fora do sistema.</Note>
      </Card>

      <Card title="Por forma de pagamento">
        <ul className={styles.list}>
          {(Object.keys(r.byMethod) as PaymentMethod[]).map((m) => (
            <li key={m} className={styles.row}>
              <span>{methodLabel[m]}</span>
              <Money cents={r.byMethod[m]} />
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Serviços mais vendidos">
        {r.topServices.length === 0 ? (
          <p className={styles.rowMeta}>Nada vendido neste mês ainda.</p>
        ) : (
          <ul className={styles.list}>
            {r.topServices.map((s) => (
              <li key={s.name} className={styles.row}>
                <span>{s.name}</span>
                <span>{s.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
