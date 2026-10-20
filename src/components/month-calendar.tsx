import Link from "next/link";
import type { CalendarCell } from "@/modules/service-orders/api/queries";
import styles from "./calendar.module.css";
import { styles as ui } from "./ui";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** A month grid. Every day is a link (`?data=`): no JavaScript needed, works from the browser's back button. */
export function MonthCalendar({ title, prevMonth, nextMonth, weeks, basePath }: { title: string; prevMonth: string; nextMonth: string; weeks: CalendarCell[][]; basePath: string }) {
  return (
    <>
      <div className={styles.nav}>
        <Link href={`${basePath}?data=${prevMonth}`} className={ui.buttonSecondary} aria-label="Mês anterior">‹</Link>
        <span className={styles.monthTitle}>{title}</span>
        <Link href={`${basePath}?data=${nextMonth}`} className={ui.buttonSecondary} aria-label="Próximo mês">›</Link>
      </div>
      <div className={styles.grid} role="grid" aria-label={title}>
        {WEEKDAYS.map((d, i) => (
          <span key={i} className={styles.weekday} role="columnheader" aria-label={WEEKDAY_NAMES[i]}>{d}</span>
        ))}
        {weeks.flat().map((c) => (
          <Link
            key={c.ymd}
            role="gridcell"
            href={`${basePath}?data=${c.ymd}`}
            aria-current={c.isSelected ? "date" : undefined}
            aria-label={`${c.ymd.slice(8)}/${c.ymd.slice(5, 7)}${c.count > 0 ? `, ${c.count} ${c.count === 1 ? "cliente marcado" : "clientes marcados"}` : ""}`}
            className={[styles.cell, !c.inMonth && styles.outside, c.isToday && styles.today, c.isSelected && styles.selected].filter(Boolean).join(" ")}
          >
            <span>{c.day}</span>
            {c.count > 0 && <span className={styles.count}>{c.count}</span>}
          </Link>
        ))}
      </div>
    </>
  );
}
