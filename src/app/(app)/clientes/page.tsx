import Link from "next/link";
import { Badge, ButtonLink, Card, PageHeader, styles } from "@/components/ui";
import { loadClientList } from "@/modules/clients/api/queries";

export default async function ClientsPage(props: PageProps<"/clientes">) {
  const search = await props.searchParams;
  const term = typeof search.q === "string" ? search.q : "";
  const { canSeePhone, clients } = await loadClientList(term);
  return (
    <>
      <PageHeader title="Clientes" action={<ButtonLink href="/clientes/novo">+ Novo cliente</ButtonLink>} />
      <form className={styles.field} role="search">
        <label className={styles.label} htmlFor="search">Buscar</label>
        <input id="search" name="q" className={styles.input} placeholder="Nome ou telefone" defaultValue={term} />
      </form>
      <Card>
        {clients.length === 0 ? (
          <p className={styles.rowMeta}>{term ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda."}</p>
        ) : (
          <ul className={styles.list}>
            {clients.map((c) => (
              <li key={c.id}>
                <Link href={`/clientes/${c.id}`} className={styles.row}>
                  <span className={styles.rowMain}>
                    <span>{c.name}</span>
                    <span className={styles.rowMeta}>
                      {canSeePhone && c.phone && `${c.phone} · `}
                      {c.lastVisitDays === null ? "sem visitas ainda" : `última visita há ${c.lastVisitDays} ${c.lastVisitDays === 1 ? "dia" : "dias"}`}
                    </span>
                  </span>
                  {c.away && <Badge tone="warning">Sumido</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
