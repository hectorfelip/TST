import { loadClientOptions } from "@/modules/clients/api/queries";
import { read } from "@/server/run";
import { loadWorld } from "@/server/lookups";
import { ScheduleForm } from "./schedule-form";

export default async function NewAppointmentPage() {
  const clients = await loadClientOptions();
  const world = await read(async (tx, ctx) => {
    const w = await loadWorld(tx);
    return { barbers: w.employees.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name })), me: ctx };
  });
  return (
    <ScheduleForm
      role={world.me.role}
      currentBarberId={world.me.userId}
      barbers={world.barbers}
      // Names only: a barber never needs the phone number to book a client (decision B).
      clients={clients.map(({ id, name }) => ({ id, name }))}
    />
  );
}
