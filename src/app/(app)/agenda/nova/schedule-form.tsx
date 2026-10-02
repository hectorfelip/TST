"use client";

/** PROTOTYPE ONLY (step 3). Booking form with local state; nothing is saved. */
import { useState } from "react";
import Link from "next/link";
import { Card, Note, styles } from "@/components/ui";
import { NOW_LABEL } from "@/prototype/mock-data";
import type { Role } from "@/shared/tenant";

type Person = { id: string; name: string };

export function ScheduleForm({
  role,
  currentBarberId,
  barbers,
  clients,
}: {
  role: Role;
  currentBarberId: string;
  barbers: Person[];
  clients: Person[];
}) {
  const [clientId, setClientId] = useState("");
  const [day, setDay] = useState<"hoje" | "amanha">("amanha");
  const [time, setTime] = useState("");
  const [barberId, setBarberId] = useState(role === "barber" ? currentBarberId : "");
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");

  const client = clients.find((c) => c.id === clientId);
  const barber = barbers.find((b) => b.id === barberId);
  const past = day === "hoje" && time !== "" && time <= NOW_LABEL;
  const valid = !!client && !!barber && /^\d{2}:\d{2}$/.test(time) && !past;
  const when = `${day === "hoje" ? "hoje" : "amanhã"} às ${time}`;

  if (step === "done") {
    return (
      <Card title="Agendado ✓">
        <p>{client?.name} com {barber?.name}, {when}.</p>
        <Note>Aparece na agenda do barbeiro. Protótipo: nada foi salvo.</Note>
        <Link href="/agenda" className={`${styles.button} ${styles.buttonBlock}`}>Ver agenda</Link>
      </Card>
    );
  }

  if (step === "confirm") {
    return (
      <>
        <div className={styles.pageHeader}><h1>Confirmar agendamento</h1></div>
        <Card>
          <p>
            Agendar <strong>{client?.name}</strong> com <strong>{barber?.name}</strong>, <strong>{when}</strong>?
          </p>
          <div className={styles.buttonGrid}>
            <button type="button" className={styles.button} onClick={() => setStep("done")}>Sim, agendar</button>
            <button type="button" className={styles.buttonSecondary} onClick={() => setStep("form")}>Voltar</button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className={styles.pageHeader}><h1>Agendar cliente</h1></div>
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
          <div className={styles.buttonGrid}>
            <button type="button" className={day === "hoje" ? styles.button : styles.buttonSecondary} aria-pressed={day === "hoje"} onClick={() => setDay("hoje")}>Hoje</button>
            <button type="button" className={day === "amanha" ? styles.button : styles.buttonSecondary} aria-pressed={day === "amanha"} onClick={() => setDay("amanha")}>Amanhã</button>
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="time">Horário</label>
          <input id="time" type="time" className={styles.input} value={time} onChange={(e) => setTime(e.target.value)} />
          {past && <span className={styles.error}>Esse horário já passou (agora são {NOW_LABEL}).</span>}
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
      <button type="button" className={`${styles.button} ${styles.buttonBlock}`} disabled={!valid} onClick={() => setStep("confirm")}>
        Revisar agendamento
      </button>
    </>
  );
}
