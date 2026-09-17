import { chromium } from "playwright";

const VITE = "http://localhost:5173";
const b = await chromium.launch();

async function devLogin(ctx, email) {
  const resp = await ctx.request.post(`${VITE}/api/dev/login`, { data: { email, password: "" } });
  console.log(`dev login ${email}:`, resp.status());
}

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await devLogin(ctx, "ana.souza@example.com");
const p = await ctx.newPage();

// Lista — header sem botão voltar
await p.goto(`${VITE}/`);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(600);
await p.screenshot({ path: "/tmp/h1-lista.png" });

// Abre o roadmap (modo edição) — header com botão voltar + menu do usuário
const card = p.locator("a[href^='/roadmaps/']").first();
await card.click();
await p.waitForLoadState("networkidle");
await p.waitForTimeout(900);
await p.screenshot({ path: "/tmp/h2-roadmap.png" });

// Abre o menu do usuário no RoadmapView (o que estava faltando)
await p.getByRole("button", { name: "Menu do usuário" }).click();
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/h3-roadmap-menu-aberto.png" });

// Página de perfil — header com voltar
await p.goto(`${VITE}/perfil`);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(500);
await p.screenshot({ path: "/tmp/h4-perfil.png" });

await ctx.close();
await b.close();
console.log("done");
