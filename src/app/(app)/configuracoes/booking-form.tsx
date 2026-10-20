"use client";

/**
 * The online booking link of the barbershop: on/off, its address, approval, and the days and hours it takes bookings.
 * Rules: src/modules/booking/rules/settings.ts (owner only, audited). Same steps as the other settings: edit, review, confirm.
 */
import { useState, useSyncExternalStore } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Note, styles } from "@/components/ui";
import { saveBookingSettingsAction } from "@/modules/booking/api/actions";
import { DAY_NAMES, daysFromMask, SLOT_OPTIONS, type BookingSettings } from "@/modules/booking/rules/settings";
import { formatMinutes } from "@/shared/time";

const NOTICE_OPTIONS: [number, string][] = [[0, "Sem antecedência"], [30, "30 minutos"], [60, "1 hora"], [120, "2 horas"], [240, "4 horas"], [720, "12 horas"], [1440, "1 dia"]];

const toClock = (minutes: number) => (minutes >= 24 * 60 ? "00:00" : formatMinutes(minutes));
const noop = () => () => undefined;
const useOrigin = () => useSyncExternalStore(noop, () => window.location.origin, () => "");

type Props = { initial: BookingSettings; suggestedSlug: string; bookableBarbers: number; activeServices: number };

export function BookingForm({ initial, suggestedSlug, bookableBarbers, activeServices }: Props) {
  const origin = useOrigin();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [slug, setSlug] = useState(initial.slug ?? "");
  const [approval, setApproval] = useState(initial.requiresApproval);
  const [days, setDays] = useState<number[]>(daysFromMask(initial.openDays));
  const [open, setOpen] = useState(toClock(initial.openMinute));
  const [close, setClose] = useState(toClock(initial.closeMinute));
  const [slotMinutes, setSlotMinutes] = useState(initial.slotMinutes);
  const [notice, setNotice] = useState(initial.minNoticeMinutes);
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [copied, setCopied] = useState(false);

  const cleanSlug = slug.trim().toLowerCase();
  const link = `${origin}/agendar/${cleanSlug}`;
  const timesValid = /^\d{2}:\d{2}$/.test(open) && /^\d{2}:\d{2}$/.test(close) && open < close || (close === "00:00" && /^\d{2}:\d{2}$/.test(open) && open !== "00:00");
  const slugValid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(cleanSlug) && cleanSlug.length >= 3 && cleanSlug.length <= 40;
  const valid = days.length > 0 && timesValid && (cleanSlug === "" ? !enabled : slugValid);
  const changed =
    enabled !== initial.enabled || cleanSlug !== (initial.slug ?? "") || approval !== initial.requiresApproval ||
    days.join() !== daysFromMask(initial.openDays).join() || open !== toClock(initial.openMinute) || close !== toClock(initial.closeMinute) ||
    slotMinutes !== initial.slotMinutes || notice !== initial.minNoticeMinutes;

  const toggleDay = (d: number) => setDays((now) => (now.includes(d) ? now.filter((x) => x !== d) : [...now, d].sort()));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false); // the link is shown on screen: it can be selected by hand
    }
  };

  const hidden = (
    <>
      <input type="hidden" name="enabled" value={enabled ? "yes" : "no"} />
      <input type="hidden" name="slug" value={cleanSlug} />
      <input type="hidden" name="approval" value={approval ? "yes" : "no"} />
      {days.map((d) => <input key={d} type="hidden" name="day" value={d} />)}
      <input type="hidden" name="open" value={open} />
      <input type="hidden" name="close" value={close} />
      <input type="hidden" name="slot" value={slotMinutes} />
      <input type="hidden" name="notice" value={notice} />
    </>
  );

  if (step === "done") {
    return (
      <Card title="Link de agendamento salvo ✓">
        <p>{enabled ? <>O link está <strong>ligado</strong>. Envie para os seus clientes:</> : <>O link está <strong>desligado</strong>: quem abrir verá que não existe.</>}</p>
        {enabled && (
          <>
            <p><strong style={{ overflowWrap: "anywhere" }}>{link}</strong></p>
            <button type="button" className={styles.buttonSecondary} onClick={copy}>{copied ? "Copiado ✓" : "Copiar link"}</button>
          </>
        )}
        <Note>Registrado quem mudou e de quê → para quê.</Note>
        <button type="button" className={styles.buttonSecondary} onClick={() => setStep("form")}>Voltar às configurações</button>
      </Card>
    );
  }

  if (step === "confirm") {
    return (
      <Card title="Confirmar link de agendamento">
        <ul>
          <li>Link: <strong>{enabled ? "ligado" : "desligado"}</strong>{cleanSlug && <> · <span style={{ overflowWrap: "anywhere" }}>{link}</span></>}</li>
          <li>{approval ? "Cada pedido espera a sua aprovação." : "Os pedidos são confirmados sozinhos."}</li>
          <li>Dias: {days.map((d) => DAY_NAMES[d]).join(", ")}</li>
          <li>Horário: {open} às {close === "00:00" ? "24:00" : close}, de {slotMinutes} em {slotMinutes} minutos</li>
          <li>Antecedência mínima: {NOTICE_OPTIONS.find(([m]) => m === notice)?.[1] ?? `${notice} minutos`}</li>
        </ul>
        <ActionForm action={async (previous, formData) => {
          const result = await saveBookingSettingsAction(previous, formData);
          if (result.ok) setStep("done");
          return result;
        }}>
          {hidden}
          <div className={styles.buttonGrid}>
            <SubmitButton>Sim, salvar</SubmitButton>
            <button type="button" className={styles.buttonSecondary} onClick={() => setStep("form")}>Voltar</button>
          </div>
        </ActionForm>
      </Card>
    );
  }

  return (
    <>
      <Card title="Link de agendamento para clientes">
        <p className={styles.rowMeta}>O cliente abre o link no celular, escolhe serviço, barbeiro, dia e horário. Só aparecem horários livres, dentro do funcionamento abaixo.</p>
        <label className={styles.row} style={{ cursor: "pointer" }}>
          <span className={styles.rowMain}>
            <strong>Receber agendamentos pelo link</strong>
            <span className={styles.rowMeta}>{enabled ? "Ligado" : "Desligado"}</span>
          </span>
          <input type="checkbox" role="switch" aria-label="Receber agendamentos pelo link" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 28, height: 28 }} />
        </label>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="slug">Endereço do link</label>
          <input id="slug" className={styles.input} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={suggestedSlug} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={40} />
          {cleanSlug !== "" && !slugValid && <span className={styles.error}>Use de 3 a 40 letras minúsculas sem acento, números e hífen (ex.: {suggestedSlug}).</span>}
          {cleanSlug === "" && suggestedSlug && <button type="button" className={styles.buttonSecondary} onClick={() => setSlug(suggestedSlug)}>Usar &quot;{suggestedSlug}&quot;</button>}
          {slugValid && <Note>{link}</Note>}
        </div>

        <label className={styles.row} style={{ cursor: "pointer" }}>
          <span className={styles.rowMain}>
            <strong>Eu aprovo cada pedido</strong>
            <span className={styles.rowMeta}>{approval ? "O horário fica reservado até você confirmar ou recusar." : "O pedido já fica confirmado na agenda."}</span>
          </span>
          <input type="checkbox" role="switch" aria-label="Eu aprovo cada pedido" checked={approval} onChange={(e) => setApproval(e.target.checked)} style={{ width: 28, height: 28 }} />
        </label>
      </Card>

      <Card title="Quando a barbearia recebe agendamentos">
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend className={styles.label}>Dias de funcionamento</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {DAY_NAMES.map((name, d) => (
              <button key={d} type="button" className={days.includes(d) ? styles.button : styles.buttonSecondary} aria-pressed={days.includes(d)} onClick={() => toggleDay(d)} style={{ padding: "0 14px" }}>
                {name.slice(0, 3)}
              </button>
            ))}
          </div>
          {days.length === 0 && <span className={styles.error}>Marque pelo menos um dia.</span>}
        </fieldset>
        <div className={styles.buttonGrid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="open">Abre às</label>
            <input id="open" type="time" className={styles.input} value={open} onChange={(e) => setOpen(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="close">Fecha às</label>
            <input id="close" type="time" className={styles.input} value={close} onChange={(e) => setClose(e.target.value)} />
          </div>
        </div>
        {!timesValid && <span className={styles.error}>A barbearia precisa abrir antes de fechar.</span>}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="slot">Horários de quanto em quanto tempo</label>
          <select id="slot" className={styles.input} value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))}>
            {SLOT_OPTIONS.map((m) => <option key={m} value={m}>{m} minutos</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="notice">Antecedência mínima</label>
          <select id="notice" className={styles.input} value={notice} onChange={(e) => setNotice(Number(e.target.value))}>
            {NOTICE_OPTIONS.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
          </select>
          <Note>Evita o cliente marcar para daqui a 5 minutos, quando você nem viu o pedido.</Note>
        </div>
        <Note>A duração de cada serviço (em Serviços) bloqueia a agenda do barbeiro. Só aparecem horários em que o barbeiro está livre o tempo todo.</Note>
      </Card>

      {enabled && (bookableBarbers === 0 || activeServices === 0) && (
        <div className={styles.card} role="alert">
          <Badge tone="warning">Atenção</Badge>
          <span>
            {bookableBarbers === 0 && "Nenhum barbeiro aceita agendamento online (veja em Equipe). "}
            {activeServices === 0 && "Nenhum serviço ativo (veja em Serviços). "}
            Sem isso, o cliente não consegue marcar.
          </span>
        </div>
      )}

      <button type="button" className={`${styles.button} ${styles.buttonBlock}`} disabled={!valid || !changed} onClick={() => setStep("confirm")}>
        Revisar o link e salvar
      </button>
      {!changed && <Note>Nada mudou ainda.</Note>}
    </>
  );
}
