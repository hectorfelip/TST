# Step 2 — Interface (APPROVED)

> Status: **approved by the owner**, with **decision B** for client
> visibility (section 12.4). Pending: a test with a barbershop **owner**
> before step 4 (section 12.3).

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

**Confirmed:** the **barber on the phone** is the main user, so the comanda
flow is designed first and must be fast. If the barber does not use the
system, the owner's reports are empty.

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
| Painel (dashboard) | `/` | ✅ full | ⚠️ "Meu dia": own revenue and own open comandas | Money in today, low stock |
| Comandas (list) | `/comandas` | ✅ all | ⚠️ own only | — |
| Nova comanda (interactive) | `/comandas/nova` | ✅ | ✅ | — |
| Comanda (detail) | `/comandas/[id]` | ✅ | ⚠️ own only | — |
| Fechar comanda | `/comandas/[id]/fechar` | ✅ with discount | ⚠️ own only, no discount | Money in |
| Caixa (cash register) | `/caixa` | ✅ | ❌ | Money in and out |
| Fechar caixa (interactive) | `/caixa/fechar` | ✅ | ❌ | Does the money match? Which services were not paid? |
| Abrir caixa *(step 3)* | `/caixa/abrir` | ✅ | ✅ | — |
| Configurações *(step 3)* | `/configuracoes` | ✅ | ❌ | — |
| Agenda *(step 3)* | `/agenda`, `/agenda/nova` | ✅ all barbers | ⚠️ own clients | Who is coming today and tomorrow? |
| Clientes | `/clientes`, `/clientes/[id]` | ✅ | ⚠️ search, view, create (no edit, no delete) | Clients who stopped coming ("Sumido" badge) |
| Serviços | `/servicos` | ✅ | ❌ | — |
| Estoque | `/estoque` | ✅ | ❌ | Products running out |
| Equipe | `/equipe` | ✅ | ❌ | — |
| Relatórios | `/relatorios` | ✅ | ❌ | Revenue per barber (commission in v2) |

The prototype has **both views**. The button **"Ver como barbeiro" / "Ver como
dono"** at the top switches between them (the barber is "Rafael"). A barber
who opens a forbidden screen by typing the address sees **"Sem acesso"**.

⚠️ This switch is a demo tool, not security. In step 3 these limits become
**rules on the server** — hiding a menu item does not protect anything.

"Own comanda" = a comanda the barber **opened** or where he did **at least one
item**. His revenue counts **only his items**, not the whole comanda.

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
| **Split payment** (part cash, part Pix) is v2 | People will pick one method for a mixed payment, so the cash drawer count will be wrong on those days. | Accepted for the MVP. The close screen says it is v2; the cash-register closing shows the difference so the owner can see the problem. Ask the owner in the demo how often it happens. |
| **Barber shares the phone / forgets to log out** | Another person could close comandas in his name. | Long session on personal phones + "Sair" in the Mais menu. Real fix (PIN per barber on a shared tablet) is v2. |
| **Six taps may still be too many** | Barbers are busy; every tap counts. | Decision: keep **Confirmar pagamento** (safer against wrong taps). Measure the time in the demo; revisit if it is over 30 s. |
| **Testing with the buyer, not the user** | The owner buys, but the barber uses it every day. An owner can love screens that barbers hate. | In the demo, give the phone to **one barber** too, in barber mode (see demo guide). |
| **Fake numbers must be consistent** | If the demo shows numbers that do not add up, the owner stops trusting the product. | Found and fixed in my review: the "cash in the drawer" was adding Pix payments. Now only cash counts (R$ 128,50), and caixa, comandas and dashboard use the same data. |
| Prototype built in real code | Fake data could leak into the real app. | All fake data lives only in `src/prototype/`. Step 5 replaces it and deletes the folder. |
| **Stock alert mixes products for sale and for internal use** | The owner may want to see them separately. | Kept together on the Painel (both need buying); separated on the Estoque screen. |

## 9. My verification of this step

- [x] Every module from step 1 has at least one screen (comandas, finance/caixa, stock, clients, employees, services, reports).
- [x] Every screen has a defined access level (owner / barber) in section 4.
- [x] The main flow (walk-in + haircut + Pix) was clicked through: 6 taps.
- [x] Every screen opened on a 390 px phone viewport **without horizontal scroll** and returned HTTP 200 (automated check with Playwright), in owner mode and in barber mode.
- [x] Barber mode (automated check, 16 cases): sees only his comandas; gets "Sem acesso" on caixa, estoque, relatórios, serviços, equipe and on another barber's comanda; has no discount field; cannot delete a client.
- [x] Cash in the drawer counts only cash payments (bug found and fixed in this review).
- [x] Unknown comanda (`/comandas/9999`) returns 404, not a crash.
- [x] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [x] Owner answered the questions in section 10.
- [x] Prototype shown to one barber; feedback written in section 11.
- [ ] Prototype shown to the **owner** of a barbershop (see section 12.3).
- [x] Screens adjusted after the feedback (section 12.2), checked with 27 new automated browser cases.
- [x] Owner approved this document (decision B chosen for section 12.4).

Screenshots (phone): [Painel](img/02-mobile-painel.png) ·
[Comanda](img/02-mobile-comanda.png) · [Fechar](img/02-mobile-fechar.png) ·
barber: [Meu dia](img/02-mobile-barbeiro.png) · computer: [Painel](img/02-desktop-painel.png)

## 10. Decisions (answered by the owner)

| # | Question | Answer | Consequence |
|---|----------|--------|-------------|
| 1 | Main user? | **Barber on the phone.** | Comanda flow first; barber view ("Meu dia") added to the prototype. |
| 2 | Split payment? | **Version 2.** | One payment method per comanda in the MVP. |
| 3 | Faster close? | **Keep "Confirmar pagamento".** | 6 taps for the main flow. |
| 4 | Who gives discounts? | **Only the owner.** | Discount field only in owner mode; the server will refuse it from a barber (step 3). |
| 5 | Show the prototype before step 3? | **Yes.** | Step 3 waits for the feedback. Guide: [02-demo-guide.md](02-demo-guide.md). |

### Rules already discovered (input for step 3)

- A barber sees and closes only **his own** comandas.
- Barber revenue = sum of **his items**, not the whole comanda.
- Only the owner gives **discounts**, edits or deletes **clients**, and cancels a **paid** comanda.
- An **empty** comanda can be discarded without a reason.
- **Cash in the drawer** = opening cash + cash payments − cash expenses − withdrawals. Pix and cards never count.
- One payment method per comanda (split payment is v2).
- *(from feedback)* Every discount records **who** gave it and **how much**; discount can never be bigger than the total.
- *(from feedback)* Closing the cash register with a difference **requires a reason**; the difference is recorded, never silently adjusted.
- *(from feedback)* Closing the cash register **warns about open comandas**.
- *(from feedback)* The owner can **correct the payment method** of a closed comanda (e.g. Pix recorded as cash), and the change is logged.
- *(from feedback)* A comanda can have a free-text **note** (used for split payments until v2).
- *(from feedback)* Each barber has an **individual login** (no shared account).

## 11. Feedback from the barbershop (barber test)

Date: 02/10/2026
Barbershop (no personal data needed): Barber pro
People who tested: owner [ ]  barber [x]

Task results
| # | Done? | Time | Where he hesitated / what he said |
|---|-------|------|-----------------------------------|
| 1 |   false    |   50c   | Ao escolher “Cliente avulso”, fui levado à comanda #1027 de Pedro Alves, já com R$ 115,00 em itens. Não confirmei o pagamento para não atribuí-lo ao cliente errado. Assim, o fluxo não cumpriu a meta de até 6 toques e 30 segundos.|
| 2 |   true    |   10 sec   |R$ 216,90, visível diretamente no painel do dono.|
| 3 |    true   |   20 sec   |R$ 128,50, encontrado em Caixa. A conta exibida confere: R$ 100,00 + R$ 47,00 − R$ 18,50.|
| 4 |    true   |   20 sec   |Pomada modeladora e lâmina descartável, sinalizadas no painel e abaixo do mínimo no estoque.                                   |
| 5 |   true    |   10 sec   |O selo “Sumido” aparece para Marcos Lima e Lucas Rocha.|
| 6 |   true    |   15 sec   |Carlos, com R$ 7.120,00 em setembro.|
| 7 |   true    |   25 sec   |A lista mostra apenas as comandas dele; uma comanda de Diego e os relatórios exibem “Sem acesso”.|

Answers to the questions (his exact words when possible):
1“Como foi o fechamento do caixa ontem?” Não acompanhei o fechamento de ontem. Pelo fluxo apresentado, eu conferiria as comandas pagas, contaria o dinheiro físico, compararia com o valor Esperado, lançaria qualquer diferença e só então fecharia o caixa. A tela informa que mostrará a diferença após a contagem; esse fechamento completo ainda precisaria ser testado.

2“E se não bater?” Conto de novo, confiro troco inicial, pagamentos em dinheiro, despesas e sangrias. Também verifico se algum Pix foi marcado como dinheiro. Se a diferença continuar, registro valor e motivo e aviso o dono. Não ajustaria o número só para zerar a diferença.

3“Quanto cada barbeiro tem a receber hoje?” Hoje eu não consigo saber pela tela. O relatório mostra quanto cada um faturou no mês, mas faturamento não é comissão a pagar. Faltam regras de comissão, descontos aplicáveis, período de apuração e um demonstrativo por barbeiro.

4“Pagamento metade Pix, metade dinheiro acontece?” Acontece, mas eu não colocaria uma frequência sem medir as comandas reais. Deixar para a versão 2 é aceitável se houver um procedimento claro para registrar esses casos no piloto; caso sejam frequentes, essa limitação vai atrapalhar o caixa já no primeiro dia.

5“Como funciona a comissão?” Não dá para presumir que seja igual para todos ou para todos os serviços. Eu trataria como urgente antes de usar o sistema para calcular repasses. Pode ficar fora do primeiro lançamento se o dono continuar calculando e conferindo as comissões separadamente.

6“Usariam o próprio celular?” Sim. Abrir a comanda ao lado da cadeira economiza ida ao balcão. Eu testaria a tela em celular, com uma mão, conexão instável e durante atendimento. Cada barbeiro precisa de acesso individual; no protótipo, a troca entre dono e Rafael é apenas um botão de demonstração.

7“Quem dá desconto?” Só o dono. Testei isso: no perfil Rafael, o fechamento informa a restrição; ao trocar para dono, aparece o campo de desconto. Eu manteria essa regra e registraria quem autorizou e quanto concedeu.

8“Se pudesse ter uma tela?” Comandas. É onde eu passaria o dia: abrir atendimento, lançar corte ou produto, conferir total e receber. O painel é útil, mas a comanda resolve o trabalho na cadeira.

9“O que procurou e não achou?” Uma nova comanda avulsa de verdade: ao selecionar “Cliente avulso”, fui parar na comanda existente de Pedro Alves. Também procurei pagamento dividido e um valor de comissão a receber.

10“O que nunca usaria?” Como barbeiro, eu quase nunca abriria relatórios financeiros gerais, estoque ou fechamento do caixa; deixaria essas rotinas com o dono ou responsável. Não eliminaria essas telas do produto, pois são úteis para outro perfil.

11 Sem resposta

Top 3 problems found:
1.“Cliente avulso” não cria uma comanda nova e vazia, vinculada a Rafael, antes de permitir lançar o corte e escolher Pix.
2.Rafael consegue ver todos os clientes, telefones e o histórico de Marcos com Carlos. Se a carteira de clientes deve ser compartilhada, a interface pode deixar isso claro.
3.

Things he asked for that are NOT in the MVP:
- null

Did anything change our decisions (split payment, commission, discount)?
- false

## 12. Analysis of the feedback (devil's advocate)

### 12.1 What the feedback proves — and what it does not

| It proves | It does **not** prove |
|-----------|----------------------|
| Tasks 2–7 are easy: all done in 10–25 s. | That an **owner** wants this: no owner tested (`owner [ ]`). Owners decide discount rules, commission and **pay** for the product. |
| The barber's main screen is **Comandas** (answer 8). Our focus is right. | **Willingness to pay**: question 11 has no answer. This is the most important business signal and it is missing. |
| The owner/barber permissions make sense to a barber (task 7, answer 7). | The **real current process**: answers 1–3 describe what he *would* do in the prototype ("Pelo fluxo apresentado, eu conferiria…"), not what happened yesterday. |
| The main flow had a **real bug** (task 1 failed). | That the flow is fast enough with real hands, a real client and bad Wi-Fi. The 6 taps were not measured with a person after the fix. |

Sample size: **1 person, 1 barbershop**. Good for finding usability bugs; not
enough to decide the product.

### 12.2 Changes made because of the feedback

| # | Feedback | Change | Checked |
|---|---------|--------|---------|
| 1 | Task 1 failed: "Cliente avulso" opened the existing comanda #1027 of Pedro Alves (**prototype bug**). | `/comandas/nova` is now **interactive**: it creates a new, empty comanda (#1028) for the logged-in barber; services and products can be added and removed; payment is chosen; the comanda closes. Nothing is saved (prototype). | Automated: walk-in + Corte + Pix closes as **#1028, R$ 45,00, in exactly 6 taps**. |
| 2 | "Faturamento não é comissão a pagar" (answer 3). | "Faturado" renamed to **"Valor atendido"**; barber sees **"Valor dos meus atendimentos"** with a note: *this is not your commission*. Reports tell the owner to calculate commission outside the system until v2. | Visual + automated. |
| 3 | Split payment happens; needs "um procedimento claro no piloto" (answer 4). | Close screen has an **Observação** field and a written procedure: choose the method with the biggest value, write the split in the note, the owner corrects it at cash closing. | Visual. |
| 4 | Cash closing "ainda precisaria ser testado" (answer 1). | New interactive **Fechar caixa** screen: counted value → shows *Bateu / Sobra / Falta*; a difference **requires a reason**; warns about open comandas. | Automated: R$ 128,50 → "Bateu"; R$ 120,00 → "Falta R$ 8,50" + reason required. |
| 5 | Discount: "registraria quem autorizou e quanto" (answer 7). | Owner-only discount field in the new flow, cannot exceed the total; screen says the system records who gave it. | Automated: R$ 50 discount on R$ 45 blocked; R$ 5 → total R$ 40,00. |
| 6 | Change for cash payments. | Typing the cash received shows the **change (troco)**, or blocks confirmation if the money is not enough. | Automated: R$ 50 on R$ 35 → troco R$ 15,00. |

### 12.3 What is still missing (and the solution)

| Gap | Risk | Solution |
|-----|------|----------|
| **No owner test** | We build for the user but the buyer may say no (price, commission, rules). | Run the demo guide with **one owner** (tasks 2–6 + questions 3, 5, 7, 11). Can happen in parallel with step 3, but **before step 4 (Data)** — commission and discount rules change the database. |
| **Question 11 (money) unanswered** | We do not know if anyone pays for this. | Ask the owner. Without at least one "I pay R$ X today for Y", the SaaS is a hypothesis. |
| **Answers are hypothetical** | People predict their behaviour badly. | In the owner test, ask about **yesterday's** cash closing, not about the prototype. |
| **Commission is "urgent before payouts"** (answer 5) | If the pilot shop expects commission, it will not use the MVP. | Keep it out of the MVP (your decision), but **ask the owner** if he accepts calculating commission outside the system during the pilot. If not, commission moves into the MVP. |
| **Unstable connection, one hand, during service** (answer 6) | The comanda fails while the client is waiting. | Step 5 must define what happens when the internet drops (e.g. clear error + retry, never a lost comanda). Real offline mode stays v2. |

### 12.4 Decision needed: what can a barber see about clients?

The barber noticed that **Rafael can see every client, every phone number and
the history of a client with another barber (Marcos with Carlos)**.

This is a real privacy question (LGPD: collect and show only what is needed).

| Option | Barber sees | Good | Bad |
|--------|------------|------|-----|
| A. Shared base, full access (today) | All clients, phones, full history | Any barber can serve any client; simple | Barber can copy the whole client list when he leaves the shop (common fear of owners) |
| **B. Shared base, limited (recommended)** | Search by name, notes, **only his own history**; **no phone numbers**, no list export | Serves any client; protects the shop's client list | Barber cannot call a client himself |
| C. Each barber's own clients | Only clients he has served | Maximum privacy | A new barber sees nobody; client "belongs" to a barber — owners usually dislike this |

**Decision: B** (chosen by the owner; implemented as rule R-CLI-05 in step 3).

**My recommendation was B.** The client list is one of the shop's most valuable
assets; owners worry about barbers taking it to a competitor. Confirm with the
owner during his test.

### 12.5 Changes made in step 3 (screens)

Decided in [03-rules.md](03-rules.md), section 8:

- **Agenda** (new): "Clientes marcados hoje / amanhã" on the barber's "Meu dia", an **Agenda** tab and a booking form.
- **Comanda**: "Cliente não compareceu" (with confirmation, only after the appointment time) replaces "Cancelar" for barbers; the owner keeps "Cancelar" (reason + confirmation). Pending comandas show "vence em N dias".
- **Fechar caixa**: lists every unpaid service with its value; each comanda needs a decision with a confirmation; final summary before closing.
- **Abrir caixa** (new): the barber or the owner; the amount is compared with what was left yesterday.
- **Nova comanda**: when stock in the system is too low, it asks "do you have it in hand?".
- **Configurações** (new, owner only): option to cancel pending comandas automatically, with a custom deadline of 1 to 30 days.
- Bottom menu: **Agenda** added (owner: 5 tabs; barber: Meu dia, Agenda, Comandas, Mais).

## Glossary

- **Low-fidelity prototype:** a simple, clickable version of the screens, without final design and without real data.
- **Mobile first:** design for the small screen first, then adapt to big screens.
- **Touch target:** the area of the screen that reacts to a finger tap.
- **Sangria (cash withdrawal):** taking money out of the cash drawer during the day, for safety or to pay something.
- **Walk-in client (cliente avulso):** a client served without a registration.
