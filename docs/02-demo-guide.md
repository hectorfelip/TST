# Demo guide — showing the prototype to a barbershop

> **Historical (step 2).** Since step 5 the screens are real: there is a login, and no "Ver como barbeiro" switch. To show the
> current app, use the demo data (`npm run db:seed`) and log in as `carlos@exemplo.com` (owner) or `rafael@exemplo.com` (barber).

Goal: find out **what is wrong or missing** before we write rules and the
database. A demo where the owner only says "legal, gostei" is a failed demo:
it teaches us nothing.

Time needed: **30–40 minutes**, ideally at the barbershop, at a calm hour.

---

## 1. Before the demo

### Put the prototype on a phone

**Option A — same Wi-Fi (free, 5 minutes).**

1. On your computer: `npm install` (first time only), then `npm run dev`.
2. Find your computer's IP address on the network:
   - Windows: `ipconfig` → "Endereço IPv4" (e.g. `192.168.0.15`)
   - Mac: `ipconfig getifaddr en0`
3. On the phone (same Wi-Fi): open `http://192.168.0.15:3000`.

Risk: the barbershop Wi-Fi may block this, or your computer must stay on.
Test it at home first.

**Option B — a public link (free, ~15 minutes, works anywhere).**
Create a free account on [Vercel](https://vercel.com) and import the GitHub
repository. Vercel builds every branch: open the project's **Deployments**
page and use the link of the latest deployment of the branch
`claude/barbershop-system-mvp-iw8i0j` (a "Preview" link like
`https://something.vercel.app`).
It is safe to publish: there is no login and all data is fake.

### Prepare yourself

- [ ] Open every screen once on the phone you will use.
- [ ] Start in **owner mode** ("Ver como dono" at the top).
- [ ] Bring this guide (printed or on another screen) and a way to take notes.
- [ ] Have a stopwatch ready (phone clock) to time task 1.

---

## 2. What to say at the start (≈2 min)

> "Isso é um rascunho, não é o sistema pronto. Os dados são inventados e os
> botões ainda não salvam nada. Não estou aqui pra vender — quero que você me
> diga o que está errado, o que falta e o que é inútil. Crítica me ajuda mais
> que elogio."

Ask him to **think out loud** while he uses it:

> "Enquanto mexe, vai falando o que está pensando, mesmo que pareça bobo."

---

## 3. Tasks (≈20 min)

Rules for you while he does the tasks:

- **Give him the phone.** Do not touch it.
- **Do not help** and do not explain the screen. If he gets stuck, wait 10
  seconds, then ask: *"O que você esperava que acontecesse?"*
- **Write down every hesitation**, wrong tap and comment, word for word.

| # | Task (say it like this) | Mode | What we are testing | Success |
|---|------------------------|------|---------------------|---------|
| 1 | "Chegou um cliente sem cadastro, fez um corte e pagou no Pix. Registra isso." | Barber | The main flow | Done in ≤ 6 taps and ≤ 30 s |
| 2 | "Quanto a barbearia faturou hoje até agora?" | Owner | Dashboard | Finds it in ≤ 10 s |
| 3 | "Quanto dinheiro deveria ter na gaveta agora?" | Owner | Caixa | Finds R$ 128,50 |
| 4 | "Algum produto está acabando?" | Owner | Stock alert | Finds Pomada / Lâmina |
| 5 | "Quais clientes estão sumidos?" | Owner | Clients | Finds the "Sumido" badge |
| 6 | "Quem faturou mais este mês?" | Owner | Reports | Finds Carlos |
| 7 | "Agora finge que você é o Rafael. O que você consegue ver?" | Barber | Permissions | Understands he sees only his own things |
| 8 | "Você tinha um cliente marcado às 10h e ele não apareceu. Registra isso." *(open the Agenda or the comanda #1030)* | Barber | No-show instead of cancel | Finds "Cliente não compareceu" without looking for "Cancelar" |
| 9 | "Quem você atende amanhã?" | Barber | Agenda | Answers in ≤ 10 s |
| 10 | "É fim de expediente. Fecha o caixa." | Owner | Closing with unpaid services | Understands every alert, decides each comanda, finishes in ≤ 3 min |

For task 1, switch to barber mode **before** giving him the phone.

### If there is a barber available (strongly recommended)

Do **task 1 again with a barber**, in barber mode. The barber is the person
who will use the system every day. If the barber finds it slow or confusing,
the system will not be used, even if the owner likes it.

---

## 4. Questions after the tasks (≈10 min)

Ask **open questions** (they cannot be answered with "sim" or "não") and
about the **past**, not about the future. "Would you use it?" gets polite
lies. "How did you do it last week?" gets facts.

**Current process**
1. "Me conta como foi o fechamento do caixa ontem. Passo a passo."
2. "Quando a conta do caixa não bate, o que você faz?"
3. "Como você sabe hoje quanto cada barbeiro tem a receber?"

**Our decisions to validate**
4. "Com que frequência um cliente paga metade no Pix e metade em dinheiro?" *(split payment is v2 — is that OK?)*
5. "Como funciona a comissão aqui? É igual pra todos os barbeiros e serviços?" *(commission is v2 — how urgent?)*
6. "Os barbeiros usariam o próprio celular pra abrir comanda? Tem algum problema nisso?"
7. "Quem dá desconto hoje? O barbeiro pode dar sozinho?" *(we decided: only the owner)*
7a. "Como vocês marcam os horários hoje? Caderno, WhatsApp, cabeça?" *(is the light agenda enough?)*
7b. "O que acontece hoje quando o cliente marcado não aparece? Já aconteceu de um barbeiro dizer que o cliente faltou e depois ter dúvida?" *(no-show)*
7c. "Quem abre o caixa de manhã? E o que fica na gaveta de um dia pro outro?" *(barber opens; opening cash compared with yesterday)*
7d. "Já vendeu produto que o sistema dizia que não tinha, mas estava na prateleira?" *(stock confirmation)*
7e. "Um serviço que foi feito e o cliente não pagou: o que acontece hoje? Quanto tempo você espera antes de desistir?" *(pending comandas: option and deadline)*

**Priority**
8. "Se você só pudesse ter UMA tela dessas, qual seria?"
9. "O que você procurou e não achou?"
10. "O que aqui você nunca usaria?"

**Money (the most important signal)**
11. "Quanto você paga hoje por sistema, planilha ou caderno? Já pagou algum sistema e parou? Por quê?"

Do **not** ask "quanto você pagaria?" — people always give a number that they
do not actually pay later.

---

## 5. Warning signs to watch for

| What you see or hear | What it probably means |
|---------------------|------------------------|
| "Legal", "bonito", "interessante" and nothing else | He is being polite. Ask task-based questions again. |
| "Seria bom se tivesse X" | A wish, not a need. Ask: "Quando foi a última vez que você precisou de X?" |
| He takes more than 30 s on task 1 | The main flow is too slow. This is the most important problem to fix. |
| He asks about agenda / WhatsApp many times | Maybe our MVP scope is wrong. Write down his exact words. |
| He says the barbers "não vão usar" | The biggest risk of the whole project. Ask why, in detail. |

---

## 6. Feedback form (copy into section 11 of `02-interface.md`)

```
Date:
Barbershop (no personal data needed):
People who tested: owner [ ]  barber [ ]

Task results
| # | Done? | Time | Where he hesitated / what he said |
|---|-------|------|-----------------------------------|
| 1 |       |      |                                   |
| 2 |       |      |                                   |
| 3 |       |      |                                   |
| 4 |       |      |                                   |
| 5 |       |      |                                   |
| 6 |       |      |                                   |
| 7 |       |      |                                   |

Answers to the questions (his exact words when possible):
1.
...
11.

Top 3 problems found:
1.
2.
3.

Things he asked for that are NOT in the MVP:
-

Did anything change our decisions (split payment, commission, discount)?
-
```

After the demo, bring the filled form here. We adjust the screens, then close
step 2 and start step 3 (Rules).
