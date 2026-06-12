import { describe, it, expect } from "vitest";
import { fractionalForDate, labelForDate, TOTAL_MONTHS } from "./roadmap-utils";

describe("fractionalForDate", () => {
  it("posiciona o início da timeline (1º de maio/2026) em 0", () => {
    expect(fractionalForDate(new Date(2026, 4, 1))).toBeCloseTo(0, 5);
  });

  it("posiciona 25/mai/2026 em ~0,774 (valor antigo, agora calculado)", () => {
    // (25 - 1) / 31 = 0.7741…
    expect(fractionalForDate(new Date(2026, 4, 25))).toBeCloseTo((25 - 1) / 31, 5);
  });

  it("avança um mês inteiro: 1º de junho/2026 = 1", () => {
    expect(fractionalForDate(new Date(2026, 5, 1))).toBeCloseTo(1, 5);
  });

  it("12/jun/2026 cai dentro da janela visível da timeline", () => {
    const f = fractionalForDate(new Date(2026, 5, 12));
    expect(f).toBeGreaterThan(1);
    expect(f).toBeLessThan(TOTAL_MONTHS);
  });
});

describe("labelForDate", () => {
  it("formata como 'dia Mês ano' em português abreviado", () => {
    expect(labelForDate(new Date(2026, 5, 12))).toBe("12 Jun 2026");
    expect(labelForDate(new Date(2026, 4, 25))).toBe("25 Mai 2026");
    expect(labelForDate(new Date(2027, 0, 3))).toBe("3 Jan 2027");
  });
});
