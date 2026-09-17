import { chromium } from "playwright";

const VITE = "http://localhost:5173";
const b = await chromium.launch();

async function devLogin(ctx, email) {
  const resp = await ctx.request.post(`${VITE}/api/dev/login`, { data: { email, password: "" } });
  console.log(`dev login ${email}:`, resp.status());
}

// ── Contexto do admin ───────────────────────────────────────────
const admin = await b.newContext({ viewport: { width: 1440, height: 900 } });
await devLogin(admin, "admin@example.com");

// Cria um usuário-alvo (já nasce com troca obrigatória).
const tempEmail = `alvo-reset@test.local`;
const createResp = await admin.request.post(`${VITE}/api/admin/users`, {
  data: { name: "Alvo Reset", email: tempEmail, password: "TempSenha123!", role: "user" },
});
console.log("create user:", createResp.status());

const ap = await admin.newPage();

// 1. Página de usuários com o botão "Resetar senha".
await ap.goto(`${VITE}/admin/users`);
await ap.waitForLoadState("networkidle");
await ap.waitForTimeout(400);
await ap.screenshot({ path: "/tmp/reset-01-usuarios.png", fullPage: true });

// 2. Modal de reset com senha gerada + alerta Keeper.
await ap.getByRole("button", { name: "Resetar senha" }).first().click();
await ap.waitForTimeout(300);
await ap.screenshot({ path: "/tmp/reset-02-modal.png", fullPage: false });

// 3. Modal de criação de usuário com gerador.
await ap.getByRole("button", { name: "Cancelar" }).click();
await ap.waitForTimeout(200);
await ap.getByRole("button", { name: "+ Novo usuário" }).click();
await ap.waitForTimeout(300);
await ap.screenshot({ path: "/tmp/reset-03-criar.png", fullPage: false });

// 4. Perfil com alerta Keeper ao digitar nova senha.
await ap.goto(`${VITE}/perfil`);
await ap.waitForLoadState("networkidle");
await ap.getByPlaceholder("Mínimo de 12 caracteres").fill("MinhaNovaSenha123!");
await ap.getByPlaceholder("Repita a nova senha").fill("MinhaNovaSenha123!");
await ap.waitForTimeout(200);
await ap.screenshot({ path: "/tmp/reset-04-perfil-keeper.png", fullPage: true });

// ── Contexto do usuário-alvo: tela bloqueante de troca ──────────
const usr = await b.newContext({ viewport: { width: 1440, height: 900 } });
const loginResp = await usr.request.post(`${VITE}/api/auth/login`, {
  data: { email: tempEmail, password: "TempSenha123!" },
});
console.log("login alvo:", loginResp.status());
const up = await usr.newPage();
await up.goto(`${VITE}/`);
await up.waitForLoadState("networkidle");
await up.waitForTimeout(500);
await up.screenshot({ path: "/tmp/reset-05-troca-obrigatoria.png", fullPage: true });
console.log("url troca:", up.url());

await admin.close();
await usr.close();
await b.close();
console.log("done");
