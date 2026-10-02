import { notFound } from "next/navigation";
import { Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { ConfirmForm } from "@/components/confirm-form";
import { anonymizeClientAction, updateClientAction } from "@/modules/clients/api/actions";
import { loadClientPage } from "@/modules/clients/api/queries";
import { ClientForm } from "../client-form";

export default async function ClientPage(props: PageProps<"/clientes/[id]">) {
  const { id } = await props.params;
  const client = await loadClientPage(id);
  if (client.kind === "missing") notFound();

  return (
    <>
      <PageHeader title={client.name} subtitle={client.phone ?? undefined} />

      <Card title="Resumo">
        <p>
          {client.visitCount} {client.visitCount === 1 ? "visita" : "visitas"}
          {client.lastVisitDays !== null && ` · última há ${client.lastVisitDays} ${client.lastVisitDays === 1 ? "dia" : "dias"}`}
          {client.noShowCount > 0 && ` · ${client.noShowCount} falta(s) em agendamentos`}
        </p>
        {client.notes && <Note>{client.notes}</Note>}
      </Card>

      <Card title="Histórico">
        {client.visits.length === 0 ? (
          <p className={styles.rowMeta}>{client.isOwner ? "Nenhum atendimento pago ainda." : "Você ainda não atendeu este cliente."}</p>
        ) : (
          <ul className={styles.list}>
            {client.visits.map((v) => (
              <li key={v.id} className={styles.row}>
                <span className={styles.rowMain}>
                  <span>{v.description}</span>
                  <span className={styles.rowMeta}>{v.when} · {v.barberName}</span>
                </span>
                <Money cents={v.amount} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {client.isOwner && !client.anonymized && (
        <>
          <Card title="Editar dados">
            <ClientForm action={updateClientAction} submitLabel="Salvar" clientId={client.id} initial={{ name: client.name, phone: client.phone ?? "", notes: client.notes ?? "" }} />
          </Card>
          <ConfirmForm
            action={anonymizeClientAction}
            fields={{ clientId: client.id }}
            variant="danger"
            label="Excluir dados do cliente (LGPD)"
            question={`Apagar o nome, o telefone e as observações de ${client.name}? Isso não pode ser desfeito. O histórico financeiro continua, sem nome.`}
            confirmLabel="Sim, apagar os dados"
          />
          <Note>O histórico financeiro continua, mas nome e telefone são apagados.</Note>
        </>
      )}
    </>
  );
}
