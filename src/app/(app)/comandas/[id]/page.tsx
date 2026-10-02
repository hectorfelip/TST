import { notFound } from "next/navigation";
import { Badge, ButtonLink, Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { ConfirmAction } from "@/components/confirm-action";
import {
  appointmentLabel,
  appointmentTimePassed,
  clientName,
  comandas,
  comandaTotal,
  employeeName,
  isComandaOf,
  PENDING_EXPIRY_DAYS,
  products,
  services,
} from "@/prototype/mock-data";
import { DEMO_BARBER_ID, getDemoRole } from "@/prototype/demo-role";
import { NoAccess } from "@/prototype/owner-only";

const statusLabel = { aberta: "Aberta", fechada: "Fechada", cancelada: "Cancelada", nao_compareceu: "Não compareceu" } as const;

export default async function ComandaPage(props: PageProps<"/comandas/[id]">) {
  const { id } = await props.params;
  const comanda = comandas.find((c) => c.id === id);
  if (!comanda) notFound();
  const role = await getDemoRole();
  if (role === "barber" && !isComandaOf(comanda, DEMO_BARBER_ID)) return <NoAccess />;

  const isOpen = comanda.status === "aberta";
  const isEmpty = comanda.items.length === 0;
  const pendingLeft = comanda.pendingDaysAgo === undefined ? null : Math.max(0, PENDING_EXPIRY_DAYS - comanda.pendingDaysAgo);
  const favorites = services.filter((s) => s.favorite && s.active);
  const forSale = products.filter((p) => p.use === "venda");

  return (
    <>
      <PageHeader
        title={`Comanda #${comanda.number}`}
        subtitle={`${clientName(comanda.clientId)} · aberta ${comanda.openedAt}`}
        action={<Badge tone={isOpen ? "ok" : comanda.status === "nao_compareceu" ? "warning" : "neutral"}>{statusLabel[comanda.status]}</Badge>}
      />

      {comanda.appointment && (
        <Card>
          <p>
            <strong>Agendado: {appointmentLabel(comanda)}</strong> · com {employeeName(comanda.appointment.barberId)}
          </p>
        </Card>
      )}
      {pendingLeft !== null && (
        <Card>
          <p>
            <Badge tone="warning">Pendente · vence em {pendingLeft} {pendingLeft === 1 ? "dia" : "dias"}</Badge>
          </p>
          <Note>Se não for paga até lá, é cancelada automaticamente. Para receber, use &quot;Fechar comanda&quot;.</Note>
        </Card>
      )}
      {comanda.status === "nao_compareceu" && (
        <Note>Marcada como não compareceu. Isso não é um cancelamento: a falta fica registrada e o dono confere no fechamento do caixa.</Note>
      )}

      <Card title="Itens">
        {comanda.items.length === 0 ? (
          <p className={styles.rowMeta}>Nenhum item ainda. Toque em um serviço abaixo para adicionar.</p>
        ) : (
          <ul className={styles.list}>
            {comanda.items.map((item, index) => (
              <li key={index} className={styles.row}>
                <span className={styles.rowMain}>
                  <span>{item.name}</span>
                  <span className={styles.rowMeta}>{item.kind === "servico" ? "Serviço" : "Produto"} · {employeeName(item.barberId)}</span>
                </span>
                <strong><Money cents={item.price} /></strong>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.total}>
          <span>Total</span>
          <Money cents={comandaTotal(comanda)} />
        </div>
      </Card>

      {isOpen && (
        <>
          <Card title="Adicionar serviço">
            <div className={styles.buttonGrid}>
              {favorites.map((s) => (
                <ButtonLink key={s.id} href={`/comandas/${comanda.id}`} variant="secondary" stacked>
                  {s.name}
                  <small><Money cents={s.price} /></small>
                </ButtonLink>
              ))}
            </div>
            <Note>Os serviços favoritos aparecem aqui. Os outros ficam na busca.</Note>
          </Card>

          <Card title="Adicionar produto">
            <div className={styles.buttonGrid}>
              {forSale.map((p) => (
                <ButtonLink key={p.id} href={`/comandas/${comanda.id}`} variant="secondary" stacked>
                  {p.name}
                  <small><Money cents={p.price} /></small>
                </ButtonLink>
              ))}
            </div>
          </Card>

          {!isEmpty && <ButtonLink href={`/comandas/${comanda.id}/fechar`} block>Fechar comanda</ButtonLink>}

          {comanda.appointment && (
            <ConfirmAction
              label="Cliente não compareceu"
              question={`Marcar ${clientName(comanda.clientId)} como não compareceu? A comanda sai da agenda do dia e a falta fica registrada. Não é um cancelamento.`}
              confirmLabel="Sim, não compareceu"
              doneMessage="Marcada como não compareceu. Saiu da agenda de hoje."
              disabledHint={appointmentTimePassed(comanda) ? undefined : `Só depois do horário agendado (${comanda.appointment.time}).`}
            />
          )}
          {isEmpty && !comanda.appointment && (
            <ConfirmAction
              label="Descartar comanda vazia"
              question="Descartar esta comanda vazia? Não precisa de motivo."
              confirmLabel="Sim, descartar"
              doneMessage="Comanda descartada."
            />
          )}
          {role === "owner" && !isEmpty && (
            <ConfirmAction
              variant="danger"
              label="Cancelar comanda"
              question={`Cancelar a comanda #${comanda.number}? Fica registrado quem cancelou e por quê.`}
              confirmLabel="Sim, cancelar"
              doneMessage="Comanda cancelada."
              reasonRequired
            />
          )}
          {role === "barber" && !isEmpty && (
            <Note>Só o dono cancela. Cliente não veio? Use &quot;Cliente não compareceu&quot;. Lançou um item errado? Remova o seu item.</Note>
          )}
        </>
      )}
    </>
  );
}
