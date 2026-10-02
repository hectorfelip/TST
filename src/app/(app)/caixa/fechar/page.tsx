import { NoAccess } from "@/components/no-access";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { loadCloseCash } from "@/modules/service-orders/api/queries";
import { requireAction } from "@/server/auth";
import { CloseCashFlow } from "./close-cash-flow";

export default async function CloseCashPage() {
  if (!(await requireAction("cash.close"))) return <NoAccess />;
  const page = await loadCloseCash();
  if (page.kind === "no_register") {
    return (
      <Card title="Não há caixa aberto">
        <p>Só é possível fechar um caixa que está aberto.</p>
        <ButtonLink href="/caixa" variant="secondary">Voltar</ButtonLink>
      </Card>
    );
  }
  return (
    <>
      <PageHeader title="Fechar caixa" subtitle={`Aberto às ${page.openedLabel}`} />
      <CloseCashFlow expected={page.expected} entries={page.entries} expiryDays={page.expiryDays} />
    </>
  );
}
