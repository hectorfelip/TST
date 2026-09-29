import { notFound } from "next/navigation";
import { ButtonLink, Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { clients, comandas, comandaTotal, employeeName } from "@/prototype/mock-data";
import { getDemoRole } from "@/prototype/demo-role";

export default async function ClientPage(props: PageProps<"/clientes/[id]">) {
  const { id } = await props.params;
  const client = clients.find((c) => c.id === id);
  if (!client) notFound();
  const isOwner = (await getDemoRole()) === "owner";

  const history = comandas.filter((c) => c.clientId === client.id && c.status === "fechada");

  return (
    <>
      <PageHeader title={client.name} subtitle={client.phone} action={isOwner && <ButtonLink href={`/clientes/${client.id}`} variant="secondary">Editar</ButtonLink>} />

      <Card title="Resumo">
        <p>{client.visits} visitas · última há {client.lastVisitDaysAgo} dias</p>
        {client.notes && <Note>{client.notes}</Note>}
      </Card>

      <Card title="Histórico">
        {history.length === 0 ? (
          <p className={styles.rowMeta}>Sem atendimentos neste protótipo.</p>
        ) : (
          <ul className={styles.list}>
            {history.map((c) => (
              <li key={c.id} className={styles.row}>
                <span className={styles.rowMain}>
                  <span>{c.items.map((i) => i.name).join(", ")}</span>
                  <span className={styles.rowMeta}>Hoje · {employeeName(c.items[0]?.barberId ?? "")}</span>
                </span>
                <Money cents={comandaTotal(c)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isOwner && (
        <>
          <ButtonLink href="/clientes" variant="danger" block>Excluir dados do cliente (LGPD)</ButtonLink>
          <Note>O histórico financeiro continua, mas nome e telefone são apagados.</Note>
        </>
      )}
    </>
  );
}
