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
const text = async (page) => (await page.locator("body").innerText()).replace(/ /g, " ");
const login = async (page, email, password) => { await page.goto(BASE + "/login"); await page.fill("#email", email); await page.fill("#password", password); await page.click("button:has-text('Entrar')"); await page.waitForURL(BASE + "/"); };
const settle = (p) => p.waitForTimeout(700);

const o = await newPage(); await login(o, "carlos@exemplo.com", "demonstracao-1");
const r = await newPage(); await login(r, "rafael@exemplo.com", "demonstracao-1");
const d = await newPage(); await login(d, "diego@exemplo.com", "demonstracao-1");

// ---- stock question
await o.goto(BASE + "/comandas/nova");
await o.click("button:has-text('Cliente avulso')");
await o.waitForURL(/\/comandas\/[0-9a-f-]{36}$/);
for (let i = 0; i < 2; i++) { await o.click("button:has-text('Pomada modeladora')"); await settle(o); }
let t = await text(o);
check("two pomadas added (stock was 2)", (t.match(/Pomada modeladora/g) || []).length >= 3, t.slice(0, 400));
await o.click("button:has-text('Pomada modeladora')"); await settle(o);
t = await text(o);
check("third pomada asks 'do you have it in your hands?'", t.includes("Você tem o produto em mãos"), t.slice(0, 600));
await o.screenshot({ path: `${SHOTS}/07-stock-question.png`, fullPage: true });
await o.click("button:has-text('Sim, tenho em mãos')"); await settle(o);
t = await text(o);
check("confirmed: item saved with the 'sem estoque' mark and the question is gone", t.includes("sem estoque no sistema (confirmado)") && !t.includes("Você tem o produto em mãos"), t.slice(0, 600));
await o.goto(BASE + "/");
t = await text(o);
check("dashboard still lists low stock for the owner", t.includes("Estoque baixo"));

// ---- schedule
await o.goto(BASE + "/agenda/nova");
await o.selectOption("#client", { label: "André Souza" });
await o.click("button:has-text('Amanhã')");
await o.fill("#time", "09:00");
await o.selectOption("#barber", { label: "Rafael" });
await o.click("button:has-text('Revisar agendamento')");
await o.click("button:has-text('Sim, agendar')");
await o.waitForSelector("text=Agendado ✓");
await r.goto(BASE + "/agenda");
t = await text(r);
check("Rafael sees tomorrow's appointment in HIS agenda", t.includes("09:00") && t.includes("André Souza"), t.slice(0, 500));
await d.goto(BASE + "/agenda");
t = await text(d);
check("Diego does NOT see Rafael's appointment", !t.includes("André Souza") || !t.includes("09:00"), t.slice(0, 500));
// past time today refused
await o.goto(BASE + "/agenda/nova");
await o.selectOption("#client", { label: "André Souza" });
await o.click("button:has-text('Hoje')");
await o.fill("#time", "00:01");
await o.selectOption("#barber", { label: "Rafael" });
await o.click("button:has-text('Revisar agendamento')");
await o.click("button:has-text('Sim, agendar')");
await o.waitForSelector("p[role=alert]:has-text('passou')");
check("an appointment in the past is refused with a friendly message", true);

// ---- no-show by the barber (the 10:00 appointment of today is Marcos with Rafael)
await r.goto(BASE + "/agenda");
await r.click("text=Marcos Lima");
await r.waitForURL(/\/comandas\//);
await r.click("button:has-text('Cliente não compareceu')");
await r.click("button:has-text('Sim, não compareceu')");
await r.waitForURL(/agenda$/);
t = await text(r);
check("no-show: the client leaves today's agenda", !t.includes("Marcos Lima") || t.indexOf("Marcos Lima") > t.indexOf("Amanhã"), t.slice(0, 500));

// ---- clients: barber registers, duplicate phone refused
await r.goto(BASE + "/clientes/novo");
await r.fill("#name", "Cliente Novo Teste"); await r.fill("#phone", "(11) 95555-0001");
await r.click("button:has-text('Cadastrar cliente')");
await r.waitForURL(/\/clientes\/[0-9a-f-]{36}$/);
t = await text(r);
check("barber registered a client; the page shows no phone to him", t.includes("Cliente Novo Teste") && !t.includes("95555"), t.slice(0, 300));
await o.goto(BASE + "/clientes/novo");
await o.fill("#name", "Outro Nome"); await o.fill("#phone", "11955550001");
await o.click("button:has-text('Cadastrar cliente')");
await o.waitForSelector("p[role=alert]:has-text('telefone')");
check("duplicate phone refused", true);

// ---- settings
await o.goto(BASE + "/configuracoes");
await o.click("role=switch");
await o.click("button:has-text('Revisar e salvar')");
await o.click("button:has-text('Sim, salvar')");
await o.waitForSelector("text=Configurações salvas");
await o.goto(BASE + "/configuracoes");
t = await text(o);
check("setting saved (auto-cancel now Desligado)", t.includes("Desligado"), t.slice(0, 300));

// ---- sessions die when the owner changes things
await d.goto(BASE + "/comandas");
check("Diego is logged in", !d.url().endsWith("/login"));
await o.goto(BASE + "/equipe");
await o.locator("summary:has-text('Diego')").click();
await o.locator("details:has-text('Diego') button:has-text('Desativar pessoa')").click();
await settle(o);
await d.goto(BASE + "/comandas");
check("deactivated person is thrown out on the NEXT request (cookie still exists)", d.url().endsWith("/login"), d.url());
await d.goto(BASE + "/login");
await d.fill("#email", "diego@exemplo.com"); await d.fill("#password", "demonstracao-1"); await d.click("button:has-text('Entrar')");
await d.waitForSelector("p[role=alert]:has-text('incorretos')");
check("and cannot log in again", true);

await o.goto(BASE + "/equipe");
await o.locator("summary:has-text('Rafael')").click();
await o.fill("input[id^='pw-']:visible", "rafael-nova-senha-9");
await o.locator("details:has-text('Rafael') button:has-text('Definir senha nova')").click();
await settle(o);
await r.goto(BASE + "/comandas");
check("password reset by the owner logs the person out of old sessions", r.url().endsWith("/login"), r.url());
await login(r, "rafael@exemplo.com", "rafael-nova-senha-9");
check("and the new password works", r.url() === BASE + "/");

// ---- own password change
await r.goto(BASE + "/minha-senha");
await r.fill("#current", "rafael-nova-senha-9"); await r.fill("#password", "rafael-terceira-3"); await r.fill("#confirm", "rafael-terceira-3");
await r.click("button:has-text('Trocar senha')");
await r.waitForURL(/login/);
check("after changing own password: back to login with the note", (await text(r)).includes("Senha trocada"));
await login(r, "rafael@exemplo.com", "rafael-terceira-3");
check("login with the third password", r.url() === BASE + "/");

await browser.close();
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
