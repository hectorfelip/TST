# Step 5 — Communication (DRAFT, waiting for approval)

> Status: **draft.** The screens now talk to the real database. Everything below was tried in a real browser.
> 4 points need your decision (section 11). Step 6 (Review) only starts after approval.

## 1. What this step delivers, in simple words

Until step 4 the screens showed **fake data** and nothing was saved. Now:

- **Real login** (e-mail + password). Each person has their own account.
- **Every screen reads the real database** and **every button saves for real**: comandas, items, payment, cash register, clients, services, stock, team, settings, reports.
- The **server decides everything**. The browser only sends "what the person typed" and "which thing". It never sends the barbershop, the role, a price or a total.
- **A double tap does not charge twice.** A refused payment leaves nothing half-saved.
- **A daily job** cancels the pending comandas that passed their deadline (only for barbershops that kept the option on).

The step 2 mock-up (`src/prototype`) is **gone**.

## 2. The journey of one tap (example: "Confirmar pagamento")

```
phone  ──►  Next.js server                                         PostgreSQL
 tap        1. is there a session cookie, and is its signature OK?
            2. ask the database WHO this is, RIGHT NOW (role, active, password date)
            3. may this role do it?  (permission table of step 3)
            4. open ONE transaction for THIS barbershop  ───────►  Row Level Security on
            5. same key already used?  yes → do nothing, answer "already done"
            6. note + discount + payment (the rules of step 3 decide)
            7. refused halfway?  → undo EVERYTHING        ◄───────  rollback
               all good?          → save everything together ───►  commit
 answer ◄── 8. a short message in words, or the next screen
```

The files: `src/server/auth.ts` (steps 1–2), `src/server/run.ts` (3–8), `src/db/atomic.ts` + `src/db/idempotency.ts` (4–7),
`src/modules/*/api/actions.ts` (the buttons), `src/modules/*/api/queries.ts` (what the pages read).

## 3. Login and sessions

| Question | Answer |
|----------|--------|
| How does a person log in? | E-mail + password. The e-mail is the login (unique in the whole system, rule R-EMP-01). |
| How is the password stored? | Only as a **salted scrypt hash**, in a table the application role **cannot read** (`employee_credentials`). It can only call small database functions. |
| Wrong password? | **One single vague message** for every failure (wrong e-mail, wrong password, inactive, locked), and the same response time, so nobody can discover which e-mails exist. |
| Brute force? | 5 wrong passwords lock that person for **15 minutes**. |
| What is in the cookie? | Only "who" and "when", signed with a secret (`SESSION_SECRET`). `httpOnly` (page scripts cannot read it), `sameSite=lax`, `secure` when online. Valid for **1 day** (decision 3). |
| Is the role in the cookie? | **No.** Role, barbershop and "still active" are read from the database **on every request**. If the owner deactivates, demotes or resets someone, it takes effect on their **next tap**. |
| New password? | Every session made before the change stops working (the date of the last password change is compared). |
| First password? | The owner sets it when adding the person (all or nothing). The first owner gets it from `npm run db:create-barbershop`. Forgot the owner's own password? `npm run db:set-password`. **Every password given by someone else is TEMPORARY** (decision 2): at the next login the person sees only "Escolha a sua senha" (menu hidden, every other screen and action refused) until they choose their own, which must differ from the temporary one. Only the demo data opts out. |

**Honest note:** step 4 left a comment saying "passwords never live in this database" (the idea was an external login service).
I changed that on purpose: a login service (Supabase Auth, magic link by e-mail) cannot be tried here without creating a project
(which you did not ask for), and the password version is fully testable. The price: **we** now carry the responsibility of
storing passwords. It is decision 1 in section 11.

## 4. Who may do what (three locks)

1. **The menu** hides screens the role cannot use (comfort only).
2. **The server** checks the permission before running an action, and again inside the rule (`FORBIDDEN`).
3. **The database** isolates barbershops (Row Level Security), whatever the code does.

| Rule answers with… | The person sees |
|---|---|
| `FORBIDDEN` | "Você não tem permissão para esta ação." |
| `WRONG_TENANT` | "Registro não encontrado." (never "it exists but is not yours") |
| `INVALID_INPUT` | the specific message ("Preço deve ser maior que zero.") |
| `INVALID_STATE` | e.g. "Já existe um caixa aberto." |
| `NOT_ALLOWED` | e.g. "Este e-mail já está em uso." |
| `NEEDS_CONFIRMATION` | the stock question: "Você tem o produto em mãos?" with a yes button |
| session over | "Sua sessão acabou. Entre de novo." with a link |
| something unforeseen | "Algo deu errado. Nada foi salvo." The details go to the server log, never to the screen. |

Phones: a barber's browser **never receives** a phone number (not even in the page source). The client search accepts phone digits, but the list shows names only.

## 5. "Do it once" and "all or nothing"

- **Idempotency key.** Every form sends a random key. A double tap or a retry after the signal dropped sends the **same** key: the server recognises it and does nothing. After an answer, the form makes a new key. A request that fails does **not** use up its key (fix the problem and send again). Keys are saved **in the same transaction** as the effect, and two identical requests at the same instant wait for each other.
- **A refusal undoes everything.** "Pay with discount" saves the note, the discount and the payment together. If the payment is refused (e.g. no open register), the discount that was already written is **rolled back**. Tested with a real database, and the test fails if this protection is removed.

## 6. What changed on the screens (honest list)

| Screen | Change from the step 2 mock-up | Why |
|---|---|---|
| New comanda | Choosing the client **creates the real comanda** (it gets its number) and goes to it; items are added there. Before, everything was kept in the browser until the end. | A comanda that exists only in the browser is lost if the phone locks or the page reloads. An empty comanda is harmless (it can be discarded, and never blocks the register). |
| Comanda | "Quem fez" (owner only), all active services (favorites in big buttons, others under "Outros serviços"), the stock question, remove item (×), cancel/discard/no-show with confirmation, owner can correct the payment method while the register is open. | The mock-up buttons did nothing. |
| Fechar caixa | Same flow of step 3; **nothing is saved until the last "Sim, fechar o caixa"**, and the result shown is the one the server calculated. | |
| Equipe, Serviços, Estoque, Clientes, Caixa | Real forms (add, edit, deactivate, entry/adjust/loss of stock, expense, withdrawal). | The mock-up only had links. |
| Menu | "Ver como barbeiro/dono" switch removed; **Sair** and **Minha senha** added. | Real logins now. |
| Reports | Real numbers of the **current month** in the barbershop's time zone. "Retiradas" are shown apart (not an expense). | |

## 7. The daily job

`GET /api/jobs/expiry` with `Authorization: Bearer <CRON_SECRET>`. Any scheduler can call it once a day (Vercel Cron, GitHub Actions, cron + curl).
It cancels expired pending comandas (only barbershops with the option on) and forgets idempotency keys older than 30 days.
Safe to call twice. Without the secret it answers 401. It is the **only** place that uses the owner connection while the app runs.

## 8. What I found while testing (real problems, now fixed)

- **Two queries at once in one transaction** (my own `Promise.all`) made the database driver warn that it will **refuse** this in its next major version. Fixed twice: the code is sequential, and the transaction itself now makes queries wait in line (a test fails without it).
- **The first password** of the owner cannot be "changed" (there is no current password to type). Solved with an admin door (`db:create-barbershop`, `db:set-password`).
- **A refresh after closing the register** would replace the "Caixa fechado ✓" summary with "no open register". Closing the register no longer refreshes the page.
- **A button label test passed for the wrong reason** (Next.js has its own invisible `role="alert"`). Browser tests now wait for the real message.
- Found before shipping, by design review: a refused payment after a saved discount (section 5), and a stolen session surviving a deactivation (section 3). Both have tests.

## 9. Devil's advocate: risks and how they are handled

| Risk | Why it matters | Solution / status |
|---|---|---|
| **We store passwords** | A leak of the hashes is our responsibility. | Slow salted hash, hashes unreadable by the app role, lock after 5 mistakes. Moving to an external login service later is possible: only `src/modules/auth` and `src/server/auth.ts` change. |
| **The owner knows the initial password of each person** | He could log in as them. | **Solved by decision 2:** the first login forces a new password that only the person knows (tested in the browser). Until that first login the temporary one still works: hand it over in person. |
| **No per-IP limit** | The lock protects one account; an attacker can try many e-mails. | The slow hash limits the speed. Add a limit at the hosting layer (firewall/WAF) before real use (step 6). |
| **Login needs the hash to leave the database** | `login_lookup` returns it to the application role. | Only code running as `app_user` can call it, every query is parameterized, and the application has no way to run text from the browser as SQL. Accepted. |
| **No e-mail recovery** | Owner forgot the password. | Another owner resets it; otherwise `db:set-password`. A support routine (who is allowed to ask?) must exist before real use. |
| **1-day sessions** | A stolen phone stays logged in until the cookie expires. | One day maximum (decision 3); changing the password logs every device out; deactivating the person stops them immediately. The cost: people log in again every morning. No "log out all devices" button yet. |
| **Cookie is `secure` only online** | Over plain http a cookie can be read on the network. | Production must be https (any modern host). |
| **No Content-Security-Policy** | A future script bug would be easier to exploit. | Basic headers are on (no framing, no sniffing, no referrer leak). A strict CSP is step 6. |
| **The browser's totals are for reading only** | A modified page could show a wrong total. | The server recomputes everything; the browser's numbers are never trusted. |
| **Today/tomorrow depend on the time zone** | A server in UTC would show the wrong day after 21h. | Always the barbershop's zone (tested, including 23:30). |
| **Simple month report** | Only the current month. | Choosing another month is an easy next improvement. |

## 10. Decisions for you

1. **Login by password stored by us:** ✅ **kept** (decided). An external login service can be reconsidered later with real feedback.
2. **Force a new password at the first login:** ✅ **yes** (decided, done: migration `004_temporary_passwords.sql`).
3. **Session length:** ✅ **one day** (decided, done).
4. **Where does the online demo live?** ⏳ Open. The code is ready for any host with Node. Creating the Supabase project (database) and the hosting account needs your explicit go, see the chat answer.

## 11. Handover to Step 6 (Review)

- Strict Content-Security-Policy and a limit on login tries per address.
- Try the real restore of a backup in the real Supabase project (decision of step 4).
- A full review with the owner of the barbershop using the online demo.
- Performance with a month of real-size data (`EXPLAIN` on the day lists).

## 12. My verification of this step

- [x] **Typecheck, lint, production build** pass.
- [x] **Unit tests** (rules, session cookie, password rules, forms, views) and **database tests** (login, lockout, idempotency, atomic refusal, reports, isolation, backup/restore…) all pass.
- [x] **Browser, real app, real database, ~60 checks** (`e2e/`): login failure message; **the temporary-password screen (menu hidden, every other screen redirects, new password must differ)**; a whole day (open comanda, add item, pay, expense, reports, close the register with decisions, logout); a barber is refused on 7 owner screens and **cannot open the owner's comanda by URL**; **no phone digits in a barber's page source**; stock question; scheduling and no-show; duplicate phone; settings; **a deactivated person is thrown out on the next tap**; a password reset logs the other devices out; own password change; the daily job (401 without the secret).
- [x] **Mistakes planted on purpose were caught:** lock threshold changed to 500, the transaction queue removed, the rollback on refusal removed.
- [x] Owner answered decisions 1–3 of section 10 (4, the hosting, is open).
- [ ] Owner approved this document.

## Glossary (new words)

- **Session cookie:** a small text the browser keeps and sends with every request, saying "this is the same person who logged in".
- **Hash (scrypt):** a one-way scramble of the password. Nobody can turn it back into the password; the system only compares scrambles.
- **Salt:** random text mixed into each hash, so two equal passwords look different.
- **Server action:** a function that runs on the server when a button is pressed.
- **Idempotency key:** a random label of one request, so repeating it does not repeat its effect.
- **Rollback:** undo everything a transaction wrote.
- **Cron job:** a task a scheduler runs at fixed times.
- **CSP (Content-Security-Policy):** a rule that tells the browser which scripts a page may run.
