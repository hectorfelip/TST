import Link from "next/link";
import { Badge, ButtonLink, Card, Money, PageHeader, styles } from "@/components/ui";
import { clientName, comandas, comandaTotal, employeeName, isComandaOf, paymentMethodLabel, type Comanda } from "@/prototype/mock-data";
import { DEMO_BARBER_ID, getDemoRole } from "@/prototype/demo-role";

function barbersOf(comanda: Comanda): string {
  const names = new Set(comanda.items.map((i) => employeeName(i.barberId)));
  return names.size ? [...names].join(", ") : "Sem itens";
}

function ComandaRow({ comanda }: { comanda: Comanda }) {
  return (
    <li>
      <Link href={`/comandas/${comanda.id}`} className={styles.row}>
        <span className={styles.rowMain}>
          <span>#{comanda.number} · {clientName(comanda.clientId)}</span>
          <span className={styles.rowMeta}>
            {comanda.openedAt} · {barbersOf(comanda)}
            {comanda.payment && ` · ${paymentMethodLabel[comanda.payment]}`}
          </span>
        </span>
        <span>
          {comanda.status === "cancelada" ? <Badge tone="warning">Cancelada</Badge> : <strong><Money cents={comandaTotal(comanda)} /></strong>}
        </span>
      </Link>
    </li>
  );
}

export default async function ComandasPage() {
  const role = await getDemoRole();
  const visible = role === "owner" ? comandas : comandas.filter((c) => isComandaOf(c, DEMO_BARBER_ID));
  const open = visible.filter((c) => c.status === "aberta");
  const done = visible.filter((c) => c.status !== "aberta");

  return (
    <>
      <PageHeader title="Comandas" subtitle={role === "owner" ? "Hoje · todas" : "Hoje · só as minhas"} action={<ButtonLink href="/comandas/nova">+ Nova comanda</ButtonLink>} />
      <Card title={`Abertas (${open.length})`}>
        <ul className={styles.list}>{open.map((c) => <ComandaRow key={c.id} comanda={c} />)}</ul>
      </Card>
      <Card title={`Fechadas e canceladas (${done.length})`}>
        <ul className={styles.list}>{done.map((c) => <ComandaRow key={c.id} comanda={c} />)}</ul>
      </Card>
    </>
  );
}
