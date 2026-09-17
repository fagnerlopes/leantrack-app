// ADR 017 — o cabeçalho do app fica fixo nas telas que rolam (lista de
// roadmaps, usuários). Viewport baixa de propósito, para forçar a rolagem.
import { chromium } from "playwright";
const VITE = "http://localhost:5173";
const OUT = process.env.OUT || "/tmp";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 420 } });
await ctx.request.post(`${VITE}/api/dev/login`, { data: { email: "admin@example.com", password: "" } });
const p = await ctx.newPage();
for (const [rota, nome] of [["/", "lista"], ["/admin/users", "usuarios"]]) {
  await p.goto(`${VITE}${rota}`);
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(600);
  const top = () => p.evaluate(() => Math.round(document.querySelector("header").getBoundingClientRect().top));
  const antes = await top();
  await p.evaluate(() => window.scrollBy(0, 400));
  await p.waitForTimeout(300);
  const depois = await top();
  const scrollY = await p.evaluate(() => Math.round(window.scrollY));
  console.log(`${nome}: header top ${antes} -> ${depois} (scrollY=${scrollY}) fixo=${antes === depois}`);
  await p.screenshot({ path: `${OUT}/header-${nome}.png` });
}
await ctx.close(); await b.close();
