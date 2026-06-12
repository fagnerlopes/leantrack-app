import { chromium } from "playwright";

const VITE = "http://localhost:5173";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.request.post(`${VITE}/api/dev/login`, { data: { email: "admin@kinghost.com.br", password: "" } });
const p = await ctx.newPage();

await p.goto(`${VITE}/roadmaps/101-teste-timeline-dinamica`);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(800);

const scroller = p.locator('div[style*="overflow-x: auto"], div[style*="overflowX"]').first();
const metrics = async () => scroller.evaluate(el => ({ scrollLeft: Math.round(el.scrollLeft), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
console.log("viewport 1920 — métricas iniciais:", await metrics());

// 1) Estado inicial (rolagem centralizada no "Hoje").
await p.screenshot({ path: "/tmp/timeline-inicial.png", fullPage: true });

// 2) Arrasta a timeline para a direita (revela o passado: início Out'25).
const box = await scroller.boundingBox();
if (box) {
  const y = box.y + 200, x0 = box.x + box.width - 250;
  await p.mouse.move(x0, y);
  await p.mouse.down();
  await p.mouse.move(x0 + 1200, y, { steps: 25 });
  await p.mouse.up();
  await p.waitForTimeout(300);
}
console.log("após arrastar p/ a direita:", await metrics());
await p.screenshot({ path: "/tmp/timeline-arrastada.png", fullPage: true });

// 3) Reordenação (drag-and-drop nativo HTML5) dentro do status "Não iniciado".
const titlesNaoIniciado = async () => p.evaluate(() => {
  // textos das iniciativas, na ordem em que aparecem no DOM
  return [...document.querySelectorAll('div')].filter(d => /^(Nova arquitetura|Lançamento GA)/.test(d.textContent || "") && d.querySelector('span[title="Arraste para reordenar"]') == null && d.offsetParent)
    .map(d => (d.textContent || "").slice(0, 18));
});
const grips = await p.locator('span[title="Arraste para reordenar"]').elementHandles();
// índices na ordem de render: 0 Migração · 1 Nova arquitetura · 2 Lançamento GA · 3 Fundação
const ordemAntes = await p.locator('span[title="Arraste para reordenar"]').evaluateAll(
  els => els.map(e => (e.closest('div[style*="sticky"]')?.textContent || "").replace(/Crítico.*/, "").slice(0, 16))
);
console.log("ordem dos puxadores ANTES:", ordemAntes);

if (grips.length >= 3) {
  await p.evaluate(([src, tgt]) => {
    const dt = new DataTransfer();
    const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    fire(src, "dragstart");
    fire(tgt, "dragover");
    fire(tgt, "drop");
    fire(src, "dragend");
  }, [grips[2], grips[1]]); // arrasta "Lançamento GA" para cima de "Nova arquitetura"
  await p.waitForTimeout(500);
}
const ordemDepois = await p.locator('span[title="Arraste para reordenar"]').evaluateAll(
  els => els.map(e => (e.closest('div[style*="sticky"]')?.textContent || "").replace(/Crítico.*/, "").slice(0, 16))
);
console.log("ordem dos puxadores DEPOIS:", ordemDepois);
await p.screenshot({ path: "/tmp/timeline-reordenado.png", fullPage: true });

await ctx.close();
await b.close();
console.log("done");
