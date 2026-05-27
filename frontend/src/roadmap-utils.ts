import type { Item } from "./api";

export const MONTHS = ["Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez", "Jan", "Fev", "Mar", "Abr", "Mai'27"];
export const TOTAL_MONTHS = 13;
export const LABEL_W = 230;
export const TODAY_FRAC = (25 - 1) / 31;

export const QUARTERS = [
  { label: "Q2 2026", start: 0, span: 2 },
  { label: "Q3 2026", start: 2, span: 3 },
  { label: "Q4 2026", start: 5, span: 3 },
  { label: "Q1 2027", start: 8, span: 3 },
  { label: "Q2 2027", start: 11, span: 2 },
];

export const STATUS_META: Record<string, { label: string; color: string; bg: string; text: string }> = {
  "em-andamento": { label: "Em andamento", color: "#059669", bg: "#d1fae5", text: "#065f46" },
  "nao-iniciado": { label: "Não iniciado", color: "#2563eb", bg: "#dbeafe", text: "#1e3a8a" },
  "concluido":    { label: "Concluído",     color: "#7c3aed", bg: "#ede9fe", text: "#4c1d95" },
  "pausado":      { label: "Pausado",       color: "#d97706", bg: "#fef3c7", text: "#92400e" },
};

export const BAR_COLORS: Record<string, string> = {
  "em-andamento": "#059669",
  "nao-iniciado": "#2563eb",
  "concluido": "#7c3aed",
  "pausado": "#d97706",
};

export type Risk = "critico" | "alerta" | "ok" | null;

export const RISK_META: Record<string, { label: string; color: string; bg: string; text: string; icon: string }> = {
  critico: { label: "Crítico", color: "#dc2626", bg: "#fee2e2", text: "#991b1b", icon: "⚠" },
  alerta:  { label: "Alerta",  color: "#d97706", bg: "#fef3c7", text: "#92400e", icon: "⚡" },
  ok:      { label: "No prazo", color: "#059669", bg: "#d1fae5", text: "#065f46", icon: "✓" },
};

export function calcRisk(item: Pick<Item, "startDate" | "extMilestone"> & { extTeam?: string | null }): Risk {
  if (!item.extMilestone) return null;
  if (!item.startDate) return "alerta";
  const ms = new Date(item.extMilestone);
  const st = new Date(item.startDate);
  const diff = (ms.getTime() - st.getTime()) / 86400000;
  if (diff > 0) return "critico";
  if (diff > -14) return "alerta";
  return "ok";
}

export function dateToFractional(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const base = (2026 - 1) * 12 + 5;
  const absMonths = (y - 1) * 12 + m;
  const monthIdx = absMonths - base;
  return monthIdx + (d - 1) / daysInMonth;
}

// Convention: a bar that ENDS on day D should visually extend through
// the end of day D — i.e., to the start of day D+1. Using (d-1)/daysInMonth
// (same as start) makes end-day-D bars appear to stop at the START of day D,
// causing them to "swallow" the next item's start day in the visual timeline.
export function endDateToFractional(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const base = (2026 - 1) * 12 + 5;
  const absMonths = (y - 1) * 12 + m;
  const monthIdx = absMonths - base;
  return monthIdx + d / daysInMonth;
}

export function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

export function hasExtDep(it: Item): boolean {
  return !!(it.extTeam && it.extMilestone);
}
