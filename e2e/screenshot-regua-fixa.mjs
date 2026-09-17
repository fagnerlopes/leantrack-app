// ADR 017 — verifica que a régua de datas fica parada enquanto a lista rola.
// Não basta olhar a imagem: medimos a posição da régua antes e depois de rolar.
import { chromium } from "playwright";

const VITE = "http://localhost:5173";
const URL = `${VITE}/roadmaps/2-roadmap-squad-cloud-2026`;
const OUT = process.env.OUT || "/tmp";

const b = await chromium.launch();

async function run(label, width, height) {
  const ctx = await b.newContext({ viewport: { width, height } });
  await ctx.request.post(`${VITE}/api/dev/login`, { data: { email: "admin@example.com", password: "" } });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(700);

  const probe = () => p.evaluate(() => {
    const scroll = document.querySelector("[data-gantt-scroll]");
    const ruler = scroll?.querySelector("[data-gantt-content]")?.firstElementChild;
    const firstRow = [...document.querySelectorAll("[data-reorder-handle]")][0];
    const r = (el) => el ? Math.round(el.getBoundingClientRect().top) : null;
    return {
      ruler: r(ruler),
      firstRow: r(firstRow),
      scrollTop: Math.round(scroll?.scrollTop ?? -1),
      pageScrollY: Math.round(window.scrollY),
      canScrollInside: scroll ? scroll.scrollHeight > scroll.clientHeight + 1 : false,
    };
  });

  const before = await probe();
  await p.screenshot({ path: `${OUT}/regua-${label}-topo.png` });

  // Rola dentro da lista (roda do mouse sobre a área do gráfico).
  const box = await p.locator("[data-gantt-scroll]").boundingBox();
  if (box) {
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.wheel(0, 700);
    await p.waitForTimeout(500);
  }
  const after = await probe();
  await p.screenshot({ path: `${OUT}/regua-${label}-rolado.png` });

  const rulerMoved = before.ruler !== null && after.ruler !== null ? Math.abs(after.ruler - before.ruler) : null;
  const listMoved = before.firstRow !== null && after.firstRow !== null ? Math.abs(after.firstRow - before.firstRow) : null;
  console.log(`\n[${label}] ${width}x${height}`);
  console.log("  antes: ", JSON.stringify(before));
  console.log("  depois:", JSON.stringify(after));
  console.log(`  régua deslocou: ${rulerMoved}px · lista deslocou: ${listMoved}px`);
  await ctx.close();
  return { label, before, after, rulerMoved, listMoved };
}

const results = [];
results.push(await run("desktop", 1280, 720));
results.push(await run("wide", 1440, 900));
results.push(await run("mobile", 375, 812));
results.push(await run("baixa", 1280, 560)); // abaixo de 600px: volta a rolar a página

await b.close();
console.log("\n=== resumo ===");
for (const r of results) {
  console.log(`${r.label}: régua ${r.rulerMoved}px · lista ${r.listMoved}px · rolagem interna=${r.after.canScrollInside} · scrollY=${r.after.pageScrollY}`);
}
