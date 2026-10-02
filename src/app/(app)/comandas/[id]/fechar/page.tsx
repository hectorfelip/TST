import { notFound, redirect } from "next/navigation";
import { NoAccess } from "@/components/no-access";
import { Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { loadComandaPage } from "@/modules/service-orders/api/queries";
import { PayForm } from "./pay-form";

export default async function CloseComandaPage(props: PageProps<"/comandas/[id]/fechar">) {
  const { id } = await props.params;
  const page = await loadComandaPage(id);
  if (page.kind === "missing") notFound();
  if (page.kind === "forbidden") return <NoAccess />;
  const { comanda } = page;
  if (comanda.status !== "open") redirect(`/comandas/${comanda.id}`);
  if (comanda.items.length === 0) redirect(`/comandas/${comanda.id}`);

  return (
    <>
      <PageHeader title={`Fechar #${comanda.number}`} subtitle={comanda.clientName} />
      {!page.registerOpen && (
        <Card title="Caixa fechado">
          <p>Abra o caixa antes de receber o pagamento.</p>
          <Note>Qualquer pessoa da equipe pode abrir o caixa.</Note>
          <a className={`${styles.button} ${styles.buttonBlock}`} href="/caixa/abrir">Abrir caixa</a>
        </Card>
      )}
      <Card>
        <div className={styles.total}>
          <span>Total a pagar</span>
          <Money cents={comanda.subtotal} />
        </div>
      </Card>
      <PayForm comandaId={comanda.id} subtotal={comanda.subtotal} isOwner={page.role === "owner"} registerOpen={page.registerOpen} />
    </>
  );
}
