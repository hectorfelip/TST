import { Card, Note } from "@/components/ui";
import { getDemoRole } from "./demo-role";

/** What a barber sees when opening a screen he is not allowed to see. */
export function NoAccess() {
  return (
    <Card title="Sem acesso">
      <p>Você não tem permissão para ver esta tela.</p>
      <Note>No sistema real, o servidor também recusa o acesso (passo 3).</Note>
    </Card>
  );
}

export async function OwnerOnly({ children }: { children: React.ReactNode }) {
  if ((await getDemoRole()) === "owner") return <>{children}</>;
  return <NoAccess />;
}
