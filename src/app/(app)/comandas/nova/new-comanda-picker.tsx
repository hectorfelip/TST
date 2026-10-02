"use client";

/**
 * Step 1 of a new comanda: who is the client? Choosing creates the REAL comanda (it gets its number)
 * and goes to it, where services and products are added and the payment is received.
 * An empty comanda is never a problem: it can be discarded, and it never blocks the register.
 */
import { useState } from "react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, Note, styles } from "@/components/ui";
import { openComandaAction } from "@/modules/service-orders/api/actions";

type Person = { id: string; name: string; phone: string };

export function NewComandaPicker({ clients }: { clients: Person[] }) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const digits = term.replace(/\D/g, "");
  const found = term ? clients.filter((c) => c.name.toLowerCase().includes(term) || (digits !== "" && c.phone.replace(/\D/g, "").includes(digits))).slice(0, 20) : [];

  return (
    <ActionForm action={openComandaAction}>
      <Card title="Cliente">
        <button type="submit" name="clientId" value="" className={`${styles.button} ${styles.buttonBlock}`}>
          Cliente avulso (sem cadastro)
        </button>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="client-search">Ou buscar cliente cadastrado</label>
          <input id="client-search" className={styles.input} placeholder="Nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
        </div>
        {found.length > 0 && (
          <ul className={styles.list}>
            {found.map((c) => (
              <li key={c.id}>
                <button type="submit" name="clientId" value={c.id} className={`${styles.row} ${styles.rowButton}`}>
                  <span className={styles.rowMain}>
                    <span>{c.name}</span>
                    {c.phone && <span className={styles.rowMeta}>{c.phone}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {term && found.length === 0 && <p className={styles.rowMeta}>Nenhum cliente encontrado.</p>}
        <Link href="/clientes/novo" className={styles.buttonSecondary}>+ Cadastrar cliente novo</Link>
      </Card>
      <Note>A comanda recebe o número assim que você escolhe. Se o cliente desistir antes de lançar algo, é só descartar.</Note>
    </ActionForm>
  );
}
