import Link from "next/link";
import { AgendaList } from "@/components/agenda-list";
import { Badge, ButtonLink, Card, Money, Note, PageHeader, Stat, styles } from "@/components/ui";
import { expiryText, type ComandaView } from "@/modules/service-orders/api/views";
import { loadDashboard } from "@/modules/service-orders/api/queries";
import { formatBRL } from "@/shared/money";

function OpenComandas({ list }: { list: ComandaView[] }) {
  if (list.length === 0) return <p className={styles.rowMeta}>Nenhuma comanda aberta.</p>;
  return (
    <ul className={styles.list}>
      {list.map((c) => (
        <li key={c.id}>
          <Link href={`/comandas/${c.id}`} className={styles.row}>
            <span className={styles.rowMain}>
              <span>#{c.number} · {c.clientName}</span>
              <span className={styles.rowMeta}>Aberta · {c.openedAtLabel} · {c.items.length} {c.items.length === 1 ? "item" : "itens"}</span>
            </span>
            <strong><Money cents={c.total} /></strong>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const newComandaButton = <ButtonLink href="/comandas/nova">+ Nova comanda</ButtonLink>;

export default async function DashboardPage() {
  const d = await loadDashboard();

  if (d.role === "barber") {
    return (
      <>
        <PageHeader title="Meu dia" subtitle={`Hoje, ${d.title}`} action={newComandaButton} />
        <div className={styles.stats}>
          <Stat label="Valor dos meus atendimentos hoje" value={formatBRL(d.revenue)} />
          <Stat label="Atendimentos fechados" value={String(d.closedCount)} />
        </div>
        <Note>Este valor não é a sua comissão. O cálculo da comissão chega numa próxima versão.</Note>
        <Card title="Clientes marcados hoje">
          <AgendaList items={d.agendaToday} showBarber={false} empty="Ninguém marcado para hoje." />
        </Card>
        <Card title="Clientes marcados amanhã">
          <AgendaList items={d.agendaTomorrow} showBarber={false} empty="Ninguém marcado para amanhã." />
        </Card>
        <Card title="Minhas comandas abertas">
          <OpenComandas list={d.open} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Painel" subtitle={`Hoje, ${d.title}`} action={newComandaButton} />

      <div className={styles.stats}>
        <Stat label="Faturado hoje" value={formatBRL(d.revenue)} />
        <Stat label="Comandas abertas" value={String(d.open.length)} />
        <Stat label="Atendimentos fechados" value={String(d.closedCount)} />
        <Stat label="Ticket médio" value={formatBRL(d.averageTicket)} />
      </div>

      <Card title="Caixa">
        {d.register ? (
          <>
            <p>
              <Badge tone="ok">Aberto</Badge> desde {d.register.openedAtLabel} por {d.register.openedBy}
            </p>
            <ButtonLink href="/caixa" variant="secondary">Ver caixa</ButtonLink>
          </>
        ) : (
          <>
            <p><Badge tone="warning">Fechado</Badge> Abra o caixa para receber pagamentos.</p>
            <ButtonLink href="/caixa/abrir">Abrir caixa</ButtonLink>
          </>
        )}
      </Card>

      <Card title={`Agenda de hoje (${d.agendaToday.length})`}>
        <AgendaList items={d.agendaToday} showBarber empty="Ninguém marcado para hoje." />
        <ButtonLink href="/agenda" variant="secondary">Ver agenda completa</ButtonLink>
      </Card>

      {d.pending.length > 0 && (
        <Card title="Pendentes sem pagamento">
          <ul className={styles.list}>
            {d.pending.map((c) => (
              <li key={c.id}>
                <Link href={`/comandas/${c.id}`} className={styles.row}>
                  <span className={styles.rowMain}>
                    <span>#{c.number} · {c.clientName}</span>
                    <span className={styles.rowMeta}>
                      {c.pending?.daysLeft != null
                        ? `${expiryText(c.pending.daysLeft)}, depois é cancelada`
                        : "Sem prazo: espera ser paga ou cancelada pelo dono"}
                    </span>
                  </span>
                  <strong><Money cents={c.total} /></strong>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Comandas abertas">
        <OpenComandas list={d.open} />
      </Card>

      <Card title="Estoque baixo">
        {d.lowStock.length === 0 ? (
          <p className={styles.rowMeta}>Nenhum produto abaixo do mínimo.</p>
        ) : (
          <ul className={styles.list}>
            {d.lowStock.map((p) => (
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
