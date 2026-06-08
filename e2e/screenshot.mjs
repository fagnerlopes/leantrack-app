import { chromium } from "playwright";

const VITE = "http://localhost:5173";

const b = await chromium.launch();

async function devLogin(ctx, email) {
  const resp = await ctx.request.post(`${VITE}/api/dev/login`, { data: { email, password: "" } });
  console.log(`dev login ${email}:`, resp.status());
}

// ── 1. Login page ──────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${VITE}/login`);
  await p.waitForLoadState("networkidle");
  await p.screenshot({ path: "/tmp/01-login.png", fullPage: true });
  await ctx.close();
}

// ── 2. Admin (fagner) — não é dono de nenhum roadmap ───────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await devLogin(ctx, "fagner.lopes@kinghost.com.br");
  const p = await ctx.newPage();

  // "Meus roadmaps" (provavelmente vazio para o fagner)
  await p.goto(`${VITE}/`);
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(600);
  await p.screenshot({ path: "/tmp/02-meus-roadmaps.png", fullPage: true });

  // "Todos os roadmaps"
  await p.getByText("Todos os roadmaps").click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: "/tmp/03-todos-roadmaps.png", fullPage: true });

  // Abrir o roadmap institucional → modo leitura (fagner não é dono)
  const card = p.locator("a[href^='/roadmaps/']").first();
  if (await card.count()) {
    await card.click();
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(800);
    await p.screenshot({ path: "/tmp/04-roadmap-leitura.png", fullPage: true });
  }

  // Painel de usuários
  await p.goto(`${VITE}/admin/users`);
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(600);
  await p.screenshot({ path: "/tmp/05-usuarios.png", fullPage: true });

  await ctx.close();
}

// ── 3. Dona (eduarda) — modo edição completo ───────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await devLogin(ctx, "eduarda.moraes@kinghost.com.br");
  const p = await ctx.newPage();

  await p.goto(`${VITE}/`);
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(600);
  await p.screenshot({ path: "/tmp/06-dona-meus-roadmaps.png", fullPage: true });

  const card = p.locator("a[href^='/roadmaps/']").first();
  if (await card.count()) {
    await card.click();
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(900);
    await p.screenshot({ path: "/tmp/07-roadmap-edicao.png", fullPage: true });
  }

  await ctx.close();
}

await b.close();
console.log("done");
