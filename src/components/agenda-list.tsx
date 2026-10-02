import Link from "next/link";
import type { ComandaView } from "@/modules/service-orders/api/views";
import { Badge, Money, styles } from "./ui";

/** The appointments of a day, earliest first. */
export function AgendaList({ items, showBarber, empty }: { items: ComandaView[]; showBarber: boolean; empty: string }) {
  if (items.length === 0) return <p className={styles.rowMeta}>{empty}</p>;
  return (
    <ul className={styles.list}>
      {items.map((c) => (
        <li key={c.id}>
          <Link href={`/comandas/${c.id}`} className={styles.row}>
            <span className={styles.rowMain}>
              <span>
                <strong>{c.appointment?.time}</strong> · {c.clientName}
              </span>
              <span className={styles.rowMeta}>
                {showBarber && `${c.appointment?.barberName} · `}
                {c.items.length > 0 ? c.items.map((i) => i.name).join(", ") : "Serviço a definir"}
              </span>
            </span>
            <span>
              {c.appointment?.timePassed ? <Badge tone="warning">Atrasado</Badge> : c.items.length > 0 ? <strong><Money cents={c.total} /></strong> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
