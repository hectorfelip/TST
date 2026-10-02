# Step 3 — Rules (DRAFT, waiting for approval)

> Status: **draft**. All rules are written as code and tested.
> Rule 5 was changed after your feedback (section 8.1). 5 rules still need
> your confirmation (section 8).
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
| Open a comanda | ✅ | ✅ |
| Add/remove items, close, cancel (open) — **own** comanda | ✅ | ✅ |
| Same actions on **any** comanda; see all comandas | ✅ | ❌ |
| Put an item in **another barber's** name | ✅ | ❌ |
| Give a discount | ✅ | ❌ |
| Cancel a **paid** comanda; correct its payment method | ✅ | ❌ |
| Open/close cash register; expenses; withdrawals; see the register | ✅ | ❌ |
| Register a client | ✅ | ✅ |
| Edit a client; erase client data (LGPD); see phone; see full history | ✅ | ❌ |
| Services, stock, team, reports, settings | ✅ | ❌ |

**R-TEN-01 (tenant isolation):** every rule that touches a record first checks
that it belongs to the user's barbershop. If not, the answer is "Registro não
encontrado" — we do not even confirm it exists.

## 3. Comanda (`service-orders/rules/comanda.ts`, `totals.ts`)

```
  open ──close──────────────► closed ──cancel (owner, reason)──► cancelled
    │                                    (money + products return)
    ├──cancel (with items, reason)──────────────────────────────► cancelled
    └──discard (no items, no reason)────────────────────────────► discarded
```

| ID | Rule |
|----|------|
| R-CMD-01 | Anyone logged in opens a comanda. The client is optional ("cliente avulso"). A client from another shop or an erased client is refused. |
| R-CMD-02 | "Own comanda" = opened by the barber **or** has at least one item in his name. |
| R-CMD-03 | A barber sees only his own comandas; the owner sees all. |
| R-CMD-04 | Items: services or products, quantity 1–20, whole numbers. |
| R-CMD-05 | The item **copies the name and price** at that moment. A later price change does not change old comandas. |
| R-CMD-06 | A barber can only put items **in his own name**. The owner can choose any **active** barber. |
| R-CMD-07 | Only **active** services and **active products for sale** can be added (internal-use products cannot). |
| R-CMD-08 | A barber removes only items in his own name. |
| R-CMD-09 | Free-text note, max 280 characters (used for split payments until v2). |
| R-CMD-10 | **Only the owner** gives discounts: whole cents, from 0 to the subtotal (0 removes it). Audited: who and how much. |
| R-CMD-11 | **Close:** at least 1 item; **cash register must be open**; one payment method; for cash the received amount is optional and must cover the total (change is calculated). Effects: 1 sale cash movement + 1 stock movement per product. |
| R-CMD-12 | The discount is split between items in proportion to their value, in whole cents, and always adds up exactly. |
| R-CMD-13 | **Barber revenue** = his items minus his share of the discount (ready for commission in v2). |
| R-CMD-14 | An empty open comanda is **discarded** without a reason. |
| R-CMD-15 | **Cancel:** always needs a reason (≥ 5 characters) and is audited. Open with items: the barber (own) or the owner. **Paid: owner only**, register must be open, and reversal movements return the money and the products. History is never deleted. |
| R-CMD-16 | The owner can **correct the payment method** of a paid comanda (e.g. Pix recorded as cash) only while **the same register is still open**. Two correction movements + audit. |
| R-CMD-17 | **Changing the items removes the discount**; the owner gives it again for the new items. |
| R-CMD-18 | *(new, after owner feedback)* The owner can **cancel several open comandas at once with one reason** (e.g. "Cliente não compareceu"). Empty ones are discarded. All or nothing; each cancellation is still audited. The screen asks for confirmation first. |

## 4. Cash register (`finance/rules/cash-register.ts`)

| ID | Rule |
|----|------|
| R-CSH-01 | Only the owner opens it. Opening cash ≥ 0. **Only one open register** per barbershop. |
| R-CSH-02 | **Cash in the drawer** = only `cash` movements: opening + cash sales − reversals − cash expenses − withdrawals ± corrections. Pix and cards never count. |
| R-CSH-03 | Expenses: owner only, value > 0, description required, any payment method. |
| R-CSH-04 | Withdrawal (sangria): owner only, reason required, **never more than the cash that should be in the drawer**, audited. |
| R-CSH-05 | **Close** *(revised after owner feedback)*: owner only; **open comandas do NOT block closing**; counted cash vs expected; any difference **requires a reason** and is audited. The difference is recorded, never "fixed". |
| R-CSH-06 | *(new)* When the register closes: **empty open comandas are discarded automatically**; open comandas **with items stay "pending"** for the next register (if paid later, the money goes to the register open at that moment). Their number and value are written in the audit log, so they are never silently forgotten. If closing fails, nothing is discarded. |

## 5. Stock, clients, team, services, settings

| ID | Rule |
|----|------|
| R-STK-01 | Only the owner manages products. Products for sale need a price; internal-use products have none. New products start at 0. |
| R-STK-02 | Low stock = **below** the minimum. |
| R-STK-03 | Purchase: whole quantity > 0. |
| R-STK-04 | **A sale is never blocked by the stock count.** Stock may go negative and shows as an alert. |
| R-STK-05 | Internal use / loss: quantity > 0 and a reason. |
| R-STK-06 | Adjustment after a physical count: reason required, audited (before/after). |
| R-CLI-01 | Owner and barbers can register a client. Phone is optional and stored as digits (Brazilian format validated). |
| R-CLI-02 | The same phone cannot belong to two clients in the same shop. |
| R-CLI-03 | Only the owner edits clients. |
| R-CLI-04 | **LGPD:** the owner erases name, phone and notes; comandas and money stay without personal data. Audited. Cannot be undone. |
| R-CLI-05 | **Decision B:** shared client base; a barber sees name, notes and **only his own visits — no phone**. Search by phone is owner-only. |
| R-CLI-06 | "Sumido" = no visit for more than *N* days. *N* is a **setting per barbershop** (7–365, default 30). A client with no visits is "new", not away. |
| R-EMP-01 | Only the owner adds people. E-mail is the login and must be unique. Each person has an individual login. |
| R-EMP-02 | A barbershop always keeps **at least one active owner**. |
| R-EMP-03 | People are deactivated, never deleted. Inactive people cannot log in or receive new items. Role change and deactivation are audited. |
| R-SRV-01..03 | Owner manages services (name 2–60, price > 0, 5–480 min). Services are deactivated, never deleted; a deactivated service leaves the favorites. |

## 6. Audit log

These actions always produce an audit entry (who, when, what, details).
Step 4 stores them in an **append-only** table (rows are never changed or
deleted):

discount · comanda cancellation · payment method correction · cash closed
with difference · **cash closed with pending comandas** · cash withdrawal · client data erased · stock adjustment ·
role change · person deactivated.

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
6. Store the barbershop **time zone** (Brazil has 4). "Today" and "this month"
   depend on it.

**Step 5 (Communication) must:**
1. Run the rules **on the server** for every request. Never trust totals,
   prices, roles or ids coming from the browser.
2. **Never send data to the browser that the user may not see.** Hiding it on
   the screen is not enough (bug found in this step, see section 9).
3. Define what happens when the internet drops while closing a comanda
   (the same request sent twice must not charge twice).

## 8. Rules I decided — please confirm (devil's advocate)

| # | My default | Why it can be wrong | Alternative |
|---|-----------|--------------------|-------------|
| 1 | **Only the owner opens the cash register**, and a comanda can only be **closed** with an open register. | If the owner arrives late, **no barber can receive payment**. In a small shop this blocks the whole morning. | Let the owner give "abrir caixa" to a trusted barber (a third role, e.g. *gerente*), or open the register automatically with R$ 0 at the first payment. |
| 2 | **A barber can cancel his own open comanda** (with a reason). | **Fraud risk:** the client pays cash, the barber cancels "cliente desistiu" and keeps the money. | Only the owner cancels comandas with items; or keep it and show "cancelamentos do dia por barbeiro" on the owner's dashboard. **My recommendation: the second** — blocking slows honest barbers, visibility catches dishonest ones. |
| 3 | **Stock can go negative** (sale never blocked). | The stock report can show nonsense numbers. | Block the sale when stock is 0. I think this is worse: the system's count is often wrong, and a real sale would be lost. |
| 4 | **Changing items removes the discount.** | The owner must come back to re-apply it — annoying if he is busy. | Keep the discount if it is still ≤ the new subtotal. Risk: a discount meant for one service gets applied to a bigger comanda. |
| ~~5~~ | ~~The cash register cannot close with open comandas.~~ | **Changed — see 8.1.** | |
| 6 | **Payment method correction only while the same register is open.** | A mistake found the next day cannot be fixed. | Allow corrections later with a "correction" movement in today's register. Risk: yesterday's report changes after it was closed. |

### 8.1 Rule 5 — changed after your feedback

**Your point:** blocking the register makes the owner cancel, one by one,
comandas of clients who never came (e.g. the 15h appointment), just to go home.
You are right: the rule created work and protected little.

**Why I did not simply remove the block:** an open comanda **with items** can
be a service that was **done and paid in cash, but never closed** — money
outside the system. If closing ignores it silently, nobody notices.

**New rules (R-CSH-05 revised, R-CSH-06, R-CMD-18):**

| Situation at closing time | What happens | Work for the owner |
|---------------------------|--------------|--------------------|
| Empty comanda (opened in advance, client never came) | Discarded automatically | None |
| Comanda with items, client never came | One button: **"Cancelar todas: cliente não compareceu"** (with confirmation) | 2 taps for all of them |
| Comanda with items, maybe not paid yet | Stays **pending** for the next day; recorded in the audit log with count and value | None now; it shows up again tomorrow |

**Devil's advocate on your example — "o agendamento das 15h":**

1. **The MVP has no agenda.** If barbers open comandas **in advance** to
   remember appointments, they are using the comanda as an agenda. That
   pollutes "comandas abertas" and the dashboard during the whole day.
   → **Question:** do barbers really do this? If yes, the agenda is a
   stronger need than we thought, and should be the **first item of v2**.
2. **Bulk cancel can hide fraud** (service done, cash in the pocket, then
   "não compareceu"). → It is owner-only, needs confirmation, and every
   cancellation stays in the audit log. In step 5, the owner dashboard should
   show **cancellations per barber**.
3. **Pending comandas can pile up forever** if nobody looks at them.
   → In step 5, the real screens will mark them **"pendente desde DD/MM"** on the
   dashboard (rule helper `isPendingFromBefore` is ready).

## 9. My verification of this step

- [x] **115 unit tests** (`npm test`), covering every rule ID above, including the cases that must **fail** (wrong role, wrong barbershop, invalid values, wrong state).
- [x] **Mutation check:** I broke 6 rules on purpose (cash counting Pix; barber allowed to give discounts; tenant check turned off; barber sees phones; discount cents lost; closing without an open register). **The tests caught all 6.** After the rule 5 change, 4 more deliberate mistakes in the new rules (discarding comandas with items; pending not audited; discarding even when closing fails; barber allowed to bulk cancel): **all caught.**
- [x] **Architecture test:** rules import no framework, no database and no screens; modules depend only on allowed modules (no cycles). The real dependency direction is now: *Comanda → Finance, Stock, Clients, Services, Team* (Finance never imports Comanda).
- [x] **Money:** a full day simulated in tests (open with R$ 100, Pix sale, cash sale with change, cancellation, payment correction): expected cash and totals per method always match.
- [x] **Decision B applied to the prototype:** barbers see no phones and only their own client history. Checked in the browser.
- [x] **Privacy bug found and fixed:** the "Nova comanda" screen was sending **all client phone numbers** to the barber's browser (hidden on screen, but readable in the page source). Now a barber's browser never receives them — checked automatically.
- [x] Prototype "Fechar caixa" follows the revised R-CSH-05/06: explains what will be discarded and what stays pending; bulk cancel with confirmation.
- [x] `npm run typecheck`, `npm run lint`, `npm run build` pass; browser checks: 35 (comanda + clients + cash) + 25 (roles) all pass.
- [x] Rule 5 changed after owner feedback (section 8.1).
- [ ] Owner confirmed rules 1, 2, 3, 4, 6 and the new rule 5.
- [ ] Owner approved this document.
- [ ] (Before step 4) Barbershop **owner** test — commission, discount and cash-opening rules may change.

## Glossary

- **Pure function:** a function that only uses its inputs and returns a result, without saving anything or depending on the clock. Easy to test.
- **Effect:** something that must be saved because of a rule (e.g. a cash movement).
- **Transaction:** a group of database changes that are saved all together or not at all.
- **Audit log:** a permanent record of sensitive actions: who did what, and when.
- **Mutation testing:** breaking the code on purpose to check that the tests notice.
- **Reversal (estorno):** a new movement that cancels an old one, instead of deleting it.
