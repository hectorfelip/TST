# Step 2 — Interface (DRAFT, waiting for approval)

> Status: **draft**. A clickable low-fidelity prototype is ready.
> Next step (3 — Rules) only starts after approval.

## 1. Goal of this step

Decide **which screens exist, what is on each one and how people move
between them** — before writing rules or database code.

This is a **low-fidelity** prototype:

- Real screens in the real app (Next.js), so it can be opened on a phone.
- **Fake data** (`src/prototype/mock-data.ts`). Nothing is saved.
- Buttons only navigate. Adding an item or confirming a payment does not
  change anything yet (that is step 3 + 4 + 5).
- No visual identity yet (logo, colors, fonts). Gray and simple **on purpose**:
  in a demo, people comment on colors instead of the workflow when the design
  looks "finished".

How to open it:

```bash
npm run dev    # then open http://localhost:3000 on the computer or phone
```

## 2. Who uses the system, and where

| Person | Device | Main job in the system | Frequency |
|--------|--------|------------------------|-----------|
| **Barber** | Own phone, between clients, often with dirty hands | Open and close comandas | Many times per day |
| **Owner** | Phone during the day, computer at night | Cash register, stock, reports, team | A few times per day |
| **Platform admin** (you) | Computer | Create a new barbershop + its owner account | Rarely |

**Assumption (needs your confirmation):** the **barber on the phone** is the
most frequent user, so the comanda flow is designed first and must be fast.
If the barber does not use the system, the owner's reports are empty.

The platform admin has **no screen** in the MVP: a new barbershop is created
by a script. A screen for this is not worth building for a handful of shops.

## 3. Screen map

```
Login
  │
  ▼
Painel ───────────────┬────────────┬──────────────┐
  │                   │            │              │
Comandas            Caixa        Mais         (desktop: all items
  ├─ Nova comanda                  ├─ Clientes ── Cliente (detail)
  └─ Comanda (detail)              ├─ Serviços
       └─ Fechar (payment)         ├─ Estoque
                                   ├─ Equipe
                                   └─ Relatórios
```

Navigation: **bottom tab bar** on the phone (Painel, Comandas, Caixa, Mais),
**side menu** on the computer (all items).

## 4. Screen inventory and who can see what

| Screen | Route | Owner | Barber | Answers which question from step 1? |
|--------|-------|:-----:|:------:|-------------------------------------|
| Login | `/login` | ✅ | ✅ | — |
| Painel (dashboard) | `/` | ✅ full | ⚠️ own numbers only | Money in today, low stock |
| Comandas (list) | `/comandas` | ✅ all | ⚠️ own only | — |
| Nova comanda | `/comandas/nova` | ✅ | ✅ | — |
| Comanda (detail) | `/comandas/[id]` | ✅ | ⚠️ own only | — |
| Fechar comanda | `/comandas/[id]/fechar` | ✅ | ✅ (no discount) | Money in |
| Caixa (cash register) | `/caixa` | ✅ | ❌ | Money in and out |
| Clientes | `/clientes`, `/clientes/[id]` | ✅ | ⚠️ search + create only | Clients who stopped coming ("Sumido" badge) |
| Serviços | `/servicos` | ✅ | ❌ | — |
| Estoque | `/estoque` | ✅ | ❌ | Products running out |
| Equipe | `/equipe` | ✅ | ❌ | — |
| Relatórios | `/relatorios` | ✅ | ❌ | Revenue per barber (commission in v2) |

⚠️ The prototype shows the **owner view** only. The barber limits in this table
become **rules in step 3** — hiding a menu item is not security; the server
must refuse the request too.

## 5. The main flow: closing a simple comanda

A walk-in client wants a haircut and pays with Pix:

| Tap | Screen | Action |
|-----|--------|--------|
| 1 | Painel | **+ Nova comanda** |
| 2 | Nova comanda | **Cliente avulso** (no registration) |
| 3 | Comanda | **Corte** (favorite service button) |
| 4 | Comanda | **Fechar comanda** |
| 5 | Fechar | **Pix** |
| 6 | Fechar | **Confirmar pagamento** |

**Target: 6 taps and under 30 seconds.** If the demo shows more than that, the
barber will not use it.

## 6. Interface rules (apply to every screen)

1. **Mobile first.** Designed for a 390 px wide phone, then expanded for the computer.
2. **Big touch targets:** every button and list row is at least 48 px tall.
3. **Client is optional** on a comanda ("cliente avulso"). Forcing a
   registration for every haircut kills adoption.
4. **Favorite services as big buttons** — no typing for the common case.
5. **Only destructive actions ask for confirmation** (cancel comanda, delete
   client, close cash register). Everything else happens with one tap.
6. **Every empty list says what to do next** (e.g. "Nenhum item ainda. Toque em
   um serviço abaixo").
7. **Money is always shown as R$ with 2 decimals** (`formatBRL`), never typed as
   a float.
8. **Portuguese (pt-BR) interface.** Code, documents and commit messages stay
   in English.
9. **Dark mode follows the phone setting** (barbershops are often dim).
10. **No horizontal scroll** on the phone — checked automatically (section 9).

## 7. UI technology decision

- **CSS Modules + CSS variables** (already in Next.js, no new dependency).
- A few shared components in `src/components/`: `AppShell`, `NavLinks`,
  `PageHeader`, `Card`, `Stat`, `ButtonLink`, `Badge`, `Money`, `Note`.
- No component library (like MUI or shadcn) for now. **Reason:** fewer
  dependencies, and the screens are simple. We can add one when the visual
  identity is defined.

## 8. Devil's advocate: risks in this interface

| Risk | Why it matters | Solution |
|------|---------------|----------|
| Owner judges the **looks**, not the flow | Low-fi screens can look "unfinished" and hurt the first impression. | Say it before the demo: "this is the skeleton; I want your opinion on the steps, not the colors". The "Protótipo · dados fictícios" tag is on every screen. |
| **Empty comandas pile up** (see #1025 with 0 items in the prototype) | The list fills with garbage; open-comanda numbers become wrong. | Rule for step 3: an empty comanda can be discarded without a reason, and closing the cash register warns about open comandas. |
| **Split payment** (part cash, part Pix) is not in the screen | It is common in barbershops. Without it, people will record the wrong method. | Question for you (section 10). |
| **Barber shares the phone / forgets to log out** | Another person could close comandas in his name. | Long session on personal phones + "Sair" in the Mais menu. Real fix (PIN per barber on a shared tablet) is v2. |
| **Six taps may still be too many** | Barbers are busy; every tap counts. | Option: tapping the payment method closes the comanda directly (5 taps), with a 5-second "Desfazer" (undo). Question for you. |
| Prototype built in real code | Fake data could leak into the real app. | All fake data lives only in `src/prototype/`. Step 5 replaces it and deletes the folder. |
| **Stock alert mixes products for sale and for internal use** | The owner may want to see them separately. | Kept together on the Painel (both need buying); separated on the Estoque screen. |

## 9. My verification of this step

- [x] Every module from step 1 has at least one screen (comandas, finance/caixa, stock, clients, employees, services, reports).
- [x] Every screen has a defined access level (owner / barber) in section 4.
- [x] The main flow (walk-in + haircut + Pix) was clicked through: 6 taps.
- [x] Every screen opened on a 390 px phone viewport **without horizontal scroll** and returned HTTP 200 (automated check with Playwright).
- [x] Unknown comanda (`/comandas/9999`) returns 404, not a crash.
- [x] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] Owner answered the questions in section 10.
- [ ] Owner approved this document.
- [ ] (Recommended) Prototype shown to the barbershop owner and feedback written in section 11.

Screenshots (phone): [Painel](img/02-mobile-painel.png) ·
[Comanda](img/02-mobile-comanda.png) · [Fechar](img/02-mobile-fechar.png) ·
computer: [Painel](img/02-desktop-painel.png)

## 10. Open questions

1. **Who uses it most?** Do you confirm the barber on the phone is the main user?
2. **Split payment:** in the MVP or v2?
3. **Faster close:** keep the "Confirmar pagamento" button (6 taps, safer) or
   close on the payment-method tap with an undo (5 taps, faster)?
4. **Discount:** only the owner can give it, or the barber too (with a limit)?
5. **Will you show this prototype to the barbershop owner before step 3?**
   (Recommended — it is cheap to change screens now and expensive later.)

## 11. Feedback from the barbershop owner

_Empty — fill after the demo._

## Glossary

- **Low-fidelity prototype:** a simple, clickable version of the screens, without final design and without real data.
- **Mobile first:** design for the small screen first, then adapt to big screens.
- **Touch target:** the area of the screen that reacts to a finger tap.
- **Sangria (cash withdrawal):** taking money out of the cash drawer during the day, for safety or to pay something.
- **Walk-in client (cliente avulso):** a client served without a registration.
