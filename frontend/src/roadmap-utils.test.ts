import { describe, it, expect } from "vitest";
import { buildTimeline, labelForDate, applyReorder } from "./roadmap-utils";

type DI = { startDate: string | null; endDate: string | null; extMilestone: string | null };
const item = (startDate: string | null, endDate: string | null = null, extMilestone: string | null = null): DI =>
  ({ startDate, endDate, extMilestone });

describe("buildTimeline — intervalo dinâmico", () => {
  it("arredonda para trimestres cheios com 1 mês de folga em cada ponta", () => {
    // Iniciativas de fev/2026 a ago/2026.
    // min=fev -> -1 mês = jan -> início do trimestre = jan/2026 (coluna 0)
    // max=ago -> +1 mês = set -> fim do trimestre = set/2026
    const tl = buildTimeline([item("2026-02-10", "2026-08-20")]);
    expect(tl.months[0]).toBe("Jan'26");
    expect(tl.totalMonths).toBe(9); // jan..set = 9 meses (3 trimestres)
    expect(tl.totalMonths % 3).toBe(0);
    expect(tl.quarters.map(q => q.label)).toEqual(["Q1 2026", "Q2 2026", "Q3 2026"]);
  });

  it("os trimestres cobrem exatamente o total de meses", () => {
    const tl = buildTimeline([item("2026-02-10", "2027-03-15")]);
    const cover = tl.quarters.reduce((s, q) => s + q.span, 0);
    expect(cover).toBe(tl.totalMonths);
    expect(tl.quarters[0].start).toBe(0);
  });

  it("CASO DO BUG: iniciativa anterior a maio/2026 fica com fração >= 0 e visível", () => {
    // Antes, a base era fixa em maio/2026 e datas anteriores viravam fração negativa.
    const tl = buildTimeline([item("2026-01-15", "2026-03-10")]);
    const startFrac = tl.dateToFractional("2026-01-15")!;
    expect(startFrac).toBeGreaterThanOrEqual(0);
    // A base deve ser anterior a maio/2026 (out/2025, pelo arredondamento de trimestre).
    expect(tl.months[0]).toBe("Out'25");
  });

  it("dateToFractional é relativo à base: 1º dia da coluna 0 = 0, mês seguinte = 1", () => {
    const tl = buildTimeline([item("2026-02-10", "2026-08-20")]); // base = jan/2026
    expect(tl.dateToFractional("2026-01-01")).toBeCloseTo(0, 5);
    expect(tl.dateToFractional("2026-02-01")).toBeCloseTo(1, 5);
    expect(tl.dateToFractional("2026-01-25")).toBeCloseTo((25 - 1) / 31, 5);
  });

  it("endDateToFractional estende a barra até o fim do dia (d/daysInMonth)", () => {
    const tl = buildTimeline([item("2026-02-10", "2026-08-20")]); // base = jan/2026
    expect(tl.endDateToFractional("2026-01-31")).toBeCloseTo(1, 5); // fim de jan = início de fev
  });

  it("inclui marcos externos (extMilestone) no cálculo do intervalo", () => {
    const tl = buildTimeline([item("2026-06-01", "2026-06-30", "2026-11-15")]);
    const msFrac = tl.dateToFractional("2026-11-15")!;
    expect(msFrac).toBeGreaterThanOrEqual(0);
    expect(msFrac).toBeLessThanOrEqual(tl.totalMonths);
  });

  it("sem nenhuma data, gera um intervalo padrão válido em torno de hoje", () => {
    const tl = buildTimeline([]);
    expect(tl.totalMonths).toBeGreaterThan(0);
    expect(tl.totalMonths % 3).toBe(0);
    expect(tl.months.length).toBe(tl.totalMonths);
    expect(tl.quarters.reduce((s, q) => s + q.span, 0)).toBe(tl.totalMonths);
    expect(tl.todayInRange).toBe(true);
  });

  it("mostra o ano nos rótulos de janeiro ao cruzar o ano", () => {
    const tl = buildTimeline([item("2026-11-01", "2027-02-28")]);
    expect(tl.months).toContain("Jan'27");
  });
});

describe("applyReorder", () => {
  const mk = (id: number, sortOrder: number) => ({ id, sortOrder });

  it("reordena o array (não só os valores de sortOrder)", () => {
    const items = [mk(1, 10), mk(2, 20), mk(3, 30)];
    // Move o id 3 para o início.
    const { items: out } = applyReorder(items, [3, 1, 2]);
    expect(out.map(i => i.id)).toEqual([3, 1, 2]);
    expect(out.map(i => i.sortOrder)).toEqual([10, 20, 30]);
  });

  it("devolve as entries com sort_order em passos de 10", () => {
    const { entries } = applyReorder([mk(5, 10), mk(6, 20)], [6, 5]);
    expect(entries).toEqual([{ id: 6, sortOrder: 10 }, { id: 5, sortOrder: 20 }]);
  });

  it("preserva a ordem relativa correta dentro de um grupo mesmo com itens de fora", () => {
    // Itens de outro status (ids 10,11) não estão em orderedIds e mantêm seu sortOrder.
    const items = [mk(1, 10), mk(2, 20), mk(10, 15), mk(11, 25)];
    const { items: out } = applyReorder(items, [2, 1]); // inverte 1 e 2
    // Após inverter: id 2 -> 10, id 1 -> 20. Ordem por sortOrder asc.
    const pos = (id: number) => out.findIndex(i => i.id === id);
    expect(pos(2)).toBeLessThan(pos(1)); // 2 antes de 1 dentro do grupo
  });
});

describe("labelForDate", () => {
  it("formata como 'dia Mês ano' em português abreviado", () => {
    expect(labelForDate(new Date(2026, 5, 12))).toBe("12 Jun 2026");
    expect(labelForDate(new Date(2026, 4, 25))).toBe("25 Mai 2026");
    expect(labelForDate(new Date(2027, 0, 3))).toBe("3 Jan 2027");
  });
});
