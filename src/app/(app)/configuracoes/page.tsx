import { PageHeader } from "@/components/ui";
import { comandas, clientName } from "@/prototype/mock-data";
import { getDemoPending } from "@/prototype/demo-settings";
import { OwnerOnly } from "@/prototype/owner-only";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { enabled, days } = await getDemoPending();
  const pending = comandas
    .filter((c) => c.pendingDaysAgo !== undefined)
    .map((c) => ({ number: c.number, client: clientName(c.clientId), daysAgo: c.pendingDaysAgo ?? 0 }));

  return (
    <OwnerOnly>
      <PageHeader title="Configurações" subtitle="Cada barbearia escolhe o seu jeito" />
      <SettingsForm initialEnabled={enabled} initialDays={days} pending={pending} />
    </OwnerOnly>
  );
}
