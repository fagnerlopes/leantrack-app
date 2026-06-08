import type { Roadmap } from "./api";

// URLs no formato /roadmaps/{id}-{slug} (estilo Stack Overflow): o {id} determina
// o destino; o {slug} é apenas enfeite legível e pode ser ignorado.
export function roadmapPath(rm: Pick<Roadmap, "id" | "slug">): string {
  return `/roadmaps/${rm.id}-${rm.slug}`;
}

// Extrai o id inteiro do início do parâmetro de rota ("12-roadmap-vps-2026" → 12).
// Retorna null se não houver um id válido no início.
export function parseRoadmapId(param: string | undefined): number | null {
  if (!param) return null;
  const m = param.match(/^(\d+)/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}
