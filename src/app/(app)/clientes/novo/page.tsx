import { Card, Note, PageHeader } from "@/components/ui";
import { ClientForm } from "../client-form";
import { createClientAction } from "@/modules/clients/api/actions";

export default function NewClientPage() {
  return (
    <>
      <PageHeader title="Novo cliente" subtitle="Cadastro rápido: só o nome é obrigatório" />
      <Card>
        <ClientForm action={createClientAction} submitLabel="Cadastrar cliente" />
      </Card>
      <Note>O telefone não pode ser o mesmo de outro cliente. Barbeiros cadastram, mas só o dono vê os telefones.</Note>
    </>
  );
}
