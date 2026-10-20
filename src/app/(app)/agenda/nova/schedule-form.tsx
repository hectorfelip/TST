"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Note, styles } from "@/components/ui";
import { scheduleAction } from "@/modules/service-orders/api/actions";
import type { Role } from "@/shared/tenant";

type Person = { id: string; name: string };

type Day = "hoje" | "amanha" | "outro";

const dateLabel = (ymd: string) => `${ymd.slice(8)}/${ymd.slice(5, 7)}`;

export function ScheduleForm({
  role, currentBarberId, barbers, clients, initialDay, initialDate, minDate,
}: { role: Role; currentBarberId: string; barbers: Person[]; clients: Person[]; initialDay: Day; initialDate: string; minDate: string }) {
  const [day, setDay] = useState<Day>(initialDay);
  const [date, setDate] = useState(initialDate);
  const [done, setDone] = useState(false);
  const [asking, setAsking] = useState(false);
  const [clientId, setClientId] = useState("");
  const [time, setTime] = useState("");
  const [barberId, setBarberId] = useState(role === "barber" ? currentBarberId : "");

  const client = clients.find((c) => c.id === clientId);
  const barber = barbers.find((b) => b.id === barberId);
  const valid = !!client && !!barber && /^\d{2}:\d{2}$/.test(time) && (day !== "outro" || /^\d{4}-\d{2}-\d{2}$/.test(date));
  const dayText = day === "hoje" ? "hoje" : day === "amanha" ? "amanhã" : `em ${dateLabel(date)}`;

  return (
    <>
      <div className={styles.pageHeader}><h1>{asking ? "Confirmar agendamento" : "Agendar cliente"}</h1></div>
      <ActionForm<{ id: string }> action={async (previous, formData) => {
        const result = await scheduleAction(previous, formData);
        if (result.ok) setDone(true);
        return result;
      }}>
        {/* the real values live in hidden fields so they are sent from either step */}
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="day" value={day} />
        <input type="hidden" name="date" value={day === "outro" ? date : ""} />
        <input type="hidden" name="time" value={time} />
        <input type="hidden" name="barberId" value={barberId} />
        {done ? (
          <Card title="Agendado ✓">
            <p>{client?.name} com {barber?.name}, {dayText} às {time}.</p>
            <Note>Aparece na agenda do barbeiro.</Note>
            <Link href="/agenda" className={`${styles.button} ${styles.buttonBlock}`}>Ver agenda</Link>
          </Card>
        ) : asking ? (
          <Card>
            <p>
              Agendar <strong>{client?.name}</strong> com <strong>{barber?.name}</strong>, <strong>{dayText} às {time}</strong>?
            </p>
            <div className={styles.buttonGrid}>
              <SubmitButton>Sim, agendar</SubmitButton>
              <button type="button" className={styles.buttonSecondary} onClick={() => setAsking(false)}>Voltar</button>
            </div>
          </Card>
        ) : (
          <>
            <Card>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="client">Cliente cadastrado</label>
                <select id="client" className={styles.input} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Escolha…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Note>Agendamento precisa de um cliente cadastrado. Cliente avulso não tem como ser esperado.</Note>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Dia</span>
                <div className={styles.buttonGrid} style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  <button type="button" className={day === "hoje" ? styles.button : styles.buttonSecondary} aria-pressed={day === "hoje"} onClick={() => setDay("hoje")}>Hoje</button>
                  <button type="button" className={day === "amanha" ? styles.button : styles.buttonSecondary} aria-pressed={day === "amanha"} onClick={() => setDay("amanha")}>Amanhã</button>
                  <button type="button" className={day === "outro" ? styles.button : styles.buttonSecondary} aria-pressed={day === "outro"} onClick={() => setDay("outro")}>Outro dia</button>
                </div>
                {day === "outro" && (
                  <>
                    <label className={styles.label} htmlFor="date">Data</label>
                    <input id="date" type="date" className={styles.input} value={date} min={minDate} onChange={(e) => setDate(e.target.value)} />
                  </>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="time">Horário</label>
                <input id="time" type="time" className={styles.input} value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="barber">Barbeiro</label>
                {role === "owner" ? (
                  <select id="barber" className={styles.input} value={barberId} onChange={(e) => setBarberId(e.target.value)}>
                    <option value="">Escolha…</option>
                    {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                ) : (
                  <>
                    <input id="barber" className={styles.input} value={barber?.name ?? ""} readOnly />
                    <Note>Barbeiro só agenda no próprio nome. O dono pode agendar para qualquer barbeiro.</Note>
                  </>
                )}
              </div>
            </Card>
            <button type="button" className={`${styles.button} ${styles.buttonBlock}`} disabled={!valid} onClick={() => setAsking(true)}>
              Revisar agendamento
            </button>
          </>
        )}
      </ActionForm>
    </>
  );
}
