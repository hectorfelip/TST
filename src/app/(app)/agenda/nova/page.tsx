import { clients, employees } from "@/prototype/mock-data";
import { DEMO_BARBER_ID, getDemoRole } from "@/prototype/demo-role";
import { ScheduleForm } from "./schedule-form";

export default async function NewAppointmentPage() {
  const role = await getDemoRole();
  return (
    <ScheduleForm
      role={role}
      currentBarberId={DEMO_BARBER_ID}
      barbers={employees.filter((e) => e.active).map(({ id, name }) => ({ id, name }))}
      // Names only: a barber never needs the phone number to book a client (decision B).
      clients={clients.map(({ id, name }) => ({ id, name }))}
    />
  );
}
