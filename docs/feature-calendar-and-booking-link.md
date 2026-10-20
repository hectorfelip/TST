# Feature — Calendar in the Agenda + public booking link

> Status: **built, tested, and tried online by the owner ("deu bom").** Asked after step 5. Your decisions are in section 2.
> It is a feature on top of the 5 approved steps: it follows the same architecture (rules → data → api → screens).

## 1. What it does, in simple words

**1. Calendar (Agenda tab).** A month grid. Each day shows how many clients are booked (and not yet served). Tap a day: the list of that day appears below, and "+ Agendar neste dia" opens the schedule form already on that date. The old list "Hoje e amanhã" is still one tap away. "Agendar" now also accepts **another day** (up to 90 days ahead), not only today and tomorrow.

**2. Booking link.** Each barbershop has ONE link: `/agendar/<address>` (example: `/agendar/barbearia-do-carlos`). The client opens it on the phone, with no login, and chooses: **service → barber (or "any barber") → day → time → name and phone**. Only times that are really free are shown.

## 2. Your decisions (and what each one caused)

| Decision | Result |
|---|---|
| Confirms by itself, but each barbershop can switch on **"I approve each request"** | Settings → "Eu aprovo cada pedido". With approval on, the request **holds the time** until the owner (or that barber) confirms or declines. Declining needs a reason and frees the time. |
| Hours come from the **barbershop's opening hours** in Settings | Days of the week, open/close time, interval (10/15/20/30/45/60 min) and minimum notice. The **service duration** blocks the barber's agenda (a 50-min service blocks 50 min). |
| Client picks a barber or **"any barber"** | "Any" = the free barber with the **fewest bookings that day** (fair), then by name. The owner decides who is offered at all (Team → "Aceitar agendamento online"). The owner is **not** offered by default. |
| **One link per barbershop**, owner turns it ON/OFF | OFF (default) = the address does not exist (404). The owner chooses the address; it must be unique in the system. |

## 3. How it is built

- **Migration `007`** (additive: nothing existing changes): table `booking_settings`; columns on `employees` (`takes_online_bookings`) and `comandas` (`source`, `online_status`, `appointment_minutes`, `online_ip_hash`); the function `booking_shop_by_slug` (finds ONLY barbershops whose link is ON and returns just what the page needs); database checks that refuse nonsense by themselves.
- **An online booking is a normal comanda** (an open appointment, `source = 'online'`). So the agenda, the no-show, the payment and the closing of the register need **no change**.
- **Rules** (`src/modules/booking/rules`, pure and tested without a database): settings, free times (`slots.ts`), the booking plan with all limits (`booking.ts`), approve/decline.
- **Data** (`.../data`): the booking runs **with the barbershop row locked**, so two people booking the same time at the same instant wait for each other (tested with a deliberately slow write).
- **The public action acts as the barber who gets the appointment**, so the very same comanda rules apply. The browser sends only ids, date, time, name, phone. Price, duration, barber and limits are decided by the server.

## 4. Safety of a page that anybody can open

| Risk | Defence |
|---|---|
| Robots flooding the agenda | Hidden "honeypot" field (robots fill it; people never see it) · max **3 open bookings per phone** · max **5 per address per hour** · max **40 per barbershop per hour**. |
| Storing visitors' addresses (privacy / LGPD) | Only an **HMAC** (one-way fingerprint made with our secret) of the address is saved; the address itself is never stored or logged. |
| Someone discovering other clients by typing a phone number | If the phone already belongs to a client, that client is **reused silently**: nothing is shown and nothing is overwritten. The page never shows any client data. |
| Reading another barbershop | Same Row Level Security as the rest. The only cross-barbershop function is `booking_shop_by_slug`. |
| Guessing addresses | Only ON links answer; OFF and unknown look the same (404). The page asks search engines **not to index it**. |
| Double tap / retry | Same idempotency key as every action: one tap, one booking. |

## 5. What was tested

- **Unit** (no database): free-times maths, opening hours, durations, "any barber", limits, approval rules, calendar dates (month grid, month change, time zones).
- **Database** (`src/modules/booking/data/booking.db.test.ts`, 17 tests): settings and isolation between barbershops, unique address, booking creation, "any barber", an existing client reused, refusals, service duration blocking, **the race**, limits per phone/address, approval and decline, database constraints.
- **Browser** (`e2e/booking.mjs`, 23 checks): the owner turns the link on; a visitor with no login books; the page leaks no client data; the owner sees it in the calendar; the third visitor is not offered a taken time; the robot trap; approval mode (approve, decline with reason); the team switch removes a barber from the public page; the private agenda still needs login; link OFF = 404. The old browser tests still pass.

## 6. Known limits (on purpose, to decide later)

1. **No WhatsApp/SMS to the client.** The client sees a confirmation on screen only; the owner sees pending requests in the Agenda tab (nobody is notified yet). *Risk:* an owner who does not open the app leaves the client waiting. Mitigation today: leave approval OFF.
2. **The client cannot cancel or change** by himself. He calls the barbershop. (A cancel link needs a secret per booking; easy to add later.)
3. **The calendar shows only open appointments.** After the service is paid, it leaves the calendar (same as the old list).
4. **No holidays or days off per barber.** A barber who is off must be switched off in Team, or the owner declines (approval mode). Per-barber schedule is the natural next step.
5. **The address limit uses the visitor's address.** Many people behind one mobile network address share the limit. 5 per hour is deliberately generous for one barbershop.
6. **Free plans:** Vercel Hobby is non-commercial; Supabase free has no automatic backups (see `docs/05-communication.md`, section 13).
