import { loadClientOptions } from "@/modules/clients/api/queries";
import { read } from "@/server/run";
import { loadWorld } from "@/server/lookups";
import { addDaysYmd, isValidYmd, localYmd } from "@/shared/time";
import { ScheduleForm } from "./schedule-form";

export default async function NewAppointmentPage(props: PageProps<"/agenda/nova">) {
  const search = await props.searchParams;
  const requested = typeof search.data === "string" ? search.data : "";
  const clients = await loadClientOptions();
  const world = await read(async (tx, ctx) => {
    const w = await loadWorld(tx);
    return { barbers: w.employees.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name })), me: ctx, today: localYmd(w.now, w.timeZone) };
  });
  // Coming from a day of the calendar: that day is already chosen (today and tomorrow keep their own buttons).
  const initialDate = isValidYmd(requested) && requested >= world.today ? requested : "";
  const initialDay = initialDate === "" || initialDate === addDaysYmd(world.today, 1) ? "amanha" : initialDate === world.today ? "hoje" : "outro";
  return (
    <ScheduleForm
      initialDay={initialDay}
      initialDate={initialDay === "outro" ? initialDate : ""}
      minDate={world.today}
      role={world.me.role}
      currentBarberId={world.me.userId}
      barbers={world.barbers}
      // Names only: a barber never needs the phone number to book a client (decision B).
      clients={clients.map(({ id, name }) => ({ id, name }))}
    />
  );
}
