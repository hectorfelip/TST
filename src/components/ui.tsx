import Link from "next/link";
import { formatBRL, type Cents } from "@/shared/money";
import styles from "./ui.module.css";

export { styles };

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.pageHeader}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className={styles.card}>
      {title && <h2 className={styles.cardTitle}>{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.card}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}

export function Money({ cents }: { cents: Cents }) {
  return <>{formatBRL(cents)}</>;
}

type Variant = "primary" | "secondary" | "danger";

const variantClass: Record<Variant, string> = {
  primary: styles.button,
  secondary: styles.buttonSecondary,
  danger: styles.buttonDanger,
};

export function ButtonLink({
  href,
  children,
  variant = "primary",
  block = false,
  stacked = false,
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  block?: boolean;
  /** Two-line button: main text + <small> detail. */
  stacked?: boolean;
}) {
  const classes = [variantClass[variant], block && styles.buttonBlock, stacked && styles.buttonStack].filter(Boolean).join(" ");
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "warning" | "ok"; children: React.ReactNode }) {
  const className = tone === "warning" ? styles.badgeWarning : tone === "ok" ? styles.badgeOk : styles.badge;
  return <span className={className}>{children}</span>;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}
