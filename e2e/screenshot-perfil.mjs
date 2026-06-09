import { chromium } from "playwright";

const VITE = "http://localhost:5173";
const b = await chromium.launch();

async function devLogin(ctx, email) {
  const resp = await ctx.request.post(`${VITE}/api/dev/login`, { data: { email, password: "" } });
  console.log(`dev login ${email}:`, resp.status());
}

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await devLogin(ctx, "fagner.lopes@kinghost.com.br");
const p = await ctx.newPage();

// 1. Lista de roadmaps com o menu do usuário aberto (avatar de iniciais)
await p.goto(`${VITE}/`);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(500);
await p.getByLabel("Menu do usuário").click();
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/perfil-01-menu.png", fullPage: false });

// 2. Página de perfil
await p.goto(`${VITE}/perfil`);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(400);
await p.screenshot({ path: "/tmp/perfil-02-pagina.png", fullPage: true });

// 3. Página de perfil com senha visível (botão Mostrar)
await p.getByPlaceholder("Mínimo de 8 caracteres").fill("minhaNovaSenha123");
await p.getByPlaceholder("Repita a nova senha").fill("minhaNovaSenha123");
await p.getByRole("button", { name: "Mostrar" }).click();
await p.waitForTimeout(200);
await p.screenshot({ path: "/tmp/perfil-03-senha-visivel.png", fullPage: true });

await ctx.close();
await b.close();
console.log("done");
