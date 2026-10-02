import { notFound } from "next/navigation";
import { Badge, ButtonLink, Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { ConfirmForm } from "@/components/confirm-form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ItemButtons } from "@/components/item-buttons";
import { NoAccess } from "@/components/no-access";
import { cancelComandaAction, changePaymentMethodAction, discardComandaAction, noShowAction, removeItemAction } from "@/modules/service-orders/api/actions";
import { loadComandaPage } from "@/modules/service-orders/api/queries";
import { expiryText } from "@/modules/service-orders/api/views";
import { requireAuth } from "@/server/auth";

const statusLabel = { open: "Aberta", closed: "Fechada", cancelled: "Cancelada", discarded: "Descartada", no_show: "Não compareceu" } as const;
const methodLabel = { cash: "Dinheiro", pix: "Pix", debit: "Débito", credit: "Crédito" } as const;

export default async function ComandaPage(props: PageProps<"/comandas/[id]">) {
  const { id } = await props.params;
  const search = await props.searchParams;
  const { ctx } = await requireAuth();
  const page = await loadComandaPage(id);
  if (page.kind === "missing") notFound();
  if (page.kind === "forbidden") return <NoAccess />;

  const { comanda, role, canEdit } = page;
  const isOpen = comanda.status === "open";
  const isEmpty = comanda.items.length === 0;
  const isOwner = role === "owner";

  return (
    <>
      <PageHeader
        title={`Comanda #${comanda.number}`}
        subtitle={`${comanda.clientName} · aberta ${comanda.openedAtLabel}`}
        action={<Badge tone={isOpen ? "ok" : comanda.status === "no_show" ? "warning" : "neutral"}>{statusLabel[comanda.status]}</Badge>}
      />

      {search.paga === "1" && comanda.status === "closed" && (
        <Card>
          <p role="status"><strong>✓ Pagamento registrado</strong></p>
          {comanda.paymentChange !== null && comanda.paymentChange > 0 && <p>Troco: <Money cents={comanda.paymentChange} /></p>}
        </Card>
      )}

      {comanda.appointment && (
        <Card>
          <p>
            <strong>Agendado: {comanda.appointment.label}</strong> · com {comanda.appointment.barberName}
          </p>
        </Card>
      )}
      {comanda.pending && (
        <Card>
          <p>
            <Badge tone="warning">Pendente{comanda.pending.daysLeft !== null && ` · ${expiryText(comanda.pending.daysLeft)}`}</Badge>
          </p>
          <Note>
            {comanda.pending.daysLeft !== null
              ? 'Se não for paga até lá, é cancelada automaticamente. Para receber, use "Fechar comanda".'
              : 'Esta barbearia não cancela pendentes sozinha: fica aqui até ser paga ou cancelada pelo dono. Para receber, use "Fechar comanda".'}
          </Note>
        </Card>
      )}
      {comanda.status === "no_show" && (
        <Note>Marcada como não compareceu. Isso não é um cancelamento: a falta fica registrada e o dono confere no fechamento do caixa.</Note>
      )}
      {comanda.status === "cancelled" && comanda.cancellationReason && <Note>Cancelada. Motivo: {comanda.cancellationReason}</Note>}

      <Card title="Itens">
        {isEmpty ? (
          <p className={styles.rowMeta}>Nenhum item ainda.{canEdit ? " Toque em um serviço abaixo para adicionar." : ""}</p>
        ) : (
          <ul className={styles.list}>
            {comanda.items.map((item) => (
              <li key={item.id} className={styles.row}>
                <span className={styles.rowMain}>
                  <span>{item.quantity > 1 && `${item.quantity}× `}{item.name}</span>
                  <span className={styles.rowMeta}>
                    {item.kind === "service" ? "Serviço" : "Produto"} · {item.barberName}
                    {item.soldWithoutStock && " · sem estoque no sistema (confirmado)"}
                  </span>
                </span>
                <span>
                  <strong><Money cents={item.lineTotal} /></strong>
                  {canEdit && (
                    <ActionForm action={removeItemAction}>
                      <input type="hidden" name="comandaId" value={comanda.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <button type="submit" className={styles.iconButton} aria-label={`Remover ${item.name}`}>×</button>
                    </ActionForm>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {comanda.discount > 0 && (
          <div className={styles.row}><span>Desconto</span><span>− <Money cents={comanda.discount} /></span></div>
        )}
        <div className={styles.total}>
          <span>Total</span>
          <Money cents={comanda.total} />
        </div>
        {comanda.paymentMethod && <p className={styles.rowMeta}>Pago em {methodLabel[comanda.paymentMethod]}.</p>}
        {comanda.note && <Note>Observação: {comanda.note}</Note>}
      </Card>

      {isOpen && canEdit && (
        <>
          <ItemButtons
            comandaId={comanda.id}
            barbers={page.barbers}
            defaultBarberId={ctx.userId}
            canPickBarber={isOwner}
            services={page.services}
            products={page.forSale}
          />

          {!isEmpty && (
            <>
              <ButtonLink href={`/comandas/${comanda.id}/fechar`} block>Fechar comanda</ButtonLink>
              {!page.registerOpen && <Note>O caixa está fechado. Abra o caixa para receber o pagamento.</Note>}
            </>
          )}

          {comanda.appointment && (
            <ConfirmForm
              action={noShowAction}
              fields={{ comandaId: comanda.id }}
              label="Cliente não compareceu"
              question={`Marcar ${comanda.clientName} como não compareceu? A comanda sai da agenda do dia e a falta fica registrada. Não é um cancelamento.`}
              confirmLabel="Sim, não compareceu"
              disabledHint={comanda.appointment.timePassed ? undefined : `Só depois do horário agendado (${comanda.appointment.time}).`}
            />
          )}
          {isEmpty && !comanda.appointment && (
            <ConfirmForm
              action={discardComandaAction}
              fields={{ comandaId: comanda.id }}
              label="Descartar comanda vazia"
              question="Descartar esta comanda vazia? Não precisa de motivo."
              confirmLabel="Sim, descartar"
            />
          )}
          {isOwner && !isEmpty && (
            <ConfirmForm
              action={cancelComandaAction}
              fields={{ comandaId: comanda.id }}
              variant="danger"
              label="Cancelar comanda"
              question={`Cancelar a comanda #${comanda.number}? Fica registrado quem cancelou e por quê.`}
              confirmLabel="Sim, cancelar"
              reasonLabel="Motivo"
            />
          )}
          {!isOwner && !isEmpty && (
            <Note>Só o dono cancela. Cliente não veio? Use &quot;Cliente não compareceu&quot;. Lançou um item errado? Remova o seu item.</Note>
          )}
        </>
      )}

      {isOwner && comanda.status === "closed" && (
        <>
          <Card title="Corrigir forma de pagamento">
            <ActionForm action={changePaymentMethodAction} successMessage="Forma de pagamento corrigida.">
              <input type="hidden" name="comandaId" value={comanda.id} />
              <div className={styles.field}>
                <label className={styles.label} htmlFor="method">Forma correta</label>
                <select id="method" name="method" className={styles.input} defaultValue={comanda.paymentMethod ?? "pix"}>
                  {Object.entries(methodLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="why">Motivo (obrigatório)</label>
                <input id="why" name="reason" className={styles.input} placeholder="Ex.: o cliente pagou no Pix, não no dinheiro" />
              </div>
              <SubmitButton variant="secondary">Corrigir</SubmitButton>
            </ActionForm>
            <Note>Só é possível enquanto o caixa do dia está aberto. Depois do fechamento o dia fica selado.</Note>
          </Card>
          <ConfirmForm
            action={cancelComandaAction}
            fields={{ comandaId: comanda.id }}
            variant="danger"
            label="Cancelar comanda paga"
            question={`Cancelar a comanda #${comanda.number} já paga? O dinheiro e os produtos voltam com lançamentos de estorno no caixa atual.`}
            confirmLabel="Sim, cancelar"
            reasonLabel="Motivo"
          />
        </>
      )}
    </>
  );
}
