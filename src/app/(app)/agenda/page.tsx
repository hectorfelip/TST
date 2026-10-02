import { ButtonLink, Card, Note, PageHeader } from "@/components/ui";
import { AgendaList } from "@/prototype/agenda-list";
import { DEMO_BARBER_ID, getDemoRole } from "@/prototype/demo-role";
import { agendaOf } from "@/prototype/mock-data";

export default async function AgendaPage() {
  const role = await getDemoRole();
  const barberId = role === "barber" ? DEMO_BARBER_ID : null;
  const today = agendaOf("hoje", barberId);
  const tomorrow = agendaOf("amanha", barberId);

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={role === "owner" ? "Todos os barbeiros" : "Seus clientes marcados"}
        action={<ButtonLink href="/agenda/nova">+ Agendar</ButtonLink>}
      />
      <Card title={`Hoje (${today.length})`}>
        <AgendaList items={today} showBarber={role === "owner"} empty="Nenhum cliente marcado para hoje." />
      </Card>
      <Card title={`Amanhã (${tomorrow.length})`}>
        <AgendaList items={tomorrow} showBarber={role === "owner"} empty="Nenhum cliente marcado para amanhã." />
      </Card>
      <Note>
        Quem não aparece sai desta lista com &quot;Cliente não compareceu&quot; (dentro da comanda). A falta fica registrada; não é
        cancelamento.
      </Note>
    </>
  );
}
