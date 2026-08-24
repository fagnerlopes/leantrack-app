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
  // Conversores inversos — usados pelo arrasto das alças, que traduz pixels
  // percorridos pelo mouse em posição fracionária e daí de volta para uma data.
  fractionalToStartDate: (frac: number) => string;
  fractionalToEndDate: (frac: number) => string;
};

type DatedItem = Pick<Item, "startDate" | "endDate" | "extMilestone">;

// --- Aritmética de datas em dias -------------------------------------------
// Toda a conta é feita em UTC: usar horário local faria um dia "encolher" ou
// "esticar" em fusos com horário de verão, e o arrasto erraria por um dia.

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function utcMillis(dateStr: string): number {
  const { y, m, d } = parseYM(dateStr);
  return Date.UTC(y, m - 1, d);
}

function isoFromUTC(millis: number): string {
  const dt = new Date(millis);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

// Soma (ou subtrai) dias a uma data ISO, atravessando meses e anos.
export function addDays(dateStr: string, days: number): string {
  return isoFromUTC(utcMillis(dateStr) + days * 86400000);
}

// Dias entre duas datas ISO (b - a). Mesma data = 0.
export function daysBetween(a: string, b: string): number {
  return Math.round((utcMillis(b) - utcMillis(a)) / 86400000);
}

// Duração inclusiva de uma iniciativa: de 1º a 1º de julho = 1 dia.
export function durationInDays(startDate: string, endDate: string): number {
  return daysBetween(startDate, endDate) + 1;
}

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

  // Inverso de dateToFractional: a parte inteira aponta a coluna do mês e a
  // fracionária, o dia dentro dele. Date.UTC normaliza sozinho o estouro de
  // dia (ex.: 32 de julho vira 1º de agosto), então não há caso de borda.
  const fractionalToStartDate = (frac: number): string => {
    const monthIdx = Math.floor(frac);
    const rest = frac - monthIdx;
    const { year, month } = fromAbsMonth(baseAbsMonth + monthIdx);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return isoFromUTC(Date.UTC(year, month - 1, 1 + Math.round(rest * daysInMonth)));
  };

  // Inverso de endDateToFractional (que mede o FIM do dia). Dia 0 é normalizado
  // para o último dia do mês anterior.
  const fractionalToEndDate = (frac: number): string => {
    const monthIdx = Math.floor(frac);
    const rest = frac - monthIdx;
    const { year, month } = fromAbsMonth(baseAbsMonth + monthIdx);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return isoFromUTC(Date.UTC(year, month - 1, Math.round(rest * daysInMonth)));
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
    fractionalToStartDate,
    fractionalToEndDate,
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

// --- Arrasto das alças da barra (ajuste de datas) ---------------------------
// Toda a decisão de "que datas essas coordenadas representam" mora aqui, em
// funções puras: o componente cuida só de mouse/toque e de desenhar. Ver ADR 018.

export type BarDragMode =
  | "move"   // arrastar o corpo da barra: desloca início e fim juntos
  | "start"  // alça esquerda: muda só a data de início
  | "end";   // alça direita: muda só a data de fim

export type DateRange = { startDate: string; endDate: string };

// Converte um deslocamento horizontal (já em "meses fracionários") nas novas
// datas da iniciativa. `base` são as datas de onde o arrasto partiu — nunca as
// datas do quadro a cada frame, para o arrasto não acumular erro.
//
// Regras: o arrasto do corpo preserva a duração exata em dias; as alças nunca
// cruzam uma a outra (duração mínima de 1 dia); e nada escapa do intervalo da
// timeline desenhada.
export function computeDragDates(
  mode: BarDragMode,
  base: DateRange,
  deltaMonths: number,
  timeline: Timeline,
): DateRange {
  const clamp = (frac: number) => Math.min(Math.max(frac, 0), timeline.totalMonths);

  if (mode === "move") {
    const span = daysBetween(base.startDate, base.endDate);
    const startFrac = timeline.dateToFractional(base.startDate)!;
    const startDate = timeline.fractionalToStartDate(clamp(startFrac + deltaMonths));
    return { startDate, endDate: addDays(startDate, span) };
  }

  if (mode === "start") {
    const startFrac = timeline.dateToFractional(base.startDate)!;
    const startDate = timeline.fractionalToStartDate(clamp(startFrac + deltaMonths));
    return {
      startDate: daysBetween(startDate, base.endDate) < 0 ? base.endDate : startDate,
      endDate: base.endDate,
    };
  }

  const endFrac = timeline.endDateToFractional(base.endDate)!;
  const endDate = timeline.fractionalToEndDate(clamp(endFrac + deltaMonths));
  return {
    startDate: base.startDate,
    endDate: daysBetween(base.startDate, endDate) < 0 ? base.startDate : endDate,
  };
}

// Versão em dias inteiros do mesmo ajuste, usada pelo teclado (← → sobre a
// alça focada). Mesmas regras de não-cruzamento.
export function shiftDatesByDays(mode: BarDragMode, base: DateRange, days: number): DateRange {
  if (mode === "move") {
    return { startDate: addDays(base.startDate, days), endDate: addDays(base.endDate, days) };
  }
  if (mode === "start") {
    const startDate = addDays(base.startDate, days);
    return {
      startDate: daysBetween(startDate, base.endDate) < 0 ? base.endDate : startDate,
      endDate: base.endDate,
    };
  }
  const endDate = addDays(base.endDate, days);
  return {
    startDate: base.startDate,
    endDate: daysBetween(base.startDate, endDate) < 0 ? base.startDate : endDate,
  };
}
