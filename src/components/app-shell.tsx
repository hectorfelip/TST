import { barbershop, employeeName } from "@/prototype/mock-data";
import { switchDemoRole } from "@/prototype/actions";
import { DEMO_BARBER_ID, getDemoRole } from "@/prototype/demo-role";
import type { Role } from "@/shared/tenant";
import { NavLinks, type NavItem } from "./nav-links";
import styles from "./ui.module.css";

// Menus only hide screens. The real protection is on the server (step 3).
const navByRole: Record<Role, { mobile: NavItem[]; desktop: NavItem[] }> = {
  owner: {
    mobile: [
      { href: "/", label: "Painel" },
      { href: "/comandas", label: "Comandas" },
      { href: "/caixa", label: "Caixa" },
      { href: "/mais", label: "Mais" },
    ],
    desktop: [
      { href: "/", label: "Painel" },
      { href: "/comandas", label: "Comandas" },
      { href: "/caixa", label: "Caixa" },
      { href: "/clientes", label: "Clientes" },
      { href: "/servicos", label: "Serviços" },
      { href: "/estoque", label: "Estoque" },
      { href: "/equipe", label: "Equipe" },
      { href: "/relatorios", label: "Relatórios" },
    ],
  },
  barber: {
    mobile: [
      { href: "/", label: "Meu dia" },
      { href: "/comandas", label: "Comandas" },
      { href: "/clientes", label: "Clientes" },
      { href: "/mais", label: "Mais" },
    ],
    desktop: [
      { href: "/", label: "Meu dia" },
      { href: "/comandas", label: "Comandas" },
      { href: "/clientes", label: "Clientes" },
    ],
  },
};

export async function AppShell({ children }: { children: React.ReactNode }) {
  const role = await getDemoRole();
  const nav = navByRole[role];

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.rowMain}>
          <span className={styles.shopName}>{barbershop.name}</span>
          <span className={styles.rowMeta}>
            {role === "owner" ? "Dono" : `Barbeiro: ${employeeName(DEMO_BARBER_ID)}`} · protótipo
          </span>
        </span>
        <form action={switchDemoRole}>
          <input type="hidden" name="role" value={role === "owner" ? "barber" : "owner"} />
          <button type="submit" className={styles.prototypeTag}>
            Ver como {role === "owner" ? "barbeiro" : "dono"}
          </button>
        </form>
      </header>
      <NavLinks items={nav.desktop} className={styles.sideNav} />
      <main className={styles.main}>{children}</main>
      <NavLinks items={nav.mobile} className={styles.bottomNav} />
    </div>
  );
}
