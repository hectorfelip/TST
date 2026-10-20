"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Note, styles } from "@/components/ui";
import { bookOnlineAction } from "@/modules/booking/api/public-actions";
import type { BookingConfirmation } from "@/modules/booking/data/commands";

type Props = {
  slug: string;
  serviceId: string;
  barberId: string;
  day: string;
  time: string;
  /** Already in words, in the barbershop's time zone: "Quarta-feira, 14/10 às 10:00". */
  whenLabel: string;
  requiresApproval: boolean;
};

/** The last step: name and phone. The server decides everything else (it rechecks that the time is still free). */
export function PublicBookingForm({ slug, serviceId, barberId, day, time, whenLabel, requiresApproval }: Props) {
  const [done, setDone] = useState<BookingConfirmation | null>(null);

  if (done) {
    return (
      <Card title={done.status === "confirmed" ? "Agendamento confirmado ✓" : "Pedido enviado ✓"}>
        <p>
          <strong>{done.serviceName}</strong> com <strong>{done.barberName}</strong>
          <br />
          {whenLabel}
        </p>
        <p>
          {done.status === "confirmed"
            ? `Tudo certo! Esperamos você na ${done.shopName}.`
            : `A ${done.shopName} vai confirmar o seu horário. O horário já está reservado para você enquanto isso.`}
        </p>
        <Note>Precisa mudar ou cancelar? Fale com a barbearia por telefone.</Note>
      </Card>
    );
  }

  return (
    <ActionForm<BookingConfirmation>
      action={async (previous, formData) => {
        const result = await bookOnlineAction(previous, formData);
        if (result.ok) setDone(result.value);
        return result;
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="service" value={serviceId} />
      <input type="hidden" name="barber" value={barberId} />
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="time" value={time} />
      <Card title="Seus dados">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="name">Seu nome</label>
          <input id="name" name="name" className={styles.input} required minLength={2} maxLength={80} autoComplete="name" />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="phone">Seu telefone (com DDD)</label>
          <input id="phone" name="phone" className={styles.input} required inputMode="tel" autoComplete="tel" placeholder="(11) 98888-1111" maxLength={20} />
        </div>
        {/* A trap for robots: people never see it, robots fill every field. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label htmlFor="website">Não preencha este campo</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <Note>
          Usamos o seu nome e telefone só para este agendamento.
          {requiresApproval && " A barbearia confirma cada pedido."}
        </Note>
        <SubmitButton block>Confirmar agendamento</SubmitButton>
      </Card>
    </ActionForm>
  );
}
