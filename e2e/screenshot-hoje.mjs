import { chromium } from "playwright";

const VITE = "http://localhost:5173";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.request.post(`${VITE}/api/dev/login`, { data: { email: "ana.souza@example.com", password: "" } });
const p = await ctx.newPage();

await p.goto(`${VITE}/roadmaps/1-roadmap-squad-cloud-2026`);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(700);
await p.screenshot({ path: "/tmp/hoje-fullpage.png", fullPage: true });

// recorte do rodapé do quadro, onde fica o badge "Hoje".
const card = p.locator("div").filter({ hasText: /Hoje ·/ }).last();
await card.scrollIntoViewIfNeeded();
await p.waitForTimeout(200);
const badge = p.getByText(/Hoje ·/);
const box = await badge.boundingBox();
if (box) {
  await p.screenshot({
    path: "/tmp/hoje-recorte.png",
    clip: { x: Math.max(0, box.x - 120), y: Math.max(0, box.y - 30), width: 320, height: 80 },
  });
}

await ctx.close();
await b.close();
console.log("done");
