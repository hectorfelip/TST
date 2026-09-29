import { barbershop } from "@/prototype/mock-data";
import { NavLinks, type NavItem } from "./nav-links";
import styles from "./ui.module.css";

// Owner view. The barber view hides Caixa, Clientes (edit), Serviços, Estoque,
// Equipe and Relatórios — enforced by rules in step 3, not by the menu alone.
const mobileItems: NavItem[] = [
  { href: "/", label: "Painel" },
  { href: "/comandas", label: "Comandas" },
  { href: "/caixa", label: "Caixa" },
  { href: "/mais", label: "Mais" },
];

const desktopItems: NavItem[] = [
  { href: "/", label: "Painel" },
  { href: "/comandas", label: "Comandas" },
  { href: "/caixa", label: "Caixa" },
  { href: "/clientes", label: "Clientes" },
  { href: "/servicos", label: "Serviços" },
  { href: "/estoque", label: "Estoque" },
  { href: "/equipe", label: "Equipe" },
  { href: "/relatorios", label: "Relatórios" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.shopName}>{barbershop.name}</span>
        <span className={styles.prototypeTag}>Protótipo · dados fictícios</span>
      </header>
      <NavLinks items={desktopItems} className={styles.sideNav} />
      <main className={styles.main}>{children}</main>
      <NavLinks items={mobileItems} className={styles.bottomNav} />
    </div>
  );
}
