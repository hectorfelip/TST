import Link from "next/link";
import { Badge, Money, styles } from "@/components/ui";
import { appointmentTimePassed, clientName, comandaTotal, employeeName, type Comanda } from "./mock-data";

/** PROTOTYPE: the appointments of a day, earliest first. */
export function AgendaList({ items, showBarber, empty }: { items: Comanda[]; showBarber: boolean; empty: string }) {
  if (items.length === 0) return <p className={styles.rowMeta}>{empty}</p>;
  return (
    <ul className={styles.list}>
      {items.map((c) => (
        <li key={c.id}>
          <Link href={`/comandas/${c.id}`} className={styles.row}>
            <span className={styles.rowMain}>
              <span>
                <strong>{c.appointment?.time}</strong> · {clientName(c.clientId)}
              </span>
              <span className={styles.rowMeta}>
                {showBarber && `${employeeName(c.appointment?.barberId ?? c.openedBy)} · `}
                {c.items.length > 0 ? c.items.map((i) => i.name).join(", ") : "Serviço a definir"}
              </span>
            </span>
            <span>
              {appointmentTimePassed(c) ? <Badge tone="warning">Atrasado</Badge> : c.items.length > 0 ? <strong><Money cents={comandaTotal(c)} /></strong> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
