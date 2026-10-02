"use client";

/**
 * PROTOTYPE ONLY (step 2). The whole "new comanda" flow runs in the browser
 * with local state, so the main task can be tested end to end. Nothing is
 * saved. The real rules (step 3) and saving (steps 4 and 5) replace this.
 */
import { useState } from "react";
import Link from "next/link";
import { Card, Note, styles } from "@/components/ui";
import { formatBRL, toCents, type Cents } from "@/shared/money";
import type { Role } from "@/shared/tenant";

type Option = { id: string; name: string; price: Cents };
type Person = { id: string; name: string };
type Method = "pix" | "dinheiro" | "debito" | "credito";
type Item = { key: number; name: string; price: Cents; barberId: string };

const methodLabel: Record<Method, string> = { pix: "Pix", dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito" };

function parseMoney(value: string): Cents | null {
  if (value.trim() === "") return 0;
  try {
    return toCents(value);
  } catch {
    return null;
  }
}

export function NewComandaFlow({
  number,
  role,
  currentUserId,
  barbers,
  clients,
  services,
  products,
}: {
  number: number;
  role: Role;
  currentUserId: string;
  barbers: Person[];
  clients: (Person & { phone: string })[];
  services: Option[];
  products: Option[];
}) {
  const [step, setStep] = useState<"cliente" | "itens" | "pagamento" | "fechada">("cliente");
  const [client, setClient] = useState<Person | null>(null);
  const [barberId, setBarberId] = useState(currentUserId);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [method, setMethod] = useState<Method | null>(null);
  const [received, setReceived] = useState("");
  const [discount, setDiscount] = useState("");
  const [note, setNote] = useState("");

  const reset = () => {
    setStep("cliente");
    setClient(null);
    setBarberId(currentUserId);
    setSearch("");
    setItems([]);
    setMethod(null);
    setReceived("");
    setDiscount("");
    setNote("");
  };

  const barberName = (id: string) => barbers.find((b) => b.id === id)?.name ?? "—";
  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  const discountCents = role === "owner" ? parseMoney(discount) : 0;
  const discountValid = discountCents !== null && discountCents >= 0 && discountCents <= subtotal;
  const total = subtotal - (discountValid ? discountCents : 0);
  const receivedCents = parseMoney(received);
  const change = method === "dinheiro" && receivedCents ? receivedCents - total : null;
  const canConfirm = method !== null && discountValid && (method !== "dinheiro" || change === null || change >= 0);

  const header = (
    <div className={styles.pageHeader}>
      <div>
        <h1>Comanda #{number}</h1>
        <p className={styles.subtitle}>
          {client ? client.name : "Cliente avulso"} · {barberName(barberId)}
        </p>
      </div>
    </div>
  );

  if (step === "cliente") {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    const found = term
      ? clients.filter((c) => c.name.toLowerCase().includes(term) || (digits !== "" && c.phone.replace(/\D/g, "").includes(digits)))
      : [];
    return (
      <>
        <div className={styles.pageHeader}><h1>Nova comanda</h1></div>
        <Card title="Barbeiro">
          <div className={styles.buttonGrid}>
            {barbers.map((b) => (
              <button
                key={b.id}
                type="button"
                className={b.id === barberId ? styles.button : styles.buttonSecondary}
                aria-pressed={b.id === barberId}
                onClick={() => setBarberId(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>
          <Note>Quem está logado já vem selecionado.</Note>
        </Card>
        <Card title="Cliente">
          <button
            type="button"
            className={`${styles.button} ${styles.buttonBlock}`}
            onClick={() => { setClient(null); setStep("itens"); }}
          >
            Cliente avulso (sem cadastro)
          </button>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="client-search">Ou buscar cliente cadastrado</label>
            <input
              id="client-search"
              className={styles.input}
              placeholder="Nome ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {found.length > 0 && (
            <ul className={styles.list}>
              {found.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`${styles.row} ${styles.rowButton}`}
                    onClick={() => { setClient(c); setStep("itens"); }}
                  >
                    <span className={styles.rowMain}>
                      <span>{c.name}</span>
                      <span className={styles.rowMeta}>{c.phone}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {term && found.length === 0 && <p className={styles.rowMeta}>Nenhum cliente encontrado.</p>}
        </Card>
      </>
    );
  }

  if (step === "itens") {
    const add = (o: Option) => setItems((list) => [...list, { key: Date.now() + list.length, name: o.name, price: o.price, barberId }]);
    return (
      <>
        {header}
        <Card title="Itens">
          {items.length === 0 ? (
            <p className={styles.rowMeta}>Nenhum item ainda. Toque em um serviço abaixo.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((i) => (
                <li key={i.key} className={styles.row}>
                  <span className={styles.rowMain}>
                    <span>{i.name}</span>
                    <span className={styles.rowMeta}>{barberName(i.barberId)}</span>
                  </span>
                  <span>
                    <strong>{formatBRL(i.price)}</strong>{" "}
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Remover ${i.name}`}
                      onClick={() => setItems((list) => list.filter((x) => x.key !== i.key))}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.total}><span>Total</span><span>{formatBRL(subtotal)}</span></div>
        </Card>
        <Card title="Adicionar serviço">
          <div className={styles.buttonGrid}>
            {services.map((s) => (
              <button key={s.id} type="button" className={`${styles.buttonSecondary} ${styles.buttonStack}`} onClick={() => add(s)}>
                {s.name}<small>{formatBRL(s.price)}</small>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Adicionar produto">
          <div className={styles.buttonGrid}>
            {products.map((p) => (
              <button key={p.id} type="button" className={`${styles.buttonSecondary} ${styles.buttonStack}`} onClick={() => add(p)}>
                {p.name}<small>{formatBRL(p.price)}</small>
              </button>
            ))}
          </div>
        </Card>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonBlock}`}
          disabled={items.length === 0}
          onClick={() => setStep("pagamento")}
        >
          Fechar comanda
        </button>
        {items.length === 0 ? (
          <Link href="/comandas" className={`${styles.buttonSecondary} ${styles.buttonBlock}`}>Descartar comanda vazia</Link>
        ) : (
          <Note>Para cancelar uma comanda com itens é preciso informar o motivo.</Note>
        )}
      </>
    );
  }

  if (step === "pagamento") {
    return (
      <>
        {header}
        <Card>
          {discountValid && discountCents > 0 && (
            <div className={styles.row}><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
          )}
          <div className={styles.total}><span>Total a pagar</span><span>{formatBRL(total)}</span></div>
        </Card>
        <Card title="Forma de pagamento">
          <div className={styles.buttonGrid}>
            {(Object.keys(methodLabel) as Method[]).map((m) => (
              <button
                key={m}
                type="button"
                className={m === method ? styles.button : styles.buttonSecondary}
                aria-pressed={m === method}
                onClick={() => setMethod(m)}
              >
                {methodLabel[m]}
              </button>
            ))}
          </div>
          {method === "dinheiro" && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="received">Dinheiro recebido (opcional, para calcular o troco)</label>
              <input id="received" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" value={received} onChange={(e) => setReceived(e.target.value)} />
              {receivedCents === null && <span className={styles.error}>Valor inválido.</span>}
              {change !== null && change >= 0 && <strong>Troco: {formatBRL(change)}</strong>}
              {change !== null && change < 0 && <span className={styles.error}>Faltam {formatBRL(-change)}.</span>}
            </div>
          )}
        </Card>
        {role === "owner" ? (
          <Card title="Desconto (só o dono)">
            <div className={styles.field}>
              <label className={styles.label} htmlFor="discount">Valor do desconto</label>
              <input id="discount" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              {!discountValid && <span className={styles.error}>Desconto inválido ou maior que o total.</span>}
            </div>
            <Note>O sistema guarda quem deu o desconto e de quanto.</Note>
          </Card>
        ) : (
          <Note>Desconto só pode ser dado pelo dono.</Note>
        )}
        <Card title="Observação (opcional)">
          <div className={styles.field}>
            <label className={styles.label} htmlFor="note">Ex.: pagamento dividido</label>
            <textarea id="note" className={styles.input} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Note>
            Pagamento dividido fica para a versão 2. Até lá: escolha a forma de maior valor e escreva aqui
            como foi pago (ex.: &quot;R$ 20 dinheiro + R$ 25 Pix&quot;). O dono corrige no fechamento do caixa.
          </Note>
        </Card>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonBlock}`}
          disabled={!canConfirm}
          onClick={() => setStep("fechada")}
        >
          Confirmar pagamento
        </button>
        <button type="button" className={`${styles.buttonSecondary} ${styles.buttonBlock}`} onClick={() => setStep("itens")}>
          Voltar
        </button>
      </>
    );
  }

  return (
    <>
      {header}
      <Card title="Comanda fechada ✓">
        <div className={styles.total}><span>{method ? methodLabel[method] : ""}</span><span>{formatBRL(total)}</span></div>
        {change !== null && change > 0 && <p>Troco: {formatBRL(change)}</p>}
        {note && <Note>{note}</Note>}
        <Note>Protótipo: nada foi salvo.</Note>
      </Card>
      <button type="button" className={`${styles.button} ${styles.buttonBlock}`} onClick={reset}>+ Nova comanda</button>
      <Link href="/" className={`${styles.buttonSecondary} ${styles.buttonBlock}`}>Voltar ao início</Link>
    </>
  );
}
