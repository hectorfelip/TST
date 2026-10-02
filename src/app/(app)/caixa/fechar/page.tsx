import { PageHeader } from "@/components/ui";
import { cashRegister, comandas, expectedCashInDrawer } from "@/prototype/mock-data";
import { OwnerOnly } from "@/prototype/owner-only";
import { CloseCashFlow } from "./close-cash-flow";

export default function CloseCashPage() {
  return (
    <OwnerOnly>
      <PageHeader title="Fechar caixa" subtitle={`Aberto às ${cashRegister.openedAt} por ${cashRegister.openedBy}`} />
      <CloseCashFlow
        expected={expectedCashInDrawer(cashRegister.movements)}
        openComandas={comandas.filter((c) => c.status === "aberta").length}
      />
    </OwnerOnly>
  );
}
