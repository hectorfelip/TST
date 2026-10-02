import { AgendaList } from "@/components/agenda-list";
import { ButtonLink, Card, Note, PageHeader } from "@/components/ui";
import { loadBoard } from "@/modules/service-orders/api/queries";

export default async function AgendaPage() {
  const board = await loadBoard();
  const isOwner = board.role === "owner";
  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={isOwner ? "Todos os barbeiros" : "Seus clientes marcados"}
        action={<ButtonLink href="/agenda/nova">+ Agendar</ButtonLink>}
      />
      <Card title={`Hoje (${board.agendaToday.length})`}>
        <AgendaList items={board.agendaToday} showBarber={isOwner} empty="Nenhum cliente marcado para hoje." />
      </Card>
      <Card title={`Amanhã (${board.agendaTomorrow.length})`}>
        <AgendaList items={board.agendaTomorrow} showBarber={isOwner} empty="Nenhum cliente marcado para amanhã." />
      </Card>
      <Note>
        Quem não aparece sai desta lista com &quot;Cliente não compareceu&quot; (dentro da comanda). A falta fica registrada; não é
        cancelamento.
      </Note>
    </>
  );
}
