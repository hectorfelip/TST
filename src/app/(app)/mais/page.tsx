import Link from "next/link";
import { Card, PageHeader, styles } from "@/components/ui";
import { getDemoRole } from "@/prototype/demo-role";

const ownerLinks = [
  { href: "/clientes", label: "Clientes" },
  { href: "/servicos", label: "Serviços" },
  { href: "/estoque", label: "Estoque" },
  { href: "/equipe", label: "Equipe" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/login", label: "Sair" },
];

const barberLinks = [
  { href: "/clientes", label: "Clientes" },
  { href: "/login", label: "Sair" },
];

export default async function MorePage() {
  const links = (await getDemoRole()) === "owner" ? ownerLinks : barberLinks;
  return (
    <>
      <PageHeader title="Mais" />
      <Card>
        <ul className={styles.list}>
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={styles.row}>{l.label}</Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
