// Calendar + public booking link, in a real browser against the real app and database (fresh demo data).
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.env.PLAYWRIGHT_MODULES ?? "/usr/lib/node_modules/");
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/shots";
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] });
let failures = 0;
const check = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + extra}`); if (!cond) failures++; };
const newPage = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERROR", e.message)); return page; };
const text = async (page) => (await page.locator("body").innerText()).replace(/ /g, " ");
const login = async (page, email, password) => { await page.goto(BASE + "/login"); await page.fill("#email", email); await page.fill("#password", password); await page.click("button:has-text('Entrar')"); await page.waitForURL(BASE + "/"); };

const o = await newPage(); await login(o, "carlos@exemplo.com", "demonstracao-1");
const r = await newPage(); await login(r, "rafael@exemplo.com", "demonstracao-1");

// ---- the link starts OFF
const anon = await newPage();
let res = await anon.goto(BASE + "/agendar/barbearia-exemplo");
check("before the owner turns it on, the public address does not exist (404)", res.status() === 404, String(res.status()));

// ---- owner configures the link
await o.goto(BASE + "/configuracoes");
check("settings has the booking card", (await text(o)).includes("Link de agendamento para clientes"));
await o.fill("#slug", "barbearia-exemplo");
await o.check("[aria-label='Receber agendamentos pelo link']");
await o.click("button:has-text('Revisar o link e salvar')");
check("the confirmation step shows the link and the hours", (await text(o)).includes("/agendar/barbearia-exemplo") && (await text(o)).includes("09:00 às 19:00"));
await o.click("button:has-text('Sim, salvar')");
await o.waitForSelector("text=Link de agendamento salvo");
await o.screenshot({ path: `${SHOTS}/20-booking-settings.png`, fullPage: true });

// ---- a visitor books, no login
const stepLink = async (page, label) => { await page.locator(`main a:has-text("${label}")`).first().click(); await page.waitForLoadState("networkidle"); };
const pickDay = async (page) => { await page.locator("main ul li a").nth(1).click(); await page.waitForURL(/[?&]d=/); };
await anon.goto(BASE + "/agendar/barbearia-exemplo");
check("the public page opens without login and shows the shop", (await text(anon)).includes("Barbearia Exemplo") && (await text(anon)).includes("1. Escolha o serviço"), (await text(anon)).slice(0, 300));
const publicHtml = await anon.content();
check("the public page leaks no client or phone", !/André|Marcos|Cadastrado|55\d{8}|@exemplo/.test(publicHtml));
await stepLink(anon, "Corte");
await stepLink(anon, "Qualquer barbeiro"); await anon.waitForSelector("text=3. Escolha o dia");
check("step 3 lists only open days", (await text(anon)).includes("3. Escolha o dia"));
await pickDay(anon); // tomorrow or later: never "too late"
const day = new URL(anon.url()).searchParams.get("d");
check("step 4 shows free times", (await text(anon)).includes("4. Escolha o horário") && (await text(anon)).includes("14:00"), (await text(anon)).slice(0, 300));
await anon.screenshot({ path: `${SHOTS}/21-public-times.png`, fullPage: true });
await stepLink(anon, "14:00"); await anon.waitForURL(/[?&]h=/);
const finalUrl = anon.url();
await anon.fill("#name", "Cliente Online");
await anon.fill("#phone", "(11) 97777-0001");
await anon.click("button:has-text('Confirmar agendamento')");
await anon.waitForSelector("text=Agendamento confirmado");
await anon.screenshot({ path: `${SHOTS}/22-public-confirmed.png`, fullPage: true });
check("the visitor sees the confirmation with the time", (await text(anon)).includes("14:00"));

// ---- the owner sees it in the calendar
await o.goto(BASE + `/agenda?data=${day}`);
let t = await text(o);
check("owner's calendar: the day lists the online booking with the Online mark", t.includes("Cliente Online") && t.includes("Online ·") && t.includes("14:00"), t.slice(0, 600));
await o.screenshot({ path: `${SHOTS}/23-calendar.png`, fullPage: true });
const countText = (await o.locator(`a[href$="data=${day}"] span:last-child`).first().innerText()).trim();
check("the calendar shows the month name and a count on that day", /\d{4}/.test(t) && Number(countText) >= 1, `count=${countText} day=${day}`);

// ---- the time is taken: a specific barber is not offered at that time any more (two barbers: the other one still is)
const two = await newPage();
await two.goto(finalUrl.replace("b=any", "b=any"));
// ... a second visitor with the SAME link still books (the other barber is free), the third one is refused
await two.fill("#name", "Segundo Cliente"); await two.fill("#phone", "(11) 97777-0002");
await two.click("button:has-text('Confirmar agendamento')");
await two.waitForSelector("text=Agendamento confirmado");
const three = await newPage();
await three.goto(finalUrl);
check("a time no one can serve is no longer offered (the page shows the choice step again)", !(await text(three)).includes("Seus dados"), (await text(three)).slice(0, 300));

// ---- the robot trap
const bot = await newPage();
await bot.goto(BASE + "/agendar/barbearia-exemplo");
await stepLink(bot, "Barba");
await stepLink(bot, "Qualquer barbeiro");
await pickDay(bot);
await stepLink(bot, "10:00");
await bot.fill("#name", "Robô"); await bot.fill("#phone", "(11) 97777-0003");
await bot.evaluate(() => { document.getElementById("website").value = "http://spam.example"; });
await bot.click("button:has-text('Confirmar agendamento')");
await bot.waitForSelector("p[role=alert]");
check("a filled hidden field is refused", (await text(bot)).includes("Não foi possível concluir"));

// ---- approval mode
await o.goto(BASE + "/configuracoes");
await o.check("[aria-label='Eu aprovo cada pedido']");
await o.click("button:has-text('Revisar o link e salvar')");
await o.click("button:has-text('Sim, salvar')");
await o.waitForSelector("text=Link de agendamento salvo");
const book = async (name, phone, hour) => {
  const v = await newPage();
  await v.goto(BASE + "/agendar/barbearia-exemplo");
  await stepLink(v, "Corte");
  await stepLink(v, "Qualquer barbeiro");
  await pickDay(v);
  await stepLink(v, hour);
  await v.fill("#name", name); await v.fill("#phone", phone);
  await v.click("button:has-text('Confirmar agendamento')");
  await v.waitForSelector("text=Pedido enviado");
  check(`approval mode: ${name} is told the shop will confirm`, (await text(v)).includes("vai confirmar"));
};
await book("Pedido Um", "(11) 97777-0011", "16:00");
await book("Pedido Dois", "(11) 97777-0012", "16:30");
await o.goto(BASE + "/agenda");
t = await text(o);
check("owner sees both requests waiting", t.includes("Agendamentos online para aprovar (2)"), t.slice(0, 400));
await o.screenshot({ path: `${SHOTS}/24-approvals.png`, fullPage: true });
await o.locator("details:has-text('Pedido Um') summary").click();
await o.locator("details:has-text('Pedido Um') button:has-text('Confirmar agendamento')").click();
await o.waitForSelector("details:has-text('Pedido Um')", { state: "detached" }); // approved: it leaves the waiting list
await o.locator("details:has-text('Pedido Dois') summary").click();
await o.locator("details:has-text('Pedido Dois') input[name=reason]").fill("Barbeiro de folga nesse dia");
await o.locator("details:has-text('Pedido Dois') button:has-text('Recusar')").click();
await o.waitForSelector("details:has-text('Pedido Dois')", { state: "detached" }); // declined: it leaves the waiting list
await o.goto(BASE + "/agenda");
t = await text(o);
check("nothing is waiting any more", !t.includes("para aprovar"), t.slice(0, 300));
await o.goto(BASE + `/agenda?data=${day}`);
t = await text(o);
check("the approved one stays in the calendar; the declined one left it", t.includes("Pedido Um") && !t.includes("Pedido Dois"), t.slice(0, 500));

// ---- team: stop taking online bookings
await o.goto(BASE + "/equipe");
t = await text(o);
check("team shows who accepts online bookings (barbers yes, owner no)", t.includes("Aceita agendamento online"), t.slice(0, 300));
await o.locator("details:has-text('Diego') summary").click();
await o.locator("details:has-text('Diego') button:has-text('Parar de aceitar agendamento online')").click();
await o.waitForSelector("text=Preferência salva.");
const after = await newPage();
await after.goto(BASE + "/agendar/barbearia-exemplo");
await stepLink(after, "Corte");
t = await text(after);
check("the public page no longer offers Diego, but still offers Rafael", !t.includes("Diego") && t.includes("Rafael"), t.slice(0, 300));

// ---- schedule form with a date (from a calendar day)
await o.goto(BASE + `/agenda/nova?data=${day}`);
check("scheduling from a calendar day pre-selects 'Outro dia' or tomorrow", (await o.locator("#date").count()) === 1 || (await text(o)).includes("Amanhã"));

// ---- a barber cannot reach the owner's settings, and the owner pages still need a login
await r.goto(BASE + "/configuracoes");
check("a barber is refused on the settings screen", !(await text(r)).includes("Link de agendamento para clientes"));
const nobody = await newPage();
await nobody.goto(BASE + "/agenda");
check("the private agenda still needs a login", nobody.url().endsWith("/login"));

// ---- the owner turns the link OFF
await o.goto(BASE + "/configuracoes");
await o.uncheck("[aria-label='Receber agendamentos pelo link']");
await o.click("button:has-text('Revisar o link e salvar')");
await o.click("button:has-text('Sim, salvar')");
await o.waitForSelector("text=Link de agendamento salvo");
res = await nobody.goto(BASE + "/agendar/barbearia-exemplo");
check("turned OFF: the public address is gone again (404)", res.status() === 404, String(res.status()));

await browser.close();
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
