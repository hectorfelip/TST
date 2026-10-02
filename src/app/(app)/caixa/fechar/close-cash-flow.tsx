"use client";

/**
 * PROTOTYPE ONLY (step 3). Closing the register with local state; nothing is
 * saved. It follows the rules in src/modules/service-orders/rules/day-close.ts:
 * the owner sees EVERY unpaid service, decides each comanda explicitly, and
 * each decision (and the final closing) has a confirmation step.
 */
import { useState } from "react";
import Link from "next/link";
import { Badge, Card, Note, styles } from "@/components/ui";
import { formatBRL, toCents, type Cents } from "@/shared/money";
import type { DayDecision, DayEntry } from "@/prototype/mock-data";

const optionLabel = (option: DayDecision, expiryDays: number): string =>
  ({
    no_show: "Cliente não compareceu",
    keep_pending: `Deixar pendente (${expiryDays} dias)`,
    discard: "Descartar comanda vazia",
    reviewed: "Conferi: está correto",
  })[option];

function question(option: DayDecision, entry: DayEntry, expiryDays: number): string {
  switch (option) {
    case "no_show":
      return `Marcar ${entry.client} como não compareceu? A comanda sai da agenda e a falta fica registrada. Não é um cancelamento.`;
    case "keep_pending":
      return `Deixar a comanda #${entry.number} pendente? Fica ${expiryDays} dias esperando o pagamento e depois é cancelada automaticamente. Você é alertado em cada fechamento.`;
    case "discard":
      return `Descartar a comanda vazia #${entry.number}? Não tem itens nem dinheiro envolvido.`;
    case "reviewed":
      return `Confirmar que você conferiu? O barbeiro marcou como não compareceu, mas havia ${formatBRL(entry.total)} em itens lançados.`;
  }
}

const doneLabel: Record<DayDecision, string> = {
  no_show: "Não compareceu",
  keep_pending: "Pendente",
  discard: "Descartar",
  reviewed: "Conferido",
};

function parse(value: string): Cents | null | "invalid" {
  if (value.trim() === "") return null;
  try {
    return toCents(value);
  } catch {
    return "invalid";
  }
}

export function CloseCashFlow({ expected, entries, expiryDays }: { expected: Cents; entries: DayEntry[]; expiryDays: number }) {
  const [counted, setCounted] = useState("");
  const [left, setLeft] = useState("");
  const [reason, setReason] = useState("");
  const [decisions, setDecisions] = useState<Record<string, DayDecision>>({});
  const [asking, setAsking] = useState<{ id: string; option: DayDecision } | null>(null);
  const [step, setStep] = useState<"form" | "summary" | "done">("form");

  const countedParsed = parse(counted);
  const countedCents = typeof countedParsed === "number" ? countedParsed : null;
  const leftParsed = parse(left);
  const leftCents = leftParsed === null ? countedCents : typeof leftParsed === "number" ? leftParsed : null;
  const leftInvalid = leftParsed === "invalid" || (leftCents !== null && countedCents !== null && leftCents > countedCents);
  const difference = countedCents === null ? null : countedCents - expected;
  const needsReason = difference !== null && difference !== 0;
  const allDecided = entries.every((e) => decisions[e.id]);
  const undecided = entries.filter((e) => !decisions[e.id]).length;
  const atRisk = entries.filter((e) => e.kind !== "empty").reduce((sum, e) => sum + e.total, 0);
  const atRiskCount = entries.filter((e) => e.kind !== "empty").length;
  const canReview = countedCents !== null && !leftInvalid && (!needsReason || reason.trim().length >= 5) && allDecided;

  const chosen = (option: DayDecision) => entries.filter((e) => decisions[e.id] === option);
  const pendingTotal = chosen("keep_pending").reduce((sum, e) => sum + e.total, 0);

  if (step === "done") {
    return (
      <Card title="Caixa fechado ✓">
        <p>Esperado {formatBRL(expected)} · contado {formatBRL(countedCents ?? 0)}</p>
        {needsReason && <Note>Diferença de {formatBRL(difference ?? 0)}: {reason}</Note>}
        <p>Ficam na gaveta para amanhã: {formatBRL(leftCents ?? 0)}</p>
        {chosen("discard").length > 0 && <p>{chosen("discard").length} comanda(s) vazia(s) descartada(s).</p>}
        {chosen("no_show").length > 0 && <p>{chosen("no_show").length} marcada(s) como não compareceu (não é cancelamento).</p>}
        {chosen("keep_pending").length > 0 && (
          <p>{chosen("keep_pending").length} comanda(s) pendente(s) ({formatBRL(pendingTotal)}): vencem em {expiryDays} dias.</p>
        )}
        {chosen("reviewed").length > 0 && <p>{chosen("reviewed").length} falta(s) com itens conferida(s).</p>}
        <Note>Protótipo: nada foi salvo.</Note>
        <Link href="/" className={`${styles.button} ${styles.buttonBlock}`}>Voltar ao painel</Link>
      </Card>
    );
  }

  if (step === "summary") {
    return (
      <>
        <Card title="Confirme o fechamento do caixa">
          <div className={styles.row}><span>Dinheiro contado</span><strong>{formatBRL(countedCents ?? 0)}</strong></div>
          <div className={styles.row}><span>Esperado pelo sistema</span><strong>{formatBRL(expected)}</strong></div>
          <div className={styles.row}>
            <span>{difference === 0 ? "Bateu" : (difference ?? 0) > 0 ? "Sobra" : "Falta"}</span>
            <strong>{formatBRL(Math.abs(difference ?? 0))}</strong>
          </div>
          {needsReason && <Note>Motivo: {reason}</Note>}
          <div className={styles.row}><span>Fica na gaveta para amanhã</span><strong>{formatBRL(leftCents ?? 0)}</strong></div>
        </Card>
        {entries.length > 0 && (
          <Card title="O que vai acontecer com as comandas">
            <ul className={styles.list}>
              {(["discard", "no_show", "keep_pending", "reviewed"] as DayDecision[]).map((option) =>
                chosen(option).length > 0 ? (
                  <li key={option} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span>{doneLabel[option]}: {chosen(option).length}</span>
                      <span className={styles.rowMeta}>{chosen(option).map((e) => `#${e.number}`).join(", ")}</span>
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          </Card>
        )}
        <div className={styles.buttonGrid}>
          <button type="button" className={styles.button} onClick={() => setStep("done")}>Sim, fechar o caixa</button>
          <button type="button" className={styles.buttonSecondary} onClick={() => setStep("form")}>Voltar</button>
        </div>
      </>
    );
  }

  return (
    <>
      <Note>Simulação do fim do expediente: todos os agendamentos de hoje já passaram do horário.</Note>

      <Card title="1. Conte o dinheiro da gaveta">
        <div className={styles.row}><span>Esperado pelo sistema</span><strong>{formatBRL(expected)}</strong></div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="counted">Valor contado</label>
          <input id="counted" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" value={counted} onChange={(e) => setCounted(e.target.value)} />
          {countedParsed === "invalid" && <span className={styles.error}>Valor inválido.</span>}
        </div>
        {difference !== null && (
          <div className={styles.total}>
            <span>{difference === 0 ? "Bateu" : difference > 0 ? "Sobra" : "Falta"}</span>
            <span>{formatBRL(Math.abs(difference))}</span>
          </div>
        )}
        {needsReason && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="reason">Motivo da diferença (obrigatório)</label>
            <textarea id="reason" className={styles.input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Pix da comanda #1023 foi marcado como dinheiro" />
            <Note>A diferença fica registrada. Não ajuste o valor só para zerar.</Note>
          </div>
        )}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="left">Troco que fica na gaveta para amanhã (opcional)</label>
          <input id="left" className={styles.input} inputMode="decimal" placeholder="Tudo o que foi contado" value={left} onChange={(e) => setLeft(e.target.value)} />
          {leftInvalid && <span className={styles.error}>Não pode ser maior que o dinheiro contado.</span>}
          <Note>Quem abrir o caixa amanhã é avisado desse valor e precisa explicar qualquer diferença.</Note>
        </div>
      </Card>

      {entries.length > 0 && (
        <>
          <Card title={`2. Atenção: ${atRiskCount} serviço(s) sem pagamento`}>
            <p>
              <strong>{formatBRL(atRisk)}</strong> em serviços lançados e não recebidos. Confira cada comanda abaixo antes de fechar:
              uma comanda com itens pode ser um serviço que foi feito e pago sem registro.
            </p>
            <Note>Se foi atendido, receba o pagamento na comanda. Só marque &quot;não compareceu&quot; se o cliente realmente não veio.</Note>
          </Card>

          {entries.map((entry) => {
            const decision = decisions[entry.id];
            const isAsking = asking?.id === entry.id;
            return (
              <section key={entry.id} className={styles.card} aria-label={`Comanda ${entry.number}`}>
                <div className={styles.row} style={{ borderBottom: "none", padding: 0 }}>
                  <span className={styles.rowMain}>
                    <strong>#{entry.number} · {entry.client}</strong>
                    <span className={styles.rowMeta}>
                      {entry.appointment ? `Agendado ${entry.appointment} · ` : ""}{entry.barber}
                    </span>
                  </span>
                  {entry.kind === "empty" ? <Badge>Vazia</Badge> : <strong>{formatBRL(entry.total)}</strong>}
                </div>
                <span className={styles.rowMeta}>
                  {entry.items.length > 0 ? entry.items.join(", ") : "Sem itens"}
                  {entry.kind === "no_show_with_items" && " · marcada como não compareceu pelo barbeiro"}
                </span>
                {entry.expiresInDays !== null && (
                  <Badge tone="warning">Pendente · vence em {entry.expiresInDays} {entry.expiresInDays === 1 ? "dia" : "dias"}</Badge>
                )}

                {decision && !isAsking ? (
                  <div className={styles.row} style={{ borderBottom: "none", padding: 0 }}>
                    <Badge tone="ok">✓ {doneLabel[decision]}</Badge>
                    <button type="button" className={styles.buttonSecondary} onClick={() => setDecisions((d) => { const next = { ...d }; delete next[entry.id]; return next; })}>
                      Alterar
                    </button>
                  </div>
                ) : isAsking && asking ? (
                  <div role="alertdialog" aria-label={`Confirmar ${optionLabel(asking.option, expiryDays)}`}>
                    <p>{question(asking.option, entry, expiryDays)}</p>
                    <div className={styles.buttonGrid}>
                      <button type="button" className={styles.button} onClick={() => { setDecisions((d) => ({ ...d, [entry.id]: asking.option })); setAsking(null); }}>
                        Sim, confirmar
                      </button>
                      <button type="button" className={styles.buttonSecondary} onClick={() => setAsking(null)}>Não</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {entry.kind === "unpaid" && (
                      <Link href={`/comandas/${entry.id}/fechar`} className={`${styles.button} ${styles.buttonBlock}`}>
                        Foi atendido: receber pagamento
                      </Link>
                    )}
                    {entry.options.map((option) => (
                      <button key={option} type="button" className={`${styles.buttonSecondary} ${styles.buttonBlock}`} onClick={() => setAsking({ id: entry.id, option })}>
                        {optionLabel(option, expiryDays)}
                      </button>
                    ))}
                  </>
                )}
              </section>
            );
          })}
          {!allDecided && <Note>Faltam {undecided} comanda(s) para decidir. O caixa só fecha depois de você ver todas.</Note>}
        </>
      )}

      <button type="button" className={`${styles.button} ${styles.buttonBlock}`} disabled={!canReview} onClick={() => setStep("summary")}>
        Revisar e fechar caixa
      </button>
      <Link href="/caixa" className={`${styles.buttonSecondary} ${styles.buttonBlock}`}>Voltar</Link>
    </>
  );
}
