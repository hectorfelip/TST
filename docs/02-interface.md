# Step 2 — Interface (v2, waiting for the barbershop owner's feedback)

> Status: **decisions answered. Next: show the prototype to the barbershop
> owner** (see [demo guide](02-demo-guide.md)), write the feedback in
> section 11, adjust the screens, then approve.
> Next step (3 — Rules) only starts after that.

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
| Nova comanda | `/comandas/nova` | ✅ | ✅ | — |
| Comanda (detail) | `/comandas/[id]` | ✅ | ⚠️ own only | — |
| Fechar comanda | `/comandas/[id]/fechar` | ✅ with discount | ⚠️ own only, no discount | Money in |
| Caixa (cash register) | `/caixa` | ✅ | ❌ | Money in and out |
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
- [ ] Prototype shown to the barbershop owner (and one barber); feedback written in section 11.
- [ ] Screens adjusted after the feedback.
- [ ] Owner approved this document.

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

## 11. Feedback from the barbershop owner

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

## Glossary

- **Low-fidelity prototype:** a simple, clickable version of the screens, without final design and without real data.
- **Mobile first:** design for the small screen first, then adapt to big screens.
- **Touch target:** the area of the screen that reacts to a finger tap.
- **Sangria (cash withdrawal):** taking money out of the cash drawer during the day, for safety or to pay something.
- **Walk-in client (cliente avulso):** a client served without a registration.
