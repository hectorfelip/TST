import Link from "next/link";
import { AgendaList } from "@/components/agenda-list";
import { ApprovalList } from "@/components/approval-list";
import { MonthCalendar } from "@/components/month-calendar";
import { ButtonLink, Card, Note, PageHeader, styles } from "@/components/ui";
import { loadBoard, loadCalendar } from "@/modules/service-orders/api/queries";

export default async function AgendaPage(props: PageProps<"/agenda">) {
  const search = await props.searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const list = one(search.vista) === "lista";
  return (
    <>
      <PageHeader title="Agenda" action={<ButtonLink href={list ? "/agenda/nova" : `/agenda/nova?data=${one(search.data) ?? ""}`}>+ Agendar</ButtonLink>} />
      <div className={styles.buttonGrid}>
        <Link href="/agenda" className={list ? styles.buttonSecondary : styles.button} aria-current={list ? undefined : "page"}>Calendário</Link>
        <Link href="/agenda?vista=lista" className={list ? styles.button : styles.buttonSecondary} aria-current={list ? "page" : undefined}>Hoje e amanhã</Link>
      </div>
      {list ? <TodayAndTomorrow /> : <CalendarView data={one(search.data)} />}
    </>
  );
}

async function TodayAndTomorrow() {
  const board = await loadBoard();
  const isOwner = board.role === "owner";
  return (
    <>
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

async function CalendarView({ data }: { data: string | undefined }) {
  const cal = await loadCalendar(data);
  const isOwner = cal.role === "owner";
  return (
    <>
      {cal.waiting.length > 0 && (
        <Card title={`Agendamentos online para aprovar (${cal.waiting.length})`}>
          <ApprovalList items={cal.waiting} showBarber={isOwner} />
          <Note>O horário já está reservado enquanto você decide. Recusar libera o horário.</Note>
        </Card>
      )}
      <Card>
        <MonthCalendar title={cal.monthTitle} prevMonth={cal.prevMonth} nextMonth={cal.nextMonth} weeks={cal.weeks} basePath="/agenda" />
        {cal.selected !== cal.today && <Link href="/agenda" className={styles.rowMeta}>Voltar para hoje</Link>}
      </Card>
      <Card title={`${cal.selectedTitle}${cal.selected === cal.today ? " (hoje)" : ""} · ${cal.items.length}`}>
        <AgendaList items={cal.items} showBarber={isOwner} empty="Nenhum cliente marcado para este dia." />
        <ButtonLink href={`/agenda/nova?data=${cal.selected}`} variant="secondary" block>+ Agendar neste dia</ButtonLink>
      </Card>
      <Note>O número em cada dia é quantos clientes estão marcados e ainda não foram atendidos.</Note>
    </>
  );
}
