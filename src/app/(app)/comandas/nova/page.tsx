import { ButtonLink, Card, Note, PageHeader, styles } from "@/components/ui";
import { clients, employees } from "@/prototype/mock-data";

export default function NewComandaPage() {
  const barbers = employees.filter((e) => e.active);

  return (
    <>
      <PageHeader title="Nova comanda" />

      <Card title="1. Cliente">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="client-search">Buscar por nome ou telefone</label>
          <input id="client-search" className={styles.input} placeholder="Ex.: André ou 98888" />
        </div>
        <ul className={styles.list}>
          {clients.slice(0, 3).map((c) => (
            <li key={c.id} className={styles.row}>
              <span className={styles.rowMain}>
                <span>{c.name}</span>
                <span className={styles.rowMeta}>{c.phone}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className={styles.buttonGrid}>
          <ButtonLink href="/comandas/1027" variant="secondary">Cliente avulso</ButtonLink>
          <ButtonLink href="/clientes" variant="secondary">+ Cadastrar</ButtonLink>
        </div>
        <Note>Cliente é opcional: &quot;avulso&quot; abre a comanda sem cadastro.</Note>
      </Card>

      <Card title="2. Barbeiro">
        <div className={styles.buttonGrid}>
          {barbers.map((b) => (
            <ButtonLink key={b.id} href="/comandas/1027" variant="secondary">{b.name}</ButtonLink>
          ))}
        </div>
        <Note>Quem está logado já vem selecionado. Cada item pode ter outro barbeiro.</Note>
      </Card>

      <ButtonLink href="/comandas/1027" block>Abrir comanda</ButtonLink>
    </>
  );
}
