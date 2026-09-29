import { notFound } from "next/navigation";
import { Badge, ButtonLink, Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { clientName, comandas, comandaTotal, employeeName, products, services } from "@/prototype/mock-data";

const statusLabel = { aberta: "Aberta", fechada: "Fechada", cancelada: "Cancelada" } as const;

export default async function ComandaPage(props: PageProps<"/comandas/[id]">) {
  const { id } = await props.params;
  const comanda = comandas.find((c) => c.id === id);
  if (!comanda) notFound();

  const isOpen = comanda.status === "aberta";
  const favorites = services.filter((s) => s.favorite && s.active);
  const forSale = products.filter((p) => p.use === "venda");

  return (
    <>
      <PageHeader
        title={`Comanda #${comanda.number}`}
        subtitle={`${clientName(comanda.clientId)} · aberta às ${comanda.openedAt}`}
        action={<Badge tone={isOpen ? "ok" : "neutral"}>{statusLabel[comanda.status]}</Badge>}
      />

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

          <ButtonLink href={`/comandas/${comanda.id}/fechar`} block>Fechar comanda</ButtonLink>
          <ButtonLink href="/comandas" variant="danger" block>Cancelar comanda</ButtonLink>
          <Note>Cancelar pede um motivo. Comanda já paga só o dono pode cancelar.</Note>
        </>
      )}
    </>
  );
}
