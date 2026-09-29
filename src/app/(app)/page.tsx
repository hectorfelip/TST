import Link from "next/link";
import { Badge, ButtonLink, Card, Money, PageHeader, Stat, styles } from "@/components/ui";
import { formatBRL } from "@/shared/money";
import {
  barberRevenue,
  cashRegister,
  clientName,
  comandas,
  comandaTotal,
  isComandaOf,
  products,
  type Comanda,
} from "@/prototype/mock-data";
import { DEMO_BARBER_ID, getDemoRole } from "@/prototype/demo-role";

function OpenComandas({ list }: { list: Comanda[] }) {
  if (list.length === 0) return <p className={styles.rowMeta}>Nenhuma comanda aberta.</p>;
  return (
    <ul className={styles.list}>
      {list.map((c) => (
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
  );
}

const newComandaButton = <ButtonLink href="/comandas/nova">+ Nova comanda</ButtonLink>;
const today = "Hoje, terça-feira 29/09";

function BarberDashboard() {
  const mine = comandas.filter((c) => isComandaOf(c, DEMO_BARBER_ID));
  const closed = mine.filter((c) => c.status === "fechada");
  const open = mine.filter((c) => c.status === "aberta");
  const revenue = closed.reduce((sum, c) => sum + barberRevenue(c, DEMO_BARBER_ID), 0);

  return (
    <>
      <PageHeader title="Meu dia" subtitle={today} action={newComandaButton} />
      <div className={styles.stats}>
        <Stat label="Meu faturamento hoje" value={formatBRL(revenue)} />
        <Stat label="Atendimentos fechados" value={String(closed.length)} />
      </div>
      <Card title="Minhas comandas abertas">
        <OpenComandas list={open} />
      </Card>
    </>
  );
}

function OwnerDashboard() {
  const closed = comandas.filter((c) => c.status === "fechada");
  const open = comandas.filter((c) => c.status === "aberta");
  const revenue = closed.reduce((sum, c) => sum + comandaTotal(c), 0);
  const lowStock = products.filter((p) => p.stock < p.minStock);

  return (
    <>
      <PageHeader title="Painel" subtitle={today} action={newComandaButton} />

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
        <OpenComandas list={open} />
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

export default async function DashboardPage() {
  return (await getDemoRole()) === "barber" ? <BarberDashboard /> : <OwnerDashboard />;
}
