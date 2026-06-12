import { chromium } from "playwright";

const VITE = "http://localhost:5173";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.request.post(`${VITE}/api/dev/login`, { data: { email: "admin@kinghost.com.br", password: "" } });
const p = await ctx.newPage();

await p.goto(`${VITE}/roadmaps/101-teste-timeline-dinamica`);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(800);

// 1) Estado inicial (rolagem centralizada no "Hoje").
await p.screenshot({ path: "/tmp/timeline-inicial.png", fullPage: true });

// 2) Arrasta a timeline para a esquerda (revela o passado: Out'25/início).
const grid = p.locator('div[style*="overflow"]').first();
const box = await grid.boundingBox();
if (box) {
  const y = box.y + 200;
  const x0 = box.x + box.width - 200;
  await p.mouse.move(x0, y);
  await p.mouse.down();
  await p.mouse.move(x0 + 600, y, { steps: 20 }); // arrasta p/ direita = volta no tempo
  await p.mouse.up();
  await p.waitForTimeout(300);
}
await p.screenshot({ path: "/tmp/timeline-arrastada.png", fullPage: true });

await ctx.close();
await b.close();
console.log("done");
