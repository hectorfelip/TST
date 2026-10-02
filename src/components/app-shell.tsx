import { logoutAction } from "@/modules/auth/api/actions";
import { getBarbershopName } from "@/modules/barbershops/data/settings.repo";
import { read } from "@/server/run";
import { requireAuth } from "@/server/auth";
import type { Role } from "@/shared/tenant";
import { NavLinks, type NavItem } from "./nav-links";
import styles from "./ui.module.css";

// Menus only hide screens. The real protection is on the server: every query and action checks the role again.
const navByRole: Record<Role, { mobile: NavItem[]; desktop: NavItem[] }> = {
  owner: {
    mobile: [
      { href: "/", label: "Painel" },
      { href: "/agenda", label: "Agenda" },
      { href: "/comandas", label: "Comandas" },
      { href: "/caixa", label: "Caixa" },
      { href: "/mais", label: "Mais" },
    ],
    desktop: [
      { href: "/", label: "Painel" },
      { href: "/agenda", label: "Agenda" },
      { href: "/comandas", label: "Comandas" },
      { href: "/caixa", label: "Caixa" },
      { href: "/clientes", label: "Clientes" },
      { href: "/servicos", label: "Serviços" },
      { href: "/estoque", label: "Estoque" },
      { href: "/equipe", label: "Equipe" },
      { href: "/relatorios", label: "Relatórios" },
      { href: "/configuracoes", label: "Configurações" },
    ],
  },
  barber: {
    mobile: [
      { href: "/", label: "Meu dia" },
      { href: "/agenda", label: "Agenda" },
      { href: "/comandas", label: "Comandas" },
      { href: "/mais", label: "Mais" },
    ],
    desktop: [
      { href: "/", label: "Meu dia" },
      { href: "/agenda", label: "Agenda" },
      { href: "/comandas", label: "Comandas" },
      { href: "/clientes", label: "Clientes" },
      { href: "/caixa/abrir", label: "Abrir caixa" },
    ],
  },
};

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { ctx, name, mustChangePassword } = await requireAuth({ allowTemporary: true });
  const shopName = mustChangePassword ? "" : await read((tx) => getBarbershopName(tx));
  const nav = navByRole[ctx.role];

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.rowMain}>
          <span className={styles.shopName}>{shopName}</span>
          <span className={styles.rowMeta}>
            {ctx.role === "owner" ? "Dono" : "Barbeiro"}: {name}
          </span>
        </span>
        <form action={logoutAction}>
          <button type="submit" className={styles.smallButton}>Sair</button>
        </form>
      </header>
      {!mustChangePassword && <NavLinks items={nav.desktop} className={styles.sideNav} />}
      <main className={styles.main}>{children}</main>
      {!mustChangePassword && <NavLinks items={nav.mobile} className={styles.bottomNav} />}
    </div>
  );
}
