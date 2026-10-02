import { PageHeader } from "@/components/ui";
import { cashRegister, comandas, comandaTotal, expectedCashInDrawer } from "@/prototype/mock-data";
import { OwnerOnly } from "@/prototype/owner-only";
import { CloseCashFlow } from "./close-cash-flow";

export default function CloseCashPage() {
  const open = comandas.filter((c) => c.status === "aberta");
  const withItems = open.filter((c) => c.items.length > 0);
  return (
    <OwnerOnly>
      <PageHeader title="Fechar caixa" subtitle={`Aberto às ${cashRegister.openedAt} por ${cashRegister.openedBy}`} />
      <CloseCashFlow
        expected={expectedCashInDrawer(cashRegister.movements)}
        emptyComandas={open.length - withItems.length}
        pendingComandas={withItems.map((c) => ({ number: c.number, total: comandaTotal(c) }))}
      />
    </OwnerOnly>
  );
}
