import Link from "next/link";
import { Badge, ButtonLink, Card, Money, PageHeader, styles } from "@/components/ui";
import { loadBoard } from "@/modules/service-orders/api/queries";
import type { ComandaView } from "@/modules/service-orders/api/views";

const methodLabel = { cash: "Dinheiro", pix: "Pix", debit: "Débito", credit: "Crédito" } as const;

function ComandaRow({ comanda }: { comanda: ComandaView }) {
  return (
    <li>
      <Link href={`/comandas/${comanda.id}`} className={styles.row}>
        <span className={styles.rowMain}>
          <span>#{comanda.number} · {comanda.clientName}</span>
          <span className={styles.rowMeta}>
            {comanda.appointment ? `Agendado ${comanda.appointment.label}` : comanda.openedAtLabel} · {comanda.barbersLabel}
            {comanda.paymentMethod && ` · ${methodLabel[comanda.paymentMethod]}`}
          </span>
        </span>
        <span>
          {comanda.status === "cancelled" ? (
            <Badge tone="warning">Cancelada</Badge>
          ) : comanda.status === "no_show" ? (
            <Badge tone="warning">Não compareceu</Badge>
          ) : comanda.pending ? (
            <Badge tone="warning">Pendente{comanda.pending.daysLeft !== null && ` · ${comanda.pending.daysLeft}d`}</Badge>
          ) : (
            <strong><Money cents={comanda.total} /></strong>
          )}
        </span>
      </Link>
    </li>
  );
}

export default async function ComandasPage() {
  const board = await loadBoard();
  return (
    <>
      <PageHeader
        title="Comandas"
        subtitle={board.role === "owner" ? "Hoje · todas" : "Hoje · só as minhas"}
        action={<ButtonLink href="/comandas/nova">+ Nova comanda</ButtonLink>}
      />
      <Card title={`Abertas (${board.open.length})`}>
        {board.open.length === 0 ? <p className={styles.rowMeta}>Nenhuma comanda aberta.</p> : <ul className={styles.list}>{board.open.map((c) => <ComandaRow key={c.id} comanda={c} />)}</ul>}
      </Card>
      <Card title={`Fechadas, canceladas e faltas (${board.done.length})`}>
        {board.done.length === 0 ? <p className={styles.rowMeta}>Nada fechado hoje ainda.</p> : <ul className={styles.list}>{board.done.map((c) => <ComandaRow key={c.id} comanda={c} />)}</ul>}
      </Card>
    </>
  );
}
