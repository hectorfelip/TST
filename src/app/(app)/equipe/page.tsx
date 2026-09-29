import { Badge, ButtonLink, Card, PageHeader, styles } from "@/components/ui";
import { employees } from "@/prototype/mock-data";

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Equipe" action={<ButtonLink href="/equipe">+ Adicionar pessoa</ButtonLink>} />
      <Card>
        <ul className={styles.list}>
          {employees.map((e) => (
            <li key={e.id} className={styles.row}>
              <span className={styles.rowMain}>
                <span>{e.name}</span>
                <span className={styles.rowMeta}>{e.role === "owner" ? "Dono" : "Barbeiro"}</span>
              </span>
              {e.active ? <Badge tone="ok">Ativo</Badge> : <Badge>Inativo</Badge>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
