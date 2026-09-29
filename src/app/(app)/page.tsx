import { ButtonLink, Badge, Card, Money, PageHeader, Stat, styles } from "@/components/ui";
import { formatBRL } from "@/shared/money";
import { cashRegister, clientName, comandas, comandaTotal, products } from "@/prototype/mock-data";
import Link from "next/link";

export default function DashboardPage() {
  const closed = comandas.filter((c) => c.status === "fechada");
  const open = comandas.filter((c) => c.status === "aberta");
  const revenue = closed.reduce((sum, c) => sum + comandaTotal(c), 0);
  const lowStock = products.filter((p) => p.stock < p.minStock);

  return (
    <>
      <PageHeader
        title="Painel"
        subtitle="Hoje, terça-feira 29/09"
        action={<ButtonLink href="/comandas/nova">+ Nova comanda</ButtonLink>}
      />

      <div className={styles.stats}>
        <Stat label="Faturado hoje" value={formatBRL(revenue)} />
        <Stat label="Comandas abertas" value={String(open.length)} />
        <Stat label="Atendimentos fechados" value={String(closed.length)} />
        <Stat label="Ticket médio" value={formatBRL(closed.length ? Math.round(revenue / closed.length) : 0)} />
      </div>

      <Card title="Caixa">
        <p>
          <Badge tone="ok">Aberto</Badge> desde {cashRegister.openedAt} por {cashRegister.openedBy}
        </p>
        <ButtonLink href="/caixa" variant="secondary">Ver caixa</ButtonLink>
      </Card>

      <Card title="Comandas abertas">
        <ul className={styles.list}>
          {open.map((c) => (
            <li key={c.id}>
              <Link href={`/comandas/${c.id}`} className={styles.row}>
                <span className={styles.rowMain}>
                  <span>#{c.number} · {clientName(c.clientId)}</span>
                  <span className={styles.rowMeta}>Aberta às {c.openedAt} · {c.items.length} itens</span>
                </span>
                <strong><Money cents={comandaTotal(c)} /></strong>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Estoque baixo">
        {lowStock.length === 0 ? (
          <p className={styles.rowMeta}>Nenhum produto abaixo do mínimo.</p>
        ) : (
          <ul className={styles.list}>
            {lowStock.map((p) => (
              <li key={p.id} className={styles.row}>
                <span>{p.name}</span>
                <Badge tone="warning">{p.stock} un. (mín. {p.minStock})</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
