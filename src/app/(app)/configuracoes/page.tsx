import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui";
import { loadSettingsPage } from "@/modules/barbershops/api/queries";
import { requireAction } from "@/server/auth";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  if (!(await requireAction("settings.manage"))) return <NoAccess />;
  const s = await loadSettingsPage();
  return (
    <>
      <PageHeader title="Configurações" subtitle="Cada barbearia escolhe o seu jeito" />
      <SettingsForm initialEnabled={s.autoCancelPending} initialDays={s.pendingExpiryDays} pending={s.pending} />
    </>
  );
}
