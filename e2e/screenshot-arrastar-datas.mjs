// ADR 018 — ajuste de datas arrastando a barra da iniciativa.
// O jsdom não tem geometria, então o arrasto de verdade é verificado aqui: o
// script move o mouse e confere no banco (via API) o que foi gravado.
import { chromium } from "playwright";

const VITE = "http://localhost:5173";
const ROADMAP = 2;
const URL = `${VITE}/roadmaps/${ROADMAP}-roadmap-squad-cloud-2026`;
const OUT = process.env.OUT || "/tmp";

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.request.post(`${VITE}/api/dev/login`, { data: { email: "admin@kinghost.com.br", password: "" } });
const p = await ctx.newPage();

const items = async () => (await (await ctx.request.get(`${VITE}/api/roadmaps/${ROADMAP}/items`)).json());
const byId = async (id) => (await items()).find(i => i.id === id);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

await p.goto(URL);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(600);

// Primeira barra da lista (grupo "em andamento").
const wrap = p.locator("[data-bar-wrap]").first();
const title = await p.locator("[data-gantt-scroll] [data-reorder-handle]").first().innerText();
const target = (await items()).find(i => title.startsWith(i.title.slice(0, 20)));
console.log(`alvo: #${target.id} "${target.title}" ${target.startDate} → ${target.endDate}`);

async function box(loc) { return await loc.boundingBox(); }

// A coluna de títulos é fixa (sticky) e pinta por cima da grade: uma alça que
// fique atrás dela não pode ser clicada. Rola a timeline até a ponta desejada
// aparecer com folga na área visível.
async function reveal(edge) {
  await p.evaluate((edge) => {
    const scroll = document.querySelector("[data-gantt-scroll]");
    const wrap = document.querySelector("[data-bar-wrap]");
    const sb = scroll.getBoundingClientRect();
    const wb = wrap.getBoundingClientRect();
    const x = edge === "start" ? wb.left : wb.right;
    scroll.scrollLeft += (x - sb.left) - 420; // ~420px da borda, bem à direita da coluna fixa
  }, edge);
  await p.waitForTimeout(300);
}

async function drag(loc, dx, label) {
  const bb = await box(loc);
  const sb = await box(p.locator("[data-gantt-scroll]"));
  // Uma barra longa pode ser mais larga que a tela: pegar pelo "centro" cairia
  // fora da janela. O ponto de pega fica na parte visível dela, longe da coluna
  // fixa de títulos (à esquerda) e da borda que dispara a rolagem automática.
  const lo = Math.max(bb.x + 4, sb.x + 240);
  const hi = Math.min(bb.x + bb.width - 4, sb.x + sb.width - 80);
  const x = hi > lo ? (lo + hi) / 2 : bb.x + bb.width / 2;
  const y = bb.y + bb.height / 2;
  await p.mouse.move(x, y);
  await p.waitForTimeout(150);
  await p.mouse.down();
  // Passos intermediários: é o que produz os pointermove que a barra escuta.
  for (let i = 1; i <= 10; i++) {
    await p.mouse.move(x + (dx * i) / 10, y);
    await p.waitForTimeout(20);
  }
  if (label) await p.screenshot({ path: `${OUT}/arrastar-${label}-durante.png` });
  await p.mouse.up();
  await p.waitForTimeout(500);
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "FALHOU"} · ${name} · ${detail}`);
}

// 1) As alças só aparecem ao passar o mouse sobre a barra.
const handleEnd = wrap.locator('[data-bar-handle="end"]');
const opacityIdle = await handleEnd.evaluate(el => getComputedStyle(el).opacity);
await wrap.hover();
await p.waitForTimeout(250);
const opacityHover = await handleEnd.evaluate(el => getComputedStyle(el).opacity);
await p.screenshot({ path: `${OUT}/arrastar-1-alcas-visiveis.png` });
check("alças escondidas fora do hover", opacityIdle === "0", `opacity=${opacityIdle}`);
check("alças aparecem no hover", opacityHover === "1", `opacity=${opacityHover}`);

// 2) Alça direita: muda só a data de fim, para frente.
let before = await byId(target.id);
await reveal("end");
await drag(handleEnd, 90, "2-fim");
let after = await byId(target.id);
check("alça direita adia o fim", Date.parse(after.endDate) > Date.parse(before.endDate),
  `${before.endDate} → ${after.endDate}`);
check("alça direita não mexe no início", after.startDate === before.startDate, after.startDate);
await p.screenshot({ path: `${OUT}/arrastar-2-fim-depois.png` });

// 3) Alça esquerda: muda só o início, para trás.
before = after;
await reveal("start");
const handleStart = p.locator("[data-bar-wrap]").first().locator('[data-bar-handle="start"]');
await drag(handleStart, -60, "3-inicio");
after = await byId(target.id);
check("alça esquerda antecipa o início", Date.parse(after.startDate) < Date.parse(before.startDate),
  `${before.startDate} → ${after.startDate}`);
check("alça esquerda não mexe no fim", after.endDate === before.endDate, after.endDate);

// 4) Corpo da barra: desloca as duas datas preservando a duração.
before = after;
await reveal("start");
await drag(p.locator("[data-bar-wrap]").first(), 70, "4-mover");
after = await byId(target.id);
check("arrastar a barra desloca as duas datas",
  Date.parse(after.startDate) > Date.parse(before.startDate) && Date.parse(after.endDate) > Date.parse(before.endDate),
  `${after.startDate} → ${after.endDate}`);
check("arrastar a barra preserva a duração",
  days(after.startDate, after.endDate) === days(before.startDate, before.endDate),
  `${days(before.startDate, before.endDate)}d → ${days(after.startDate, after.endDate)}d`);

// 5) Um clique na barra (sem arrastar) continua abrindo a edição.
await reveal("start");
await p.locator("[data-bar-wrap]").first().click();
await p.waitForTimeout(400);
const modalOpen = await p.locator("text=Salvar").first().isVisible().catch(() => false);
check("clique sem arrasto abre a edição", modalOpen, `modal=${modalOpen}`);
await p.screenshot({ path: `${OUT}/arrastar-5-clique-abre-modal.png` });
await p.getByLabel("Fechar").click();
await p.waitForTimeout(300);
check("edição fecha antes do próximo passo",
  !(await p.locator("text=Salvar").first().isVisible().catch(() => false)), "modal fechado");

// 6) Um arrasto NÃO deve abrir a edição ao soltar o botão.
before = await byId(target.id);
await reveal("start");
await drag(p.locator("[data-bar-wrap]").first(), -40, null);
const modalAfterDrag = await p.locator("text=Salvar").first().isVisible().catch(() => false);
check("arrasto não abre a edição por engano", !modalAfterDrag, `modal=${modalAfterDrag}`);

// 7) Teclado: seta na alça focada ajusta um dia.
before = await byId(target.id);
await reveal("end");
await p.locator("[data-bar-wrap]").first().locator('[data-bar-handle="end"]').focus();
await p.keyboard.press("ArrowRight");
await p.waitForTimeout(900);
after = await byId(target.id);
check("seta → adia o fim em 1 dia", days(before.endDate, after.endDate) === 2,
  `${before.endDate} → ${after.endDate}`);

// 8) Rolagem automática: segurar a alça junto à borda direita empurra a
// timeline sozinha, para alcançar um trimestre fora da tela.
await reveal("end");
// Recua um pouco: sem folga à direita, a rolagem automática não teria para
// onde ir e o teste mediria zero por falta de espaço, não por falha.
await p.evaluate(() => {
  const el = document.querySelector("[data-gantt-scroll]");
  el.scrollLeft = Math.max(0, el.scrollLeft - 250);
});
await p.waitForTimeout(300);
const scrollBox = await p.locator("[data-gantt-scroll]").boundingBox();
const endBox = await p.locator("[data-bar-wrap]").first().locator('[data-bar-handle="end"]').boundingBox();
const scrollBefore = await p.evaluate(() => document.querySelector("[data-gantt-scroll]").scrollLeft);
await p.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2);
await p.mouse.down();
await p.mouse.move(scrollBox.x + scrollBox.width - 20, endBox.y + endBox.height / 2, { steps: 12 });
await p.waitForTimeout(900); // parado na borda: só a rolagem automática atua
const scrollDuring = await p.evaluate(() => document.querySelector("[data-gantt-scroll]").scrollLeft);
await p.screenshot({ path: `${OUT}/arrastar-7-autoscroll.png` });
await p.mouse.up();
await p.waitForTimeout(500);
check("a timeline rola sozinha ao segurar na borda", scrollDuring > scrollBefore + 50,
  `scrollLeft ${Math.round(scrollBefore)} → ${Math.round(scrollDuring)}`);

await p.screenshot({ path: `${OUT}/arrastar-6-final.png`, fullPage: false });

// Devolve a iniciativa às datas originais: o script pode rodar quantas vezes
// for preciso sem empurrar a massa de teste para frente.
await ctx.request.put(`${VITE}/api/roadmaps/${ROADMAP}/items/${target.id}`, {
  data: { ...(await byId(target.id)), startDate: target.startDate, endDate: target.endDate },
});
const restored = await byId(target.id);
check("datas originais restauradas",
  restored.startDate === target.startDate && restored.endDate === target.endDate,
  `${restored.startDate} → ${restored.endDate}`);

await b.close();
const failed = results.filter(r => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} verificações passaram ===`);
if (failed.length) { console.log(failed.map(f => "  - " + f.name).join("\n")); process.exit(1); }
