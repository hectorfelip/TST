import { Card, Note } from "./ui";

/** What a person sees when opening a screen their role does not allow. The server refuses the data too: this is only the polite part. */
export function NoAccess() {
  return (
    <Card title="Sem acesso">
      <p>Você não tem permissão para ver esta tela.</p>
      <Note>Se precisar dela, peça ao dono da barbearia.</Note>
    </Card>
  );
}
