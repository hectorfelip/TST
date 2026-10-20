"use client";

import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, styles } from "@/components/ui";
import { approveBookingAction, declineBookingAction } from "@/modules/booking/api/actions";
import type { ComandaView } from "@/modules/service-orders/api/views";

/** Online bookings that wait for a yes. Approve with one tap; declining asks for a reason (the time becomes free again). */
export function ApprovalList({ items, showBarber }: { items: ComandaView[]; showBarber: boolean }) {
  return (
    <ul className={styles.list}>
      {items.map((c) => (
        <li key={c.id}>
          <details>
            <summary className={styles.row}>
              <span className={styles.rowMain}>
                <span><strong>{c.appointment?.label}</strong> · {c.clientName}</span>
                <span className={styles.rowMeta}>
                  {showBarber && `${c.appointment?.barberName} · `}
                  {c.items.map((i) => i.name).join(", ")}
                </span>
              </span>
              <Badge tone="warning">Aguardando</Badge>
            </summary>
            <ActionForm action={approveBookingAction} successMessage="Agendamento confirmado.">
              <input type="hidden" name="comandaId" value={c.id} />
              <SubmitButton block>Confirmar agendamento</SubmitButton>
            </ActionForm>
            <ActionForm action={declineBookingAction} successMessage="Agendamento recusado. O horário ficou livre.">
              <input type="hidden" name="comandaId" value={c.id} />
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`reason-${c.id}`}>Motivo de recusar (fica registrado)</label>
                <input id={`reason-${c.id}`} name="reason" className={styles.input} minLength={5} maxLength={200} placeholder="Ex.: barbeiro de folga nesse dia" />
              </div>
              <SubmitButton variant="danger" block>Recusar</SubmitButton>
            </ActionForm>
            <Link href={`/comandas/${c.id}`} className={styles.rowMeta}>Ver comanda #{c.number}</Link>
          </details>
        </li>
      ))}
    </ul>
  );
}
