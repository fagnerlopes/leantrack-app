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

// 1. Roadmap existente — verifica o badge "Hoje" com a data atual (jun/2026).
await p.goto(`${VITE}/roadmaps/1-roadmap-squad-cloud-2026`);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(700);
await p.screenshot({ path: "/tmp/melhoria-01-roadmap-hoje.png", fullPage: true });

// 2. Roadmap recém-criado (vazio) — legenda deve ficar no RODAPÉ da viewport.
const nome = "Teste Legenda Rodapé " + Date.now();
const r = await ctx.request.post(`${VITE}/api/roadmaps`, { data: { name: nome, description: "" } });
const rm = await r.json();
console.log("roadmap criado:", rm.id, rm.slug);
await p.goto(`${VITE}/roadmaps/${rm.id}-${rm.slug}`);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(500);
// viewport (não fullPage) para evidenciar que a legenda está no rodapé da tela.
await p.screenshot({ path: "/tmp/melhoria-02-legenda-rodape.png", fullPage: false });

// 3. Autocomplete no compartilhamento.
await p.getByRole("button", { name: "Compartilhar" }).click();
await p.waitForTimeout(400);
await p.getByLabel("e-mail do convidado").fill("king");
await p.waitForTimeout(700); // aguarda debounce + busca
await p.screenshot({ path: "/tmp/melhoria-03-autocomplete.png", fullPage: false });

// limpa o roadmap de teste
await ctx.request.delete(`${VITE}/api/roadmaps/${rm.id}`, { data: { confirmSlug: rm.slug } });

await ctx.close();
await b.close();
console.log("done");
