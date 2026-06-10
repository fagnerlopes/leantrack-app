import { chromium } from "playwright";

const VITE = "http://localhost:5173";
const b = await chromium.launch();

async function devLogin(ctx, email) {
  const resp = await ctx.request.post(`${VITE}/api/dev/login`, { data: { email, password: "" } });
  console.log(`dev login ${email}:`, resp.status());
}

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
// Eduarda é dona do roadmap local → vê "Compartilhar" e "Excluir".
await devLogin(ctx, "eduarda.moraes@kinghost.com.br");
const p = await ctx.newPage();

// 1. Lista de roadmaps — três abas (Meus / Compartilhados comigo / Todos)
await p.goto(`${VITE}/`);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(500);
await p.screenshot({ path: "/tmp/share-01-lista.png", fullPage: false });

// 2. Aba "Compartilhados comigo"
await p.getByText("Compartilhados comigo").click();
await p.waitForTimeout(500);
await p.screenshot({ path: "/tmp/share-02-compartilhados.png", fullPage: false });

// 3. Página do roadmap (dona) — botão "Compartilhar" visível
await p.goto(`${VITE}/roadmaps/1-roadmap-squad-cloud-2026`);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(700);
await p.screenshot({ path: "/tmp/share-03-roadmap.png", fullPage: false });

// 4. Diálogo de compartilhamento aberto
await p.getByRole("button", { name: "Compartilhar" }).click();
await p.waitForTimeout(500);
await p.screenshot({ path: "/tmp/share-04-dialogo.png", fullPage: false });

await ctx.close();
await b.close();
console.log("done");
