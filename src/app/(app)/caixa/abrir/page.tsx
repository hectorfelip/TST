import { PageHeader } from "@/components/ui";
import { DEMO_BARBER_ID, getDemoRole } from "@/prototype/demo-role";
import { employeeName } from "@/prototype/mock-data";
import { OpenCashFlow } from "./open-cash-flow";

/** Owner OR barber can open the register (R-CSH-01). Closing is owner-only. */
export default async function OpenCashPage() {
  const role = await getDemoRole();
  return (
    <>
      <PageHeader title="Abrir caixa" subtitle={role === "barber" ? `Aberto por ${employeeName(DEMO_BARBER_ID)}` : "Aberto por Carlos"} />
      <OpenCashFlow leftYesterday={10000} />
    </>
  );
}
