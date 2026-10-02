import { PageHeader } from "@/components/ui";
import { cashRegister, dayCloseEntries, expectedCashInDrawer } from "@/prototype/mock-data";
import { getDemoExpiryDays } from "@/prototype/demo-settings";
import { OwnerOnly } from "@/prototype/owner-only";
import { CloseCashFlow } from "./close-cash-flow";

export default async function CloseCashPage() {
  const expiryDays = await getDemoExpiryDays();
  return (
    <OwnerOnly>
      <PageHeader title="Fechar caixa" subtitle={`Aberto às ${cashRegister.openedAt} por ${cashRegister.openedBy}`} />
      <CloseCashFlow
        expected={expectedCashInDrawer(cashRegister.movements)}
        entries={dayCloseEntries(expiryDays)}
        expiryDays={expiryDays}
      />
    </OwnerOnly>
  );
}
