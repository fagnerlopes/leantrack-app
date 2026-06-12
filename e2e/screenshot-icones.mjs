import { chromium } from "playwright";

const VITE = "http://localhost:5173";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });

async function devLogin(email) {
  const resp = await ctx.request.post(`${VITE}/api/dev/login`, { data: { email, password: "" } });
  console.log(`dev login ${email}:`, resp.status());
}
await devLogin("admin@kinghost.com.br");

// Cria um roadmap próprio (owner => canEdit/canShare/canDelete) com itens que
// exercitam todos os ícones: risco crítico/alerta, dependência, link de épico.
const r = await ctx.request.post(`${VITE}/api/roadmaps`, { data: { name: "Demo Ícones lucide", description: "" } });
const rm = await r.json();
console.log("roadmap:", rm.id, rm.slug);

async function item(it) {
  const base = {
    title: "", status: "nao-iniciado", startDate: null, endDate: null, progress: 0,
    dependencyId: null, notes: "", extTeam: null, extDescription: null, extMilestone: null,
    sortOrder: 0, color: null, epicUrl: null,
  };
  const resp = await ctx.request.post(`${VITE}/api/roadmaps/${rm.id}/items`, { data: { ...base, ...it } });
  return resp.json();
}

const a = await item({ title: "Migração de banco", status: "em-andamento", startDate: "2026-06-01", endDate: "2026-08-31", progress: 45, epicUrl: "https://jira.example.com/EPIC-1", sortOrder: 10 });
await item({ title: "Bloqueado por time de Rede", status: "nao-iniciado", startDate: "2026-07-01", endDate: "2026-09-30", extTeam: "Rede", extDescription: "Aguardando liberação de VLAN", extMilestone: "2026-06-20", sortOrder: 20 });
await item({ title: "Depende da migração", status: "nao-iniciado", startDate: "2026-09-01", endDate: "2026-10-31", dependencyId: a.id, sortOrder: 30 });
await item({ title: "Hardening concluído", status: "concluido", startDate: "2026-05-01", endDate: "2026-06-01", sortOrder: 40 });

const url = `${VITE}/roadmaps/${rm.id}-${rm.slug}`;
const p = await ctx.newPage();

// 1. Visão geral (full page) — ícones de risco, chips, setas do Gantt, link de épico.
await p.goto(url);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(700);
await p.screenshot({ path: "/tmp/icones-01-overview.png", fullPage: true });

// 2. Menu de ações (9 pontos) aberto.
await p.getByRole("button", { name: "Ações" }).click();
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/icones-02-menu.png", fullPage: false });

// 3. Modal de item — ícone X de fechar.
await p.keyboard.press("Escape");
await p.getByText("Migração de banco").first().click();
await p.waitForTimeout(400);
await p.screenshot({ path: "/tmp/icones-03-modal.png", fullPage: false });

// limpeza
await ctx.request.delete(`${VITE}/api/roadmaps/${rm.id}`, { data: { confirmSlug: rm.slug } });
await ctx.close();
await b.close();
console.log("done");
