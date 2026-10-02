import { clients, comandas, employees, products, services } from "@/prototype/mock-data";
import { getDemoRole, getDemoUserId } from "@/prototype/demo-role";
import { NewComandaFlow } from "./new-comanda-flow";

export default async function NewComandaPage() {
  const nextNumber = Math.max(...comandas.map((c) => c.number)) + 1;
  const role = await getDemoRole();
  const currentUserId = await getDemoUserId();

  return (
    <NewComandaFlow
      number={nextNumber}
      role={role}
      currentUserId={currentUserId}
      barbers={employees.filter((e) => e.active).map(({ id, name }) => ({ id, name }))}
      clients={clients.map(({ id, name, phone }) => ({ id, name, phone }))}
      services={services.filter((s) => s.favorite && s.active)}
      products={products.filter((p) => p.use === "venda")}
    />
  );
}
