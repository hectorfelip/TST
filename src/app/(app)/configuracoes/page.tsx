import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui";
import { loadSettingsPage } from "@/modules/barbershops/api/queries";
import { requireAction } from "@/server/auth";
import { loadBookingSettingsPage } from "@/modules/booking/api/queries";
import { BookingForm } from "./booking-form";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  if (!(await requireAction("settings.manage"))) return <NoAccess />;
  const s = await loadSettingsPage();
  const booking = await loadBookingSettingsPage();
  return (
    <>
      <PageHeader title="Configurações" subtitle="Cada barbearia escolhe o seu jeito" />
      <BookingForm initial={booking.settings} suggestedSlug={booking.suggestedSlug} bookableBarbers={booking.bookableBarbers} activeServices={booking.activeServices} />
      <SettingsForm initialEnabled={s.autoCancelPending} initialDays={s.pendingExpiryDays} pending={s.pending} />
    </>
  );
}
