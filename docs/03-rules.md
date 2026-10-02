# Step 3 — Rules (v3, waiting for approval)

> Status: **your decisions on rules 1–6 are implemented** (section 8).
> One thing grew: the MVP now has a **light agenda** (section 8.4).
> 4 points need your confirmation (section 8.6).
> Next step (4 — Data) only starts after approval.

## 1. What a "rule" is here

A rule is a decision the system makes **the same way every time**, no matter
which screen asks: *can this person do this? is this value valid? what happens
to the money and the stock?*

- All rules live in `src/modules/<module>/rules/` as **plain TypeScript
  functions**. They do not know about screens, the database or the internet.
- A rule never "saves" anything. It receives data and **returns** the new
  state plus the **effects** (cash movements, stock movements, audit entries).
  Step 4 saves all of them together, in one transaction.
- A rule never throws for a business problem. It returns `{ ok: false, error }`
  with a code (`FORBIDDEN`, `WRONG_TENANT`, `INVALID_INPUT`, `INVALID_STATE`,
  `NOT_ALLOWED`) and a message in Portuguese for the screen.
- Each rule has an ID (e.g. `R-CMD-11`). The same ID is in the code comment
  and in the test name, so you can search for it.

## 2. Permissions (`auth/rules/permissions.ts`)

One table decides everything. Screens use it to hide buttons; the server
(step 5) uses it to refuse requests.

| Action | Owner | Barber |
|--------|:-----:|:------:|
| Open a comanda; **book an appointment in his own name** | ✅ | ✅ |
| Add/remove items, close, mark **"não compareceu"** — **own** comanda | ✅ | ✅ |
| Same actions on **any** comanda; see all comandas | ✅ | ❌ |
| Put an item (or an appointment) in **another barber's** name | ✅ | ❌ |
| Give a discount | ✅ | ❌ |
| **Cancel an open comanda** *(changed: no longer a barber action)* | ✅ | ❌ |
| Cancel a **paid** comanda; correct its payment method | ✅ | ❌ |
| **Open** the cash register *(changed)* | ✅ | ✅ |
| **Close** the register; expenses; withdrawals; see the register | ✅ | ❌ |
| Register a client | ✅ | ✅ |
| Edit a client; erase client data (LGPD); see phone; see full history | ✅ | ❌ |
| Services, stock, team, reports, settings | ✅ | ❌ |

**A future "caixa" (cashier) role** is already prepared: the table above is data
(`ROLE_PERMISSIONS` in `permissions.ts`). Adding the role = one new entry
there; the compiler then shows every screen that needs a decision. A cashier
would open and close the register, record expenses and withdrawals and fix
payment methods, but would **not** give discounts or manage services, stock or team.

**R-TEN-01 (tenant isolation):** every rule that touches a record first checks
that it belongs to the user's barbershop. If not, the answer is "Registro não
encontrado" — we do not even confirm it exists.

## 3. Comanda (`service-orders/rules/comanda.ts`, `totals.ts`)

```
  open ──close (payment)───────────────► closed ──cancel (owner)──► cancelled
    │                                        (money + products return)
    ├─ no-show (appointment, after its time) ─► no_show     NOT a cancellation
    ├─ cancel (OWNER only, with a reason) ────► cancelled
    ├─ discard (no items, no reason) ─────────► discarded
    └─ pending for 5 days (system) ───────────► cancelled
```

| ID | Rule |
|----|------|
| R-CMD-01 | Anyone logged in opens a comanda. The client is optional ("cliente avulso"). A client from another shop or an erased client is refused. |
| R-CMD-02 | "Own comanda" = opened by the barber, **or** an appointment booked with him, **or** has at least one item in his name. |
| R-CMD-03 | A barber sees only his own comandas; the owner sees all. |
| R-CMD-04 | Items: services or products, quantity 1–20, whole numbers. |
| R-CMD-05 | The item **copies the name and price** at that moment. A later price change does not change old comandas. |
| R-CMD-06 | A barber can only put items **in his own name**. The owner can choose any **active** barber. |
| R-CMD-07 | Only **active** services and **active products for sale** can be added (internal-use products cannot). |
| R-CMD-08 | A barber removes only items in his own name. |
| R-CMD-21 | A removed item is **kept** in a trail (who, when). Without it: add an item, take the client's cash, remove the item, discard the empty comanda — nothing left to see. |
| R-CMD-09 | Free-text note, max 280 characters (used for split payments until v2). |
| R-CMD-10 | **Only the owner** gives discounts: whole cents, from 0 to the subtotal (0 removes it). Audited: who and how much. |
| R-CMD-11 | **Close:** at least 1 item; **cash register must be open**; one payment method; for cash the received amount is optional and must cover the total (change is calculated). Effects: 1 sale cash movement + 1 stock movement per product. |
| R-CMD-12 | The discount is split between items in proportion to their value, in whole cents, and always adds up exactly. |
| R-CMD-13 | **Barber revenue** = his items minus his share of the discount (ready for commission in v2). |
| R-CMD-14 | An empty open comanda is **discarded** without a reason. |
| R-CMD-15 | **Cancel** *(revised)*: always needs a reason (≥ 5 characters) and is audited. **Open or paid: owner only.** A paid one needs the register open, and reversal movements return the money and the products. History is never deleted. |
| R-CMD-16 | The owner can **correct the payment method** of a paid comanda (e.g. Pix recorded as cash) only while **the same register is still open**. Two correction movements + audit. |
| R-CMD-17 | **Changing the items removes the discount**; the owner gives it again for the new items. |
| R-CMD-18 | At closing, **every** open comanda gets an explicit decision by the owner, with a confirmation step (section 8.5). *(Replaces the "cancel all" button of the previous round.)* |
| R-CMD-19 | **"Não compareceu" (no-show) is not a cancellation.** The comanda is paused, leaves the day's agenda and the absence is recorded (comanda + audit log + the client's absence count). Only for appointments; only **after** the appointment time; the barber of that comanda or the owner. No money or stock is touched. |
| R-CMD-20 | **Appointment** = a comanda opened in advance: needs a **registered** client, a time that has not passed, at most 14 days ahead, an active barber. A barber books only in his own name; the owner for anyone. |
| R-CMD-22 | A pending comanda not paid within **N days (default 5, a setting)** is **cancelled by the system** (reason "Expirou…", author "system", audited). |

## 4. Cash register (`finance/rules/cash-register.ts`)

| ID | Rule |
|----|------|
| R-CSH-01 | *(revised)* **The owner or any barber opens it; only the owner closes it.** Opening cash ≥ 0. **Only one open register** per barbershop. Who opened is recorded. |
| R-CSH-02 | **Cash in the drawer** = only `cash` movements: opening + cash sales − reversals − cash expenses − withdrawals ± corrections. Pix and cards never count. |
| R-CSH-03 | Expenses: owner only, value > 0, description required, any payment method. |
| R-CSH-04 | Withdrawal (sangria): owner only, reason required, **never more than the cash that should be in the drawer**, audited. |
| R-CSH-05 | **Close**: owner only; **open comandas do NOT block closing**; counted cash vs expected; any difference **requires a reason** and is audited. The difference is recorded, never "fixed". The owner says how much cash **stays in the drawer** for tomorrow (default: all of it). |
| R-CSH-06 | When the register closes, **empty** comandas are discarded (walk-ins) or marked no-show (appointments); comandas **with items** stay **pending** (if paid later, the money goes to the register open at that moment). Their count and value are written in the audit log. If closing fails, nothing changes. |
| R-CSH-07 | *(new)* **Opening cash must match what was left yesterday.** A different amount needs a reason and warns the owner (audit). Otherwise whoever opens could declare less cash and keep the difference. |
| R-CSH-08 | *(new)* **At closing the owner is alerted about every unpaid service** (count and total), and **cannot close the register until he has decided each one** (no-show, pending, discard or "conferi"). A no-show that a barber marked **with items already added** is also shown for review. |

## 5. Stock, clients, team, services, settings

| ID | Rule |
|----|------|
| R-STK-01 | Only the owner manages products. Products for sale need a price; internal-use products have none. New products start at 0. |
| R-STK-02 | Low stock = **below** the minimum. |
| R-STK-03 | Purchase: whole quantity > 0. |
| R-STK-04 | *(revised)* If the system stock is lower than what is being sold, the item is **not added until the person confirms "I have the product in hand to deliver now"**. The confirmation is saved with his name, audited when the comanda closes, and stock may then go negative as an alert for the owner to recount. |
| R-STK-05 | Internal use / loss: quantity > 0 and a reason. |
| R-STK-06 | Adjustment after a physical count: reason required, audited (before/after). |
| R-CLI-01 | Owner and barbers can register a client. Phone is optional and stored as digits (Brazilian format validated). |
| R-CLI-02 | The same phone cannot belong to two clients in the same shop. |
| R-CLI-03 | Only the owner edits clients. |
| R-CLI-04 | **LGPD:** the owner erases name, phone and notes; comandas and money stay without personal data. Audited. Cannot be undone. |
| R-CLI-05 | **Decision B:** shared client base; a barber sees name, notes and **only his own visits — no phone**. Search by phone is owner-only. |
| R-CLI-06 | "Sumido" = no visit for more than *N* days. *N* is a **setting per barbershop** (7–365, default 30). A client with no visits is "new", not away. |
| R-SET-01 | Settings per barbershop: days for "sumido", **days a pending comanda lasts (1–30, default 5)**, and the **time zone** (decides what "today" and "tomorrow" mean). |
| R-EMP-01 | Only the owner adds people. E-mail is the login and must be unique. Each person has an individual login. |
| R-EMP-02 | A barbershop always keeps **at least one active owner**. |
| R-EMP-03 | People are deactivated, never deleted. Inactive people cannot log in or receive new items. Role change and deactivation are audited. |
| R-SRV-01..03 | Owner manages services (name 2–60, price > 0, 5–480 min). Services are deactivated, never deleted; a deactivated service leaves the favorites. |

## 6. Audit log

These actions always produce an audit entry (who, when, what, details).
Step 4 stores them in an **append-only** table (rows are never changed or
deleted):

discount · comanda cancellation · **comanda expired (system)** · **no-show** ·
payment method correction · **sale without stock** · **cash opened with a
different amount** · cash closed with difference · cash closed with pending
comandas · cash withdrawal · client data erased · stock adjustment · role
change · person deactivated.

## 7. Instructions for the next steps

**Step 4 (Data) must:**
1. Save each rule's effects in **one transaction** (e.g. closing a comanda =
   comanda + cash movement + stock movements, all or nothing).
2. Give comanda numbers in sequence **per barbershop** with no duplicates
   (two barbers closing at the same second).
3. Enforce in the database too: one open register per shop; unique phone per
   shop; unique e-mail; `barbershop_id` on every table.
4. Calculate stock and cash from **movements** (never store a total that can
   drift away from its history).
5. Include tests that try to read another shop's data and must fail.
6. Store the barbershop **time zone** (now a setting in the rules, default
   America/Sao_Paulo). "Today", "tomorrow" and "this month" depend on it.
7. Save `pendingSince`, `noShow`, `appointment`, removed items and
   `leftInDrawer`; they feed the owner's alerts.

**Step 5 (Communication) must:**
1. Run the rules **on the server** for every request. Never trust totals,
   prices, roles or ids coming from the browser.
2. **Never send data to the browser that the user may not see.** Hiding it on
   the screen is not enough (bug found in this step, see section 9).
3. Define what happens when the internet drops while closing a comanda
   (the same request sent twice must not charge twice).
4. Run `expirePendingComandas` **once a day** (scheduled job).
5. Owner dashboard: **per barber** — no-shows, cancellations, removed items,
   sales without stock, openings with a different amount. These numbers are
   the early warning for the loopholes listed in section 8.

## 8. Your decisions on the 6 rules — implemented

| # | Your decision | What I implemented |
|---|---------------|--------------------|
| 1 | The barber may **open** the register; **closing** only the owner (or a future "caixa" role). | R-CSH-01 revised; permission table prepared for a third role; R-CSH-07 (see 8.3). |
| 2 | The barber does **not cancel**: "não compareceu" pauses the comanda, the information is stored, and it is **not** marked as cancelled. | New state `no_show` (R-CMD-19). A barber can no longer cancel an open comanda (R-CMD-15). |
| 3 | Concern: what if the product cannot be restocked in time to deliver to the client? | R-STK-04 revised: confirmation "I have it in hand" (8.3). |
| 4 | Keep: changing items removes the discount. | Unchanged (R-CMD-17). |
| 5 | A **confirmation step in each option** at closing. | Section 8.5. |
| 6 | Explain why it is advantageous. | Section 8.2. |

### 8.1 Your answers to my 3 questions

| Your answer | Result |
|-------------|--------|
| 1. Barbers need to see their booked clients, today or tomorrow. | **Light agenda** in the MVP (8.4). |
| 2. At the end of the day, every unpaid service must be **alerted to the owner** when closing the register; services that were not attended **cannot be cancelled before** that check. | R-CSH-08: a list of every unpaid service with its value; the register cannot close until each one is decided; a no-show with items already added is reviewed too. A no-show is only possible through the appointment flow, and the owner sees it before the day ends. |
| 3. Keep the idea of limiting pending comandas, with a limit of 5 days, then the booking is cancelled. | R-CMD-22; the 5 days is a **setting** (1–30). Each closing shows "vence em N dias". |

### 8.2 Rule 6 — why "a closed day is sealed" is an advantage

*Rule 6: a payment method can only be corrected while the register where it
was paid is still open.*

Simple example:

- **Monday.** The system expects **R$ 300** in cash. The owner counts **R$ 200**.
  Difference: **−R$ 100**, written down with a reason. The day is closed.
- **Tuesday.** Someone changes a R$ 100 sale from "dinheiro" to "Pix".
  Monday now expects only R$ 200 → **difference 0**. The missing R$ 100
  **disappeared from the books**. And Monday's Pix total now has R$ 100 that
  never reached the bank or the card-machine report.

If corrections were allowed after closing, **any shortage could be hidden
days later**, by accident or on purpose. Sealing the day gives you:

1. **A difference that stays honest:** what was counted is what was true that day.
2. **Reports that do not change** after the owner, an accountant or a partner
   has seen them.
3. **Matching with the bank:** Pix and card totals of a closed day stay equal
   to the bank and card-machine statements.
4. **Less temptation:** nobody can "fix" yesterday.

The cost: a mistake noticed the next day cannot be corrected in place. The
safe way to handle it (if this becomes common in the owner test) is an
**explicit adjustment in today's register, with a reason**, that appears as
its own line and never rewrites yesterday.

### 8.3 Devil's advocate on the decisions

**Rule 1 — barber opens the register.**
The risk moved: a barber could open with **less** cash than really is in the
drawer and keep the difference (the closing count would still "match").
→ **R-CSH-07:** the opening amount is compared with the cash that was left at
the last closing. Different = a **reason is required** and the owner is warned.
The owner decides how much stays in the drawer at closing (e.g. he takes the
profit home and leaves R$ 100 for change).

**Rule 2 — "não compareceu" instead of cancel.**
A no-show can hide the same fraud as a cancellation: the haircut was done,
the client paid cash, the barber says "didn't show". Controls:
(a) only for **appointments**, never walk-ins;
(b) only **after** the appointment time;
(c) **audited**, with the number of items and value;
(d) the owner **reviews at closing** every no-show that has items;
(e) removed items leave a trail (R-CMD-21), so "add, take the cash, remove,
discard" is visible;
(f) in step 5, the dashboard shows **no-shows per barber and per client**
(a client that always misses is also useful to know).
A barber who made a mistake does not cancel: he removes **his own** item.

**Rule 3 — stock.**
My worry was the opposite of yours: the system count is wrong but the
product exists, and a blocked sale is lost money. Your worry is real too:
selling something that is not there. Now both are covered: the person
answers **"Do you have it in hand to deliver now?"**. *No* = nothing is sold.
*Yes* = the sale goes ahead, with his name saved, and the owner sees a
**negative stock** alert to recount. What still can happen: someone says "yes"
without the product (it is audited, so it can be checked), and two barbers
each sell the last unit at the same time (the system does not reserve stock
between open comandas).

### 8.4 The agenda — a scope change you need to know about

You said barbers need to see their booked clients for today and tomorrow.
That is an **agenda**, which I had put in version 2. The smallest version
that answers your need is in the MVP now:

- an **appointment = a comanda opened in advance** (client, time, barber);
- **"Clientes marcados hoje / amanhã"** on the barber's "Meu dia", and an
  **Agenda** screen (the owner sees all barbers);
- a no-show leaves the list.

**Not included** (still version 2): calendar grid, warning for two clients at
the same time, WhatsApp reminders, online booking by the client.

Devil's advocate:

1. **An appointment needs a registered client.** A walk-in has no name to wait
   for. A barber who books must register the client first (name only is enough).
   If that is slow, people will go back to paper.
2. **No double-booking warning:** two clients at 15:00 for the same barber is
   accepted silently. Some barbers like it, most do not.
3. The agenda is **exactly the feature that makes owners compare the system
   with a paper notebook or WhatsApp**. Test it in the owner demo before
   investing more.
4. "Today" and "tomorrow" follow the **barbershop's time zone**. A server in
   UTC would show tomorrow's clients from 21h on. (Tested.)

### 8.5 Rule 5 — closing the register, with a confirmation in every option

The owner goes through **every** open comanda; nothing is decided for him:

| Comanda | Options | Confirmation text |
|---------|---------|-------------------|
| Unpaid, **appointment** | *Foi atendido: receber pagamento* (goes to payment) · **Cliente não compareceu** · **Deixar pendente (5 dias)** | "…A falta fica registrada. **Não é um cancelamento.**" / "…Depois de 5 dias é cancelada automaticamente. Você é alertado em cada fechamento." |
| Unpaid, **walk-in** | *Receber pagamento* · **Deixar pendente** (no "não compareceu": a walk-in cannot miss an appointment) | idem |
| **Empty** appointment | **Cliente não compareceu** | idem |
| **Empty** walk-in | **Descartar comanda vazia** | "Não tem itens nem dinheiro envolvido." |
| No-show **with items**, marked by a barber | **Conferi: está correto** | "O barbeiro marcou como não compareceu, mas havia R$ X em itens." |

Then a **final confirmation screen** lists the cash count, the difference,
the cash left for tomorrow and what will happen to each comanda. The rule
refuses to close without a decision for each comanda **and** without
`confirmed = true`, so a screen that forgets the question cannot skip it.

What is **not** possible at closing: *cancelling* a comanda with items, or
*discarding* one that has a service on it. To cancel, the owner opens the
comanda and gives a reason.

Screenshots (phone): [Meu dia with the agenda](img/03-mobile-meu-dia-agenda.png) ·
[Não compareceu, with confirmation](img/03-mobile-nao-compareceu.png) ·
[Fechar caixa](img/03-mobile-fechar-caixa.png)

### 8.6 Please confirm

1. **The agenda enters the MVP** (8.4). It is the biggest change of this round.
2. **A barber opening with a different amount** is allowed with a reason and
   warns the owner (R-CSH-07), instead of being blocked.
3. **The system cancels pending comandas after 5 days.** A comanda with items
   may be a service that was done and never paid, so this can erase money
   without anyone deciding. The owner sees the countdown at every closing and
   on the dashboard, and it is audited. Accept?
4. **"I have it in hand" confirmation for stock** (8.3) — is it the answer to
   your concern?

## 9. My verification of this step

- [x] **169 unit tests** (`npm test`). Every rule ID above has tests, including the cases that must **fail** (wrong role, wrong barbershop, invalid values, wrong state, missing confirmation).
- [x] **Breaking the rules on purpose:** round 1: 6 breaks (cash counting Pix; barber giving discounts; tenant check off; barber seeing phones; discount cents lost; closing without an open register). This round: **16 more** — barber cancelling or closing the register; no-show before the time, on a walk-in, or stored as "cancelled"; stock confirmation skipped; removed items not kept; opening amount not compared or not audited; closing without confirmation or with undecided comandas; discarding a comanda with a service; pending never expiring or expiring early; keeping pending restarting the countdown; agenda showing other barbers' clients. **All caught by the tests.**
- [x] **Architecture test:** rules import no framework, no database and no screens, and modules depend only on allowed modules.
- [x] **Time zone:** 23:30 in São Paulo is still "today" even though UTC is already tomorrow (tested).
- [x] **Browser (phone size):** 79 checks on the new flows — main flow in 6 taps; stock question; barber's agenda; no-show with confirmation, disabled before the time; barber has **no** cancel button; booking form; barber opens the register (reason required if different); closing the register with 8 comandas, each option confirmed, final summary — **all pass**. Plus 25 role checks and 15 screens without horizontal scroll.
- [x] `npm run typecheck`, `npm run lint`, `npm run build` pass.
- [ ] Owner confirmed the 4 points of section 8.6.
- [ ] Owner approved this document.
- [ ] (Before step 4) Test with a barbershop **owner**: agenda, no-show, commission and cash-opening rules.

## Glossary

- **Pure function:** a function that only uses its inputs and returns a result, without saving anything or depending on the clock. Easy to test.
- **Effect:** something that must be saved because of a rule (e.g. a cash movement).
- **Transaction:** a group of database changes that are saved all together or not at all.
- **Audit log:** a permanent record of sensitive actions: who did what, and when.
- **Mutation testing:** breaking the code on purpose to check that the tests notice.
- **Reversal (estorno):** a new movement that cancels an old one, instead of deleting it.
- **No-show (não compareceu):** the client booked and did not come. Recorded, not a cancellation.
- **Sealed day:** a closed register whose numbers can no longer be changed.
- **Scheduled job:** something the system does by itself at a set time (e.g. once a day).
