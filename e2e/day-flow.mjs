import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.env.PLAYWRIGHT_MODULES ?? "/usr/lib/node_modules/");
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(process.env.NODE_PATH + "/playwright")); }
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/shots";
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] });
let failures = 0;
const check = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + extra}`); if (!cond) failures++; };
const newPage = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERROR", e.message)); return { ctx, page }; };
const text = async (page) => (await page.locator("body").innerText()).replace(/ /g, " ");
const login = async (page, email, password) => { await page.goto(BASE + "/login"); await page.fill("#email", email); await page.fill("#password", password); await page.click("button:has-text('Entrar')"); };

// ---- owner
const owner = await newPage();
let p = owner.page;
await p.goto(BASE + "/");
check("no session -> login screen", p.url().endsWith("/login"));
await login(p, "carlos@exemplo.com", "senha-errada-1");
await p.waitForSelector("[role=alert]");
{ await p.waitForTimeout(500); const tt = await text(p); check("wrong password shows the vague message", tt.includes("E-mail ou senha incorretos"), JSON.stringify(tt)); }
await login(p, "carlos@exemplo.com", "demonstracao-1");
await p.waitForURL(BASE + "/");
let t = await text(p);
check("owner dashboard: revenue of the 3 paid comandas (R$ 216,90)", t.includes("R$ 216,90"), t.slice(0, 400));
check("owner sees register open", t.includes("Aberto"));
await p.screenshot({ path: `${SHOTS}/01-owner-dashboard.png`, fullPage: true });

await p.goto(BASE + "/caixa");
t = await text(p);
check("cash page: expected cash R$ 128,50", t.includes("R$ 128,50"), t);

// new comanda -> add Corte -> pay in Pix
await p.goto(BASE + "/comandas/nova");
await p.click("button:has-text('Cliente avulso')");
await p.waitForURL(/\/comandas\/[0-9a-f-]{36}$/);
const comandaUrl = p.url();
t = await text(p);
check("new comanda page opened with a number", /Comanda #\d+/.test(t), t.slice(0, 200));
await p.click("button:has-text('Corte')>>nth=0");
await p.waitForSelector("text=Remover Corte", { timeout: 10000 }).catch(() => {});
t = await text(p);
check("item added, total R$ 45,00", t.includes("R$ 45,00"), t);
await p.screenshot({ path: `${SHOTS}/02-comanda.png`, fullPage: true });
await p.click("text=Fechar comanda");
await p.waitForURL(/fechar$/);
await p.click("button:has-text('Pix')");
await p.click("button:has-text('Confirmar pagamento')");
await p.waitForURL(/paga=1/);
t = await text(p);
check("payment registered", t.includes("Pagamento registrado") && t.includes("Fechada"), t.slice(0, 300));
await p.goto(BASE + "/");
t = await text(p);
check("dashboard revenue now R$ 261,90", t.includes("R$ 261,90"), t.slice(0, 300));

// expense
await p.goto(BASE + "/caixa");
await p.fill("#exp-desc", "Papel toalha");
await p.fill("#exp-amount", "10,00");
await p.click("button:has-text('Lançar despesa')>>nth=-1");
await p.waitForSelector("text=Despesa lançada");
t = await text(p);
check("expense shows in the movements and lowers the drawer (R$ 118,50)", t.includes("Papel toalha") && t.includes("R$ 118,50"), t);

// reports / settings / team load for the owner
for (const [path, needle] of [["/relatorios", "Entradas"], ["/configuracoes", "Comandas pendentes"], ["/equipe", "Adicionar pessoa"], ["/servicos", "Novo serviço"], ["/estoque", "Novo produto"], ["/clientes", "André Souza"], ["/agenda", "Hoje ("], ["/comandas", "Abertas"]]) {
  await p.goto(BASE + path);
  const body = await text(p);
  check(`owner can open ${path}`, body.includes(needle), body.slice(0, 200));
}
await p.goto(BASE + "/relatorios");
t = await text(p);
check("report shows money in (R$ 261,90) and the expense (R$ 28,50)", t.includes("R$ 261,90") && t.includes("R$ 28,50"), t.slice(0, 500));
await p.screenshot({ path: `${SHOTS}/03-reports.png`, fullPage: true });

// ---- barber
const barber = await newPage();
const b = barber.page;
await login(b, "rafael@exemplo.com", "demonstracao-1");
await b.waitForURL(BASE + "/");
t = await text(b);
check("barber sees 'Meu dia'", t.includes("Meu dia"));
check("barber does not see the owner's revenue", !t.includes("Faturado hoje"));
for (const path of ["/equipe", "/relatorios", "/servicos", "/estoque", "/configuracoes", "/caixa", "/caixa/fechar"]) {
  await b.goto(BASE + path);
  t = await text(b);
  check(`barber is refused at ${path}`, t.includes("Sem acesso"), t.slice(0, 200));
}
await b.goto(BASE + "/clientes");
t = await text(b);
check("barber sees clients' names but NO phone", t.includes("André Souza") && !/\(\d{2}\) \d{4,5}-\d{4}/.test(t), t.slice(0, 300));
const html = await b.content();
check("no phone digits in the barber's page source", !/1198888|11977772222|11988881111/.test(html));
await b.goto(BASE + "/comandas");
t = await text(b);
check("barber's comandas page does not list the owner's own walk-in comanda #" + "(new)", !t.includes(comandaUrl.split("/").pop()));
// the barber opens the owner's comanda by URL -> refused
await b.goto(comandaUrl);
t = await text(b);
check("barber cannot open the owner's comanda by URL", t.includes("Sem acesso"), t.slice(0, 200));
await b.screenshot({ path: `${SHOTS}/04-barber.png`, fullPage: true });

// ---- close the register (owner): decide every comanda, confirm
await p.goto(BASE + "/caixa/fechar");
t = await text(p);
check("close cash lists the unpaid comandas to decide", t.includes("sem pagamento") || t.includes("Atenção"), t.slice(0, 400));
await p.screenshot({ path: `${SHOTS}/05-close-cash.png`, fullPage: true });
await p.fill("#counted", "118,50");
// decide each comanda: click the first non-link option, confirm
const sections = await p.locator("section[aria-label^='Comanda']").count();
for (let i = 0; i < sections; i++) {
  const sec = p.locator("section[aria-label^='Comanda']").nth(i);
  const btns = sec.locator("button.buttonSecondary, button[class*='buttonSecondary']");
  await btns.first().click();
  await p.click("button:has-text('Sim, confirmar')");
}
await p.click("button:has-text('Revisar e fechar caixa')");
await p.screenshot({ path: `${SHOTS}/06-close-summary.png`, fullPage: true });
await p.click("button:has-text('Sim, fechar o caixa')");
await p.waitForSelector("text=Caixa fechado", { timeout: 10000 });
t = await text(p);
check("register closed with the summary from the server", t.includes("Caixa fechado") && t.includes("R$ 118,50"), t.slice(0, 400));
await p.goto(BASE + "/caixa");
t = await text(p);
check("cash page now says closed", t.includes("O caixa está fechado"), t.slice(0, 200));

// ---- logout
await p.goto(BASE + "/mais");
await p.click("button:has-text('Sair')");
await p.waitForURL(/login/);
await p.goto(BASE + "/");
check("after logout, back to login", p.url().endsWith("/login"));

// ---- cron
const secret = process.env.CRON_SECRET ?? "";
let r = await fetch(BASE + "/api/jobs/expiry");
check("cron without secret -> 401", r.status === 401);
r = await fetch(BASE + "/api/jobs/expiry", { headers: { authorization: "Bearer wrong" } });
check("cron with wrong secret -> 401", r.status === 401);
r = await fetch(BASE + "/api/jobs/expiry", { headers: { authorization: `Bearer ${secret}` } });
const body = await r.json();
check("cron with the secret runs", r.status === 200 && typeof body.cancelled === "number", JSON.stringify(body));

await browser.close();
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
