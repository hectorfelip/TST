"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./ui.module.css";

export type NavItem = { href: string; label: string };

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function NavLinks({ items, className }: { items: NavItem[]; className: string }) {
  const pathname = usePathname();
  return (
    <nav className={className}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`${styles.navLink} ${isActive(pathname, item.href) ? styles.navLinkActive : ""}`}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
