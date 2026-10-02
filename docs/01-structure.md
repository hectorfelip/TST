# Step 1 — Structure (APPROVED)

> Status: **approved by the owner.**
> Changes after approval: `src/components` (shared UI) and `src/prototype` (fake data, removed in step 5) were added in step 2.
> In step 3 the dependency direction was corrected: the Comanda writes into Finance and Stock, so **Finance does not depend on Comanda** (checked by `src/modules/architecture.test.ts`).

## 1. What problem are we solving?

A small barbershop today usually controls everything on paper, WhatsApp and a
notebook. The owner does not know, at the end of the month:

- how much money came in and went out;
- how much each barber must receive (commission);
- which products are running out;
- which clients stopped coming.

The MVP must answer these four questions. If a feature does not help to answer
one of them, it is **out of the MVP**.

> **MVP (Minimum Viable Product):** the smallest version of the product that a
> real person can use and that proves the idea works.

## 2. Modules

The original request had 5 areas: finance, stock, clients, employees and
services. During my review I found one **missing piece that connects all of
them**: the *service order* (in Portuguese: **comanda / atendimento**).

Without it, the barber must type the same sale in 3 places (finance, stock,
commission). People do not do that, so the data becomes wrong and the system
is abandoned.

With the service order, **one action** ("close the comanda") updates everything:

```
             ┌──────────────┐
  Client ───►│   COMANDA    │◄─── Barber (employee)
             │ (service     │
  Services ─►│   order)     │◄─── Products sold
             └──────┬───────┘
                    │ close + payment
      ┌─────────────┼──────────────┐
      ▼             ▼              ▼
  Finance        Stock        Barber revenue
  (money in)   (product out)  (commission: v2)
```

| # | Module | What it does in the MVP | Depends on |
|---|--------|------------------------|------------|
| 0a | **Barbershops (tenants)** | Each barbershop is a separate customer of the SaaS. Created manually by the platform admin in the MVP (no self sign-up, no billing yet). | — |
| 0b | **Auth / Users** | Login. Two roles: *owner* (sees everything) and *barber* (sees only own comandas and own revenue). | — |
| 1 | **Clients** | Name, phone, notes, history of visits. | — |
| 2 | **Employees** | Name, role, active or not. *(Commission calculation is out of the MVP — see decision 5.)* | Auth |
| 3 | **Services** | Catalog: name, price, average time. | — |
| 4 | **Stock** | Products (for sale or for internal use), quantity, minimum quantity alert, stock movements. | — |
| 5 | **Comanda** *(new)* | Open → add services/products → close with payment method. | 1, 2, 3, 4, 6 |
| 6 | **Finance** | Cash register (open/close of the day), money in, money out (expenses), simple monthly report, revenue **per barber** (no commission math). | — *(corrected in step 3)* |

### Out of the MVP (on purpose)

These are good ideas, but each one could double the work. They wait for version 2:

- Online booking / calendar (agenda) for clients
- WhatsApp or SMS messages to clients
- Electronic invoice (NF-e / NFS-e)
- Card machine or PIX integration (the MVP only **records** the payment method)
- More than one unit (branch)
- Loyalty program, subscriptions ("clube de assinatura")
- **Commission calculation** (decision 5) — but the data needed for it is saved from day one
- Self sign-up and monthly billing of barbershops (SaaS billing)

## 3. Architecture

**Modular monolith, web, responsive (works on phone and computer).**

- **Monolith:** one single application and one database. Easy to build, test and
  deploy. The opposite (microservices) is overkill for an MVP.
- **Modular:** inside the code, each business area lives in its own folder and
  only talks to others through a small, clear interface. So the code does not
  become a mess when it grows.
- **Web + responsive:** the barber uses the phone, the owner uses the phone or a
  computer. No app store needed.

Layers inside each module (from outside to inside):

```
Interface (screens)  →  Rules (use cases)  →  Data (database access)
     step 2                  step 3                 step 4
```

The rules layer does **not** know about screens or about the database. This is
what lets us test rules alone and change the screen without breaking the money
calculations.

## 4. Stack (approved: TypeScript + Next.js)

| Part | Recommendation | Why |
|------|---------------|-----|
| Language | TypeScript | Same language in screen and server; types catch errors in money calculations. |
| Framework | Next.js | Screens + server in one project. |
| Database | PostgreSQL (SQLite for local development) | Reliable for money data; free hosting options exist. |
| Data access | Prisma | Database schema written in one file, easy migrations. |
| Tests | Vitest | Fast unit tests for the rules layer. |

**Alternative:** Python + Django. The Django *admin* gives ready screens for
registering clients, products, services, etc. almost for free. It is faster for
the first version, but the screens are less friendly on a phone.

**Rule for choosing:** pick the language that **you** can read and maintain. A
"better" stack that you cannot maintain is worse.

## 5. Folder structure (created in the repository)

```
/docs                 ← one document per step (this file is step 1)
/prisma               ← database schema and migrations (step 4)
/src
  /app                ← screens and routes (step 2)
  /modules
    /barbershops      ← tenants
    /auth
    /clients
    /employees
    /services
    /inventory
    /service-orders   ← comanda
    /finance
      (each module has)
        rules/        ← business rules, pure code, fully tested (step 3)
        data/         ← database access (step 4)
        api/          ← how screens talk to the server (step 5)
  /shared             ← money.ts (cents), tenant.ts (TenantContext)
/tests
```

## 6. Risks I found in the plan (devil's advocate)

| Risk | Why it is a problem | Proposed solution |
|------|--------------------|-------------------|
| Plan order puts **Interface before Rules and Data** | Screens designed before the rules can show things the rules do not allow (e.g. a "discount" field without a rule for who can give discounts). | In step 2, draw **low-fidelity wireframes only** (boxes and text). Final screens come after steps 3 and 4. |
| "**Communication**" (step 5) is not defined | It can mean *front-end ↔ server* (API) or *system ↔ client* (WhatsApp). These are very different jobs. | Decide now (question 4 below). |
| Five modules is **not minimal** | Scope creep: the MVP never ends and is never tested with a real barbershop. | Build in this order: Comanda + Services + Employees first, then Finance, then Stock and Clients. Test with a real barbershop as early as possible. |
| No **permissions** in the original list | A barber could see the whole shop's revenue, or delete a paid comanda. | Two roles from day one (owner, barber). A closed comanda can only be cancelled by the owner, with a reason. |
| **Money errors** | Using decimal numbers (floats) for money gives errors like 0.1 + 0.2 = 0.30000000000000004. | Store money as **integer cents** (R$ 35,90 → 3590). |
| **Internet problems** in the shop | A web system stops if the internet goes down. | Accept for the MVP, but keep a paper backup routine. Offline mode is version 2. |
| **Personal data (LGPD)** | Client name and phone are personal data under Brazilian law. | Store the minimum; allow deleting a client on request. |
| **No real user yet** | Building without talking to a barbershop owner = guessing. | Before step 2, talk to at least one owner and confirm the 4 questions of section 1. |

## 7. Decisions (answered by the owner)

| # | Question | Answer | Consequence in the structure |
|---|----------|--------|------------------------------|
| 1 | Who is it for? | **SaaS, many barbershops.** | Multi-tenant from day one: every table has `barbershop_id`; every data access receives a `TenantContext` (`src/shared/tenant.ts`). |
| 2 | Stack? | **TypeScript + Next.js.** | Project created with Next.js 16, TypeScript strict mode, ESLint, Vitest. Prisma is added in step 4. |
| 3 | Comanda as the center? | **Yes.** | `service-orders` module is the only module allowed to write to finance and stock together. |
| 4 | Meaning of "Communication"? | **(a) API between screens and server.** | Step 5 defines the `api/` folder of each module. WhatsApp stays out. |
| 5 | Commission model? | **Depends on the shop — out of the MVP.** | No commission rules. But each comanda item stores **which barber** did it and the **price at that moment**, so commission can be calculated later, even for old comandas. |

### Devil's advocate on the answers

| Answer | Weak point | Solution adopted |
|--------|-----------|------------------|
| SaaS | The worst possible bug is **one shop seeing another shop's data** (data leak). It also makes you a data processor under LGPD. | Tenant filter is mandatory in the data layer, and step 4 will add automatic tests that try to read another tenant's data. Later: PostgreSQL Row Level Security as a second lock. |
| SaaS, but the MVP is shown to **one** owner | Building sign-up, billing and plans now would be wasted work before feedback. | Tenants are created manually by you. No billing, no plans in the MVP. |
| Commission out | It is the #1 pain of many shops. The owner in the demo will probably ask for it. | Data is ready (barber + price per item). Adding the rule later is a step-3 change, not a database redesign. Show "revenue per barber" in the demo as a first answer. |
| Feedback from **one** owner | One owner is not the market. His habits can become "rules" that do not fit other shops — dangerous for a SaaS. | After the demo, talk to 3–5 other shops before building new features. Things that change from shop to shop become **settings**, not fixed code. |

## 8. My verification of this step

- [x] Every module in the original request is covered (finance, stock, clients, employees, services).
- [x] Each module has a clear responsibility and a clear dependency direction (no cycles).
- [x] MVP scope has an explicit "out" list.
- [x] Risks listed with a solution for each one.
- [x] Owner answered the 5 open decisions.
- [x] Project skeleton created: `npm test` (5 tests), `npm run typecheck`, `npm run lint` and `npm run build` all pass.
- [x] Owner approved this document.

## Glossary

- **Stack:** the set of technologies used to build the system.
- **Monolith:** one application that contains everything.
- **Migration:** a versioned change to the database structure.
- **Scope creep:** when the project keeps growing with new "small" features and never finishes.
- **SaaS (Software as a Service):** software sold as a monthly subscription to many customers.
- **Low-fidelity wireframe:** a simple sketch of a screen, only boxes and text, no colors.
