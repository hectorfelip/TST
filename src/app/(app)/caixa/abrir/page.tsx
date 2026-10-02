import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { loadOpenCashPage } from "@/modules/finance/api/queries";
import { OpenCashFlow } from "./open-cash-flow";

/** Owner OR barber can open the register (R-CSH-01). Closing is owner-only. */
export default async function OpenCashPage() {
  const page = await loadOpenCashPage();
  if (page.alreadyOpen) redirect("/");
  return (
    <>
      <PageHeader title="Abrir caixa" subtitle={`Aberto por ${page.whoLabel}`} />
      <OpenCashFlow leftYesterday={page.leftYesterday} />
    </>
  );
}
