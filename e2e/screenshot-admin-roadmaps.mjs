import { chromium } from "playwright";

// Check visual do painel do admin sobre roadmaps (ADR 016).
const VITE = "http://localhost:5173";
const b = await chromium.launch();

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const resp = await ctx.request.post(`${VITE}/api/dev/login`, {
  data: { email: "fagner.lopes@kinghost.com.br", password: "" },
});
console.log("dev login admin:", resp.status());
const p = await ctx.newPage();

// 1. Lista de roadmaps — o admin agora vê "Administrar roadmaps" no cabeçalho.
await p.goto(`${VITE}/`);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(400);
await p.screenshot({ path: "/tmp/adm-01-lista.png" });

// 2. Painel de administração de roadmaps.
await p.getByRole("link", { name: "Administrar roadmaps" }).click();
await p.waitForLoadState("networkidle");
await p.waitForTimeout(500);
await p.screenshot({ path: "/tmp/adm-02-painel.png" });

// 3. Modal de transferência de propriedade.
await p.getByRole("button", { name: /Transferir dono/ }).first().click();
await p.waitForTimeout(400);
await p.screenshot({ path: "/tmp/adm-03-transferir.png" });
await p.keyboard.press("Escape");
await p.getByText("Cancelar").click();
await p.waitForTimeout(300);

// 4. Diálogo de compartilhamento aberto pelo admin.
await p.getByRole("button", { name: /Gerenciar acesso/ }).first().click();
await p.waitForTimeout(600);
await p.screenshot({ path: "/tmp/adm-04-acesso.png" });

await ctx.close();
await b.close();
console.log("done");
