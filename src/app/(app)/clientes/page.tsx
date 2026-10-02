import Link from "next/link";
import { Badge, ButtonLink, Card, PageHeader, styles } from "@/components/ui";
import { clients } from "@/prototype/mock-data";
import { getDemoRole } from "@/prototype/demo-role";

const AWAY_AFTER_DAYS = 30;

export default async function ClientsPage() {
  const isOwner = (await getDemoRole()) === "owner";
  return (
    <>
      <PageHeader title="Clientes" action={<ButtonLink href="/clientes">+ Novo cliente</ButtonLink>} />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="search">Buscar</label>
        <input id="search" className={styles.input} placeholder="Nome ou telefone" />
      </div>
      <Card>
        <ul className={styles.list}>
          {clients.map((c) => (
            <li key={c.id}>
              <Link href={`/clientes/${c.id}`} className={styles.row}>
                <span className={styles.rowMain}>
                  <span>{c.name}</span>
                  <span className={styles.rowMeta}>{isOwner && `${c.phone} · `}última visita há {c.lastVisitDaysAgo} dias</span>
                </span>
                {c.lastVisitDaysAgo > AWAY_AFTER_DAYS && <Badge tone="warning">Sumido</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
