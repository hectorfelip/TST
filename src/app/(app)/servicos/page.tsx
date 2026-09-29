import { Badge, ButtonLink, Card, Money, PageHeader, styles } from "@/components/ui";
import { services } from "@/prototype/mock-data";
import { OwnerOnly } from "@/prototype/owner-only";

function ServicesPageContent() {
  return (
    <>
      <PageHeader title="Serviços" action={<ButtonLink href="/servicos">+ Novo serviço</ButtonLink>} />
      <Card>
        <ul className={styles.list}>
          {services.map((s) => (
            <li key={s.id} className={styles.row}>
              <span className={styles.rowMain}>
                <span>{s.favorite ? "★ " : ""}{s.name}</span>
                <span className={styles.rowMeta}>{s.minutes} min</span>
              </span>
              <span>
                {s.active ? <strong><Money cents={s.price} /></strong> : <Badge>Inativo</Badge>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export default function ServicesPage() {
  return (
    <OwnerOnly>
      <ServicesPageContent />
    </OwnerOnly>
  );
}
