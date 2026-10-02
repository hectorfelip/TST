import { PageHeader } from "@/components/ui";
import { loadClientOptions } from "@/modules/clients/api/queries";
import { NewComandaPicker } from "./new-comanda-picker";

export default async function NewComandaPage() {
  // Phones are sent only when the person is the owner (decision B): for a barber the list has names only.
  const clients = await loadClientOptions();
  return (
    <>
      <PageHeader title="Nova comanda" />
      <NewComandaPicker clients={clients} />
    </>
  );
}
