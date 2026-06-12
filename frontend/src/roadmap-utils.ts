import { AlertTriangle, Zap, Check, type LucideIcon } from "lucide-react";
import type { Item } from "./api";

export const LABEL_W = 230;

const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Índice absoluto de mês: (ano - 1) * 12 + mês(1-12). Permite aritmética simples
// entre datas (diferença em meses, arredondamento para trimestre, etc).
function absMonth(year: number, month1based: number): number {
  return (year - 1) * 12 + month1based;
}

// Converte um índice absoluto de mês de volta em { ano, mês(1-12) }.
function fromAbsMonth(a: number): { year: number; month: number } {
  return { year: Math.floor((a - 1) / 12) + 1, month: ((a - 1) % 12) + 1 };
}

function parseYM(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

export function labelForDate(now: Date): string {
  return `${now.getDate()} ${MONTH_ABBR[now.getMonth()]} ${now.getFullYear()}`;
}

export type Quarter = { label: string; start: number; span: number };

export type Timeline = {
  baseAbsMonth: number;
  totalMonths: number;
  months: string[];
  quarters: Quarter[];
  todayFrac: number;
  todayInRange: boolean;
  todayLabel: string;
  dateToFractional: (dateStr: string | null) => number | null;
  endDateToFractional: (dateStr: string | null) => number | null;
};

type DatedItem = Pick<Item, "startDate" | "endDate" | "extMilestone">;

// Posição fracionária de uma data (em "meses") relativa ao início da timeline.
// 0 = 1º dia da coluna 0; 1 = 1º dia da coluna seguinte; etc.
function fractionalForAbs(y: number, m: number, d: number, baseAbsMonth: number): number {
  const daysInMonth = new Date(y, m, 0).getDate();
  return absMonth(y, m) - baseAbsMonth + (d - 1) / daysInMonth;
}

// Calcula o intervalo da timeline a partir das datas das iniciativas:
// começa no início do trimestre (com 1 mês de folga antes da iniciativa mais
// antiga) e termina no fim do trimestre (com 1 mês de folga após a mais recente).
// Sem nenhuma data cadastrada, usa um intervalo padrão em torno de hoje.
export function buildTimeline(items: DatedItem[]): Timeline {
  const absMonths: number[] = [];
  for (const it of items) {
    for (const ds of [it.startDate, it.endDate, it.extMilestone]) {
      if (ds) {
        const { y, m } = parseYM(ds);
        absMonths.push(absMonth(y, m));
      }
    }
  }

  let minAbs: number;
  let maxAbs: number;
  if (absMonths.length === 0) {
    const now = new Date();
    const t = absMonth(now.getFullYear(), now.getMonth() + 1);
    minAbs = t;
    maxAbs = t;
  } else {
    minAbs = Math.min(...absMonths);
    maxAbs = Math.max(...absMonths);
  }

  // 1 mês de folga em cada ponta, depois arredonda para trimestre cheio.
  minAbs -= 1;
  maxAbs += 1;
  const minMonth = fromAbsMonth(minAbs).month; // 1-12
  const maxMonth = fromAbsMonth(maxAbs).month;
  const baseAbsMonth = minAbs - ((minMonth - 1) % 3);        // recua ao início do trimestre
  const endAbsMonth = maxAbs + (2 - ((maxMonth - 1) % 3));   // avança ao fim do trimestre
  const totalMonths = endAbsMonth - baseAbsMonth + 1;        // múltiplo de 3

  const months: string[] = [];
  for (let i = 0; i < totalMonths; i++) {
    const { year, month } = fromAbsMonth(baseAbsMonth + i);
    const abbr = MONTH_ABBR[month - 1];
    // Ano só em janeiro e na primeira coluna, para não poluir.
    const showYear = month === 1 || i === 0;
    months.push(showYear ? `${abbr}'${String(year).slice(2)}` : abbr);
  }

  const quarters: Quarter[] = [];
  for (let i = 0; i < totalMonths; i += 3) {
    const { year, month } = fromAbsMonth(baseAbsMonth + i);
    const qn = Math.floor((month - 1) / 3) + 1;
    quarters.push({ label: `Q${qn} ${year}`, start: i, span: 3 });
  }

  const now = new Date();
  const todayFrac = fractionalForAbs(now.getFullYear(), now.getMonth() + 1, now.getDate(), baseAbsMonth);

  const dateToFractional = (dateStr: string | null): number | null => {
    if (!dateStr) return null;
    const { y, m, d } = parseYM(dateStr);
    return fractionalForAbs(y, m, d, baseAbsMonth);
  };

  // Uma barra que TERMINA no dia D deve se estender até o fim do dia D (início
  // do dia D+1). Usar d/daysInMonth (em vez de (d-1)/daysInMonth) evita que a
  // barra "engula" o dia de início do próximo item.
  const endDateToFractional = (dateStr: string | null): number | null => {
    if (!dateStr) return null;
    const { y, m, d } = parseYM(dateStr);
    const daysInMonth = new Date(y, m, 0).getDate();
    return absMonth(y, m) - baseAbsMonth + d / daysInMonth;
  };

  return {
    baseAbsMonth,
    totalMonths,
    months,
    quarters,
    todayFrac,
    todayInRange: todayFrac >= 0 && todayFrac <= totalMonths,
    todayLabel: labelForDate(now),
    dateToFractional,
    endDateToFractional,
  };
}

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

export const RISK_META: Record<string, { label: string; color: string; bg: string; text: string; Icon: LucideIcon }> = {
  critico: { label: "Crítico", color: "#dc2626", bg: "#fee2e2", text: "#991b1b", Icon: AlertTriangle },
  alerta:  { label: "Alerta",  color: "#d97706", bg: "#fef3c7", text: "#92400e", Icon: Zap },
  ok:      { label: "No prazo", color: "#059669", bg: "#d1fae5", text: "#065f46", Icon: Check },
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

export function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

export function hasExtDep(it: Item): boolean {
  return !!(it.extTeam && it.extMilestone);
}

// Aplica uma nova ordem (orderedIds) à lista, atribuindo sort_order em passos de
// 10 e reordenando o array para refletir a mudança imediatamente (atualização
// otimista). A ordem do array resultante espelha a do backend
// (`ORDER BY sort_order ASC, id ASC`), pois o Gantt renderiza na ordem do array.
export function applyReorder<T extends { id: number; sortOrder: number }>(
  items: T[],
  orderedIds: number[],
): { items: T[]; entries: { id: number; sortOrder: number }[] } {
  const entries = orderedIds.map((id, idx) => ({ id, sortOrder: (idx + 1) * 10 }));
  const map = new Map(entries.map(e => [e.id, e.sortOrder]));
  const next = items
    .map(i => (map.has(i.id) ? { ...i, sortOrder: map.get(i.id)! } : i))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  return { items: next, entries };
}
