import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { Item } from "./api";
import { buildTimeline } from "./roadmap-utils";
import Gantt from "./Gantt";

// jsdom não calcula `position: sticky` (não há layout nem rolagem real), então
// estes testes travam a *intenção* do layout descrito no ADR 017: existe um
// único elemento com rolagem e a régua de datas está presa no topo dele. O
// efeito visual em si é verificado por screenshot.
function item(over: Partial<Item> = {}): Item {
  return {
    id: 1, title: "Iniciativa A", status: "em-andamento",
    startDate: "2026-07-01", endDate: "2026-09-30", progress: 40,
    dependencyId: null, notes: "", extTeam: null, extDescription: null,
    extMilestone: null, sortOrder: 0, color: null, epicUrl: null,
    ...over,
  };
}

function renderGantt(items: Item[]) {
  return render(<Gantt items={items} timeline={buildTimeline(items)} />);
}

describe("Gantt — layout de rolagem (ADR 017)", () => {
  it("mantém a lista dentro de um único elemento com rolagem própria", () => {
    const { container } = renderGantt([item()]);
    const scrollers = container.querySelectorAll("[data-gantt-scroll]");
    expect(scrollers).toHaveLength(1);
    expect(scrollers[0]).toHaveClass("rm-gantt-scroll");
  });

  it("prende a régua de datas no topo da área que rola", () => {
    const { container } = renderGantt([item()]);
    const scroll = container.querySelector<HTMLElement>("[data-gantt-scroll]")!;
    const content = scroll.querySelector<HTMLElement>("[data-gantt-content]")!;
    // A régua é o primeiro bloco do conteúdo e carrega o sticky.
    const ruler = content.firstElementChild as HTMLElement;
    expect(ruler.style.position).toBe("sticky");
    expect(ruler.style.top).toBe("0px");
    // Trimestre e mês ficam juntos no mesmo wrapper — é o que dispensa medir a
    // altura de uma faixa para posicionar a outra.
    expect(ruler.textContent).toContain("Iniciativa");
    expect(ruler.children).toHaveLength(2);
  });

  it("expõe o conteúdo completo para a captura de PNG/PDF", () => {
    const { container } = renderGantt([item()]);
    // O export solta as amarras do card usando estes dois ganchos; sem eles a
    // foto sairia cortada no tamanho da janela visível.
    expect(container.querySelector("[data-gantt-scroll]")).not.toBeNull();
    expect(container.querySelector("[data-gantt-content]")).not.toBeNull();
  });

  it("mantém a régua abaixo do menu de ações no empilhamento (z-index < 50)", () => {
    const { container } = renderGantt([item()]);
    const scroll = container.querySelector<HTMLElement>("[data-gantt-scroll]")!;
    const content = scroll.querySelector<HTMLElement>("[data-gantt-content]")!;
    const ruler = content.firstElementChild as HTMLElement;
    expect(Number(ruler.style.zIndex)).toBeLessThan(50);
  });
});
