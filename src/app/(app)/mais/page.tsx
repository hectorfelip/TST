import Link from "next/link";
import { Card, PageHeader, styles } from "@/components/ui";

const links = [
  { href: "/clientes", label: "Clientes" },
  { href: "/servicos", label: "Serviços" },
  { href: "/estoque", label: "Estoque" },
  { href: "/equipe", label: "Equipe" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/login", label: "Sair" },
];

export default function MorePage() {
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
