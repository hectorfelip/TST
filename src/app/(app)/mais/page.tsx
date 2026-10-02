import Link from "next/link";
import { Card, PageHeader, styles } from "@/components/ui";
import { logoutAction } from "@/modules/auth/api/actions";
import { requireAuth } from "@/server/auth";

const ownerLinks = [
  { href: "/caixa/abrir", label: "Abrir caixa" },
  { href: "/clientes", label: "Clientes" },
  { href: "/servicos", label: "Serviços" },
  { href: "/estoque", label: "Estoque" },
  { href: "/equipe", label: "Equipe" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/configuracoes", label: "Configurações" },
  { href: "/minha-senha", label: "Minha senha" },
];

const barberLinks = [
  { href: "/caixa/abrir", label: "Abrir caixa" },
  { href: "/clientes", label: "Clientes" },
  { href: "/minha-senha", label: "Minha senha" },
];

export default async function MorePage() {
  const { ctx } = await requireAuth();
  const links = ctx.role === "owner" ? ownerLinks : barberLinks;
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
          <li>
            <form action={logoutAction}>
              <button type="submit" className={`${styles.row} ${styles.rowButton}`}>Sair</button>
            </form>
          </li>
        </ul>
      </Card>
    </>
  );
}
