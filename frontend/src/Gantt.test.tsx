import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

// --- Ajuste de datas arrastando as alças da barra (ADR 018) -----------------
// O arrasto com o mouse depende de geometria real (largura da grade em pixels),
// que o jsdom não calcula — essa parte é verificada por screenshot. Aqui ficam
// as regras que não dependem de layout: quando as alças existem, o que elas
// salvam e o caminho equivalente pelo teclado.

function renderEditable(items: Item[], onDatesChange: (it: Item, s: string, e: string) => void) {
  return render(
    <Gantt items={items} timeline={buildTimeline(items)} onDatesChange={onDatesChange} />,
  );
}

describe("Gantt — alças de ajuste de datas (ADR 018)", () => {
  it("oferece uma alça em cada ponta da barra quando o roadmap é editável", () => {
    const { container } = renderEditable([item()], vi.fn());
    expect(container.querySelectorAll('[data-bar-handle="start"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-bar-handle="end"]')).toHaveLength(1);
  });

  it("nomeia as alças pela iniciativa, para leitores de tela", () => {
    renderEditable([item({ title: "Migração do banco" })], vi.fn());
    expect(screen.getByLabelText("Data de início de Migração do banco")).toBeInTheDocument();
    expect(screen.getByLabelText("Data de fim de Migração do banco")).toBeInTheDocument();
  });

  it("não mostra alças em roadmap somente leitura", () => {
    const { container } = renderGantt([item()]);
    expect(container.querySelectorAll("[data-bar-handle]")).toHaveLength(0);
  });

  it("não mostra alças em iniciativa sem as duas datas — não há o que arrastar", () => {
    const { container } = renderEditable([item({ startDate: null, endDate: null })], vi.fn());
    expect(container.querySelectorAll("[data-bar-handle]")).toHaveLength(0);
  });

  it("marca alças e barra para o arrasto da timeline não roubar o gesto", () => {
    const { container } = renderEditable([item()], vi.fn());
    // O pan da timeline ignora o que estiver marcado com data-bar-drag.
    expect(container.querySelectorAll("[data-bar-drag]").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector("[data-bar-wrap]")).toHaveAttribute("data-bar-drag");
  });

  it("expõe a área da grade usada para converter pixels em datas", () => {
    const { container } = renderEditable([item()], vi.fn());
    expect(container.querySelector("[data-gantt-grid]")).not.toBeNull();
  });
});

describe("Gantt — ajuste de datas pelo teclado", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function flush(ms = 600) {
    await act(async () => { vi.advanceTimersByTime(ms); });
  }

  it("seta para a direita na alça de fim adia o fim em um dia", async () => {
    const onDatesChange = vi.fn();
    renderEditable([item({ startDate: "2026-07-01", endDate: "2026-09-30" })], onDatesChange);
    fireEvent.keyDown(screen.getByLabelText(/Data de fim/), { key: "ArrowRight" });
    await flush();
    expect(onDatesChange).toHaveBeenCalledTimes(1);
    expect(onDatesChange.mock.calls[0].slice(1)).toEqual(["2026-07-01", "2026-10-01"]);
  });

  it("Shift + seta anda de semana em semana no início", async () => {
    const onDatesChange = vi.fn();
    renderEditable([item({ startDate: "2026-07-08", endDate: "2026-09-30" })], onDatesChange);
    fireEvent.keyDown(screen.getByLabelText(/Data de início/), { key: "ArrowLeft", shiftKey: true });
    await flush();
    expect(onDatesChange.mock.calls[0].slice(1)).toEqual(["2026-07-01", "2026-09-30"]);
  });

  it("uma sequência de setas vira uma única gravação", async () => {
    const onDatesChange = vi.fn();
    renderEditable([item({ startDate: "2026-07-01", endDate: "2026-09-30" })], onDatesChange);
    const handle = screen.getByLabelText(/Data de fim/);
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(handle, { key: "ArrowRight" });
      await act(async () => { vi.advanceTimersByTime(50); });
    }
    await flush();
    expect(onDatesChange).toHaveBeenCalledTimes(1);
    expect(onDatesChange.mock.calls[0].slice(1)).toEqual(["2026-07-01", "2026-10-03"]);
  });

  it("mostra a leitura das datas provisórias enquanto o ajuste acontece", async () => {
    const onDatesChange = vi.fn();
    const { container } = renderEditable(
      [item({ title: "API v2", startDate: "2026-07-01", endDate: "2026-09-30" })],
      onDatesChange,
    );
    fireEvent.keyDown(screen.getByLabelText(/Data de fim/), { key: "ArrowRight" });
    const readout = container.querySelector("[data-drag-readout]");
    expect(readout?.textContent).toContain("API v2");
    expect(readout?.textContent).toContain("out"); // fim já adiado para outubro, antes de salvar
    expect(readout?.textContent).toContain("93 dias");
    await flush();
  });

  it("teclas que não são setas horizontais não mexem nas datas", async () => {
    const onDatesChange = vi.fn();
    renderEditable([item()], onDatesChange);
    fireEvent.keyDown(screen.getByLabelText(/Data de fim/), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByLabelText(/Data de fim/), { key: "Enter" });
    await flush();
    expect(onDatesChange).not.toHaveBeenCalled();
  });

  it("não deixa a leitura pendurada na tela depois de salvar", async () => {
    const onDatesChange = vi.fn();
    const { container } = renderEditable(
      [item({ startDate: "2026-07-01", endDate: "2026-09-30" })],
      onDatesChange,
    );
    fireEvent.keyDown(screen.getByLabelText(/Data de fim/), { key: "ArrowRight" });
    expect(container.querySelector("[data-drag-readout]")).not.toBeNull();
    await flush();
    expect(container.querySelector("[data-drag-readout]")).toBeNull();
  });
});
