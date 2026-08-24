import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CornerDownRight, ExternalLink, GripVertical, Zap } from "lucide-react";
import type { Item } from "./api";
import {
  LABEL_W, STATUS_META, BAR_COLORS, RISK_META, calcRisk, fmtDate, hasExtDep,
  computeDragDates, shiftDatesByDays, durationInDays,
  type BarDragMode, type DateRange, type Timeline,
} from "./roadmap-utils";

type Props = {
  items: Item[];
  timeline: Timeline;
  onSelect?: (it: Item) => void;
  onReorder?: (status: string, orderedIds: number[]) => void;
  // Ajuste de datas por arrasto das alças da barra. Quando ausente, as barras
  // ficam apenas informativas (roadmap somente leitura).
  onDatesChange?: (item: Item, startDate: string, endDate: string) => void | Promise<void>;
  innerRef?: React.RefObject<HTMLDivElement | null>;
};

// Pré-visualização do arrasto em andamento: as datas ainda não foram salvas,
// mas a barra já é desenhada nelas.
type Draft = { itemId: number } & DateRange;

// Pixels de folga junto às bordas da área visível que disparam a rolagem
// automática, e quantos pixels ela anda por quadro.
const AUTOSCROLL_EDGE_PX = 56;
const AUTOSCROLL_STEP_PX = 16;
// Movimento mínimo do mouse para o gesto virar arrasto — abaixo disso ainda é
// um clique (que abre a iniciativa para edição).
const DRAG_THRESHOLD_PX = 3;
// Espera antes de salvar os ajustes feitos pelo teclado, para uma sequência de
// setas virar uma única gravação.
const KEYBOARD_COMMIT_DELAY_MS = 500;

function RiskBadge({ level }: { level: "critico" | "alerta" | "ok" }) {
  const m = RISK_META[level];
  const Icon = m.Icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
      background: m.bg, color: m.text, border: `1px solid ${m.color}44`,
    }}>
      <Icon size={10} aria-hidden /> {m.label}
    </span>
  );
}

function MilestoneDiamond({ frac, risk, label, colW }: { frac: number; risk: any; label: string; colW: number }) {
  const left = frac * colW;
  const color = risk === "critico" ? "#dc2626" : risk === "alerta" ? "#d97706" : "#059669";
  return (
    <div style={{
      position: "absolute", left: `${left}%`, top: "50%",
      transform: "translate(-50%, -50%)", zIndex: 10,
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{
        width: 14, height: 14, background: color, transform: "rotate(45deg)",
        borderRadius: 2, boxShadow: `0 0 0 2px white, 0 0 0 3px ${color}`,
      }}/>
      <div style={{
        marginTop: 6, fontSize: 8, fontWeight: 700, color, whiteSpace: "nowrap",
        background: "white", padding: "1px 4px", borderRadius: 3,
        border: `1px solid ${color}55`,
      }}>{label}</div>
    </div>
  );
}

type BarProps = {
  item: Item;
  timeline: Timeline;
  draft: DateRange | null;
  dragging: boolean;
  // Presente apenas quando o usuário pode editar E a iniciativa já tem as duas
  // datas — sem elas não há o que arrastar.
  drag?: {
    onPointerDown: (e: React.PointerEvent, item: Item, mode: BarDragMode) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerEnd: (e: React.PointerEvent) => void;
    onKeyDown: (e: React.KeyboardEvent, item: Item, mode: BarDragMode) => void;
  };
};

// Alça de redimensionamento nas pontas da barra. É um <button> de verdade: o
// ajuste também funciona pelo teclado (← →, com Shift para saltos de 7 dias).
function BarHandle({ item, mode, drag }: { item: Item; mode: "start" | "end"; drag: NonNullable<BarProps["drag"]> }) {
  const isStart = mode === "start";
  return (
    <button
      type="button"
      className="rm-bar-handle"
      data-bar-drag
      data-bar-handle={mode}
      aria-label={`${isStart ? "Data de início" : "Data de fim"} de ${item.title}`}
      title={`Arraste para ajustar a data de ${isStart ? "início" : "fim"} · setas ← → ajustam 1 dia (Shift: 7 dias)`}
      onPointerDown={(e) => drag.onPointerDown(e, item, mode)}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerEnd}
      onPointerCancel={drag.onPointerEnd}
      onKeyDown={(e) => drag.onKeyDown(e, item, mode)}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute", top: 0, height: "100%", width: 16, padding: 0,
        left: isStart ? -8 : undefined,
        right: isStart ? undefined : -8,
        border: "none", background: "transparent", cursor: "ew-resize",
        display: "flex", alignItems: "center", justifyContent: "center",
        touchAction: "none", zIndex: 12,
      }}
    >
      <span aria-hidden style={{
        width: 5, height: "62%", minHeight: 14, borderRadius: 3,
        background: "#fff", border: "1px solid rgba(15,23,42,0.5)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.35)",
      }}/>
    </button>
  );
}

function GanttBar({ item, timeline, draft, dragging, drag }: BarProps) {
  const COL_W = 100 / timeline.totalMonths;
  // Enquanto o arrasto acontece, a barra é desenhada nas datas provisórias.
  const startDate = draft?.startDate ?? item.startDate;
  const endDate = draft?.endDate ?? item.endDate;
  const risk = calcRisk({ ...item, startDate });
  const isCritico = risk === "critico";
  const isAlerta = risk === "alerta";
  const hasMs = hasExtDep(item);

  const startFrac = startDate ? timeline.dateToFractional(startDate)! : timeline.todayFrac;
  const endFrac = endDate ? timeline.endDateToFractional(endDate)! : startFrac + 1;
  const left = Math.max(0, startFrac) * COL_W;
  // No half-month floor: tiny items can be very thin (we rely on minWidth: 8px
  // for visibility). Forcing 0.5 month would make short tasks visually invade
  // the next item's date range.
  const width = Math.max(0, endFrac - Math.max(0, startFrac)) * COL_W;

  const baseColor = item.color || BAR_COLORS[item.status] || "#64748b";
  const barColor = isCritico ? "#dc2626" : isAlerta ? "#d97706" : baseColor;
  const msFrac = hasMs ? timeline.dateToFractional(item.extMilestone!) : null;

  return (
    <div style={{ position: "relative", height: 38 }}>
      {/* Envelope da barra: posiciona no tempo e hospeda as alças, que precisam
          transbordar alguns pixels para fora para continuarem pegáveis mesmo
          numa barra estreita. O visual fica na camada de dentro, essa sim com
          overflow escondido. */}
      <div
        className="rm-bar-wrap"
        data-bar-wrap
        data-dragging={dragging ? "true" : undefined}
        data-bar-drag={drag ? "" : undefined}
        onPointerDown={drag && ((e: React.PointerEvent) => drag.onPointerDown(e, item, "move"))}
        onPointerMove={drag?.onPointerMove}
        onPointerUp={drag?.onPointerEnd}
        onPointerCancel={drag?.onPointerEnd}
        title={drag ? "Arraste a barra para deslocar a iniciativa no tempo" : undefined}
        style={{
          position: "absolute", left: `${left}%`, width: `${width}%`,
          top: 0, height: "100%", minWidth: 8,
          cursor: drag ? (dragging ? "grabbing" : "grab") : undefined,
          touchAction: drag ? "none" : undefined,
        }}
      >
        <div style={{
          position: "absolute", inset: 0, background: barColor, borderRadius: 6,
          opacity: item.status === "nao-iniciado" ? 0.72 : 0.9,
          border: isCritico ? `2px dashed #991b1b` : isAlerta ? `2px dashed #92400e` : "none",
          boxShadow: dragging ? "0 0 0 2px #6366f1, 0 4px 12px rgba(15,23,42,0.25)" : undefined,
          overflow: "hidden",
        }}>
          {item.status === "em-andamento" && (
            <div style={{ position: "absolute", left: 0, top: 0,
              width: `${item.progress}%`, height: "100%",
              background: "rgba(255,255,255,0.22)", borderRadius: 4 }}/>
          )}
          {(isCritico || isAlerta) && (
            <div style={{ position: "absolute", right: 4, top: "50%",
              transform: "translateY(-50%)", display: "flex", color: "rgba(255,255,255,0.9)" }}>
              {isCritico ? <AlertTriangle size={12} aria-hidden /> : <Zap size={12} aria-hidden />}
            </div>
          )}
        </div>
        {drag && <BarHandle item={item} mode="start" drag={drag}/>}
        {drag && <BarHandle item={item} mode="end" drag={drag}/>}
      </div>
      {hasMs && msFrac !== null && (
        <MilestoneDiamond frac={msFrac} risk={risk} label={fmtDate(item.extMilestone)} colW={COL_W}/>
      )}
    </div>
  );
}

function ExtDepTag({ item }: { item: Item }) {
  if (!hasExtDep(item)) return null;
  const risk = calcRisk(item) || "alerta";
  const rm = RISK_META[risk];
  const Icon = rm.Icon;
  return (
    <div style={{
      marginTop: 4, padding: "4px 7px", borderRadius: 5,
      background: rm.bg, border: `1px solid ${rm.color}44`, fontSize: 9, lineHeight: 1.4,
    }}>
      <div style={{ fontWeight: 700, color: rm.text, display: "flex", alignItems: "center", gap: 3 }}>
        <Icon size={10} aria-hidden /> {item.extTeam}
      </div>
      {item.extDescription && (
        <div style={{ color: rm.text, opacity: 0.85, marginTop: 1 }}>
          {item.extDescription.length > 38 ? item.extDescription.slice(0, 38) + "…" : item.extDescription}
        </div>
      )}
      <div style={{ color: rm.color, fontWeight: 700, marginTop: 1 }}>
        Marco: {fmtDate(item.extMilestone)}
      </div>
    </div>
  );
}

export default function Gantt({ items, timeline, onSelect, onReorder, onDatesChange, innerRef }: Props) {
  const COL_PCT = 100 / timeline.totalMonths;
  const draggingId = useRef<number | null>(null);
  const draggingStatus = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  // --- Pan (arrastar a timeline com o mouse) ---
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pan = useRef<{ active: boolean; moved: boolean; startX: number; startScroll: number }>({
    active: false, moved: false, startX: 0, startScroll: 0,
  });
  const [grabbing, setGrabbing] = useState(false);

  // --- Ajuste de datas arrastando a barra / suas alças (ADR 018) ---
  // `draft` é o que a tela mostra; `bar` guarda de onde o gesto partiu. Manter
  // a origem fixa evita que erros de arredondamento se acumulem quadro a quadro.
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const bar = useRef<{
    itemId: number; mode: BarDragMode; pointerId: number;
    startX: number; startScroll: number; gridWidth: number;
    origin: DateRange; moved: boolean;
  } | null>(null);
  // Um arrasto termina em um clique; sem essa marca, soltar a barra abriria a
  // janela de edição da iniciativa.
  const barMoved = useRef(false);
  const autoScroll = useRef<{ raf: number | null; clientX: number; dir: number }>({ raf: null, clientX: 0, dir: 0 });
  const keyboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A gravação do teclado é adiada; quando ela acontece, a lista pode já ter
  // mudado. O ref garante que o commit sempre leia a versão atual.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  function setDraftValue(next: Draft | null) {
    draftRef.current = next;
    setDraft(next);
  }

  // Posiciona a rolagem inicial centralizando o "Hoje" (com clamp nas bordas).
  // Roda quando a timeline muda (ex.: itens carregados / filtro de período).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const innerWidth = el.scrollWidth;
    const gridWidth = innerWidth - LABEL_W;
    if (gridWidth <= 0) return;
    const todayX = LABEL_W + (timeline.todayFrac / timeline.totalMonths) * gridWidth;
    el.scrollLeft = Math.max(0, Math.min(todayX - el.clientWidth / 2, innerWidth - el.clientWidth));
  }, [timeline]);

  function stopAutoScroll() {
    if (autoScroll.current.raf !== null) cancelAnimationFrame(autoScroll.current.raf);
    autoScroll.current = { raf: null, clientX: 0, dir: 0 };
  }

  // Esc desiste do arrasto e devolve a barra às datas salvas. Também limpa
  // temporizadores pendentes quando o quadro sai da tela.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || !bar.current) return;
      bar.current = null;
      barMoved.current = true;
      stopAutoScroll();
      draftRef.current = null;
      setDraft(null);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stopAutoScroll();
      if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
    };
  }, []);

  function isInteractive(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el?.closest("a, button, input, [data-reorder-handle], [data-bar-drag]");
  }

  function onPointerDown(e: React.PointerEvent) {
    barMoved.current = false;
    if (e.button !== 0 || isInteractive(e.target)) return;
    const el = scrollRef.current;
    if (!el) return;
    pan.current = { active: true, moved: false, startX: e.clientX, startScroll: el.scrollLeft };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pan.current.active) return;
    const dx = e.clientX - pan.current.startX;
    if (!pan.current.moved && Math.abs(dx) < 5) return;
    if (!pan.current.moved) {
      pan.current.moved = true;
      setGrabbing(true);
      scrollRef.current?.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
    if (scrollRef.current) scrollRef.current.scrollLeft = pan.current.startScroll - dx;
  }

  function endPan(e: React.PointerEvent) {
    if (pan.current.active && scrollRef.current?.hasPointerCapture(e.pointerId)) {
      scrollRef.current.releasePointerCapture(e.pointerId);
    }
    pan.current.active = false;
    setGrabbing(false);
  }

  // Suprime o clique que segue um pan ou um arrasto de barra, para não
  // selecionar a iniciativa por engano.
  function onClickCapture(e: React.MouseEvent) {
    if (pan.current.moved || barMoved.current) {
      e.stopPropagation();
      e.preventDefault();
      pan.current.moved = false;
      barMoved.current = false;
    }
  }

  // --- Máquina do arrasto de datas -----------------------------------------

  // Traduz a posição do ponteiro nas datas provisórias. A rolagem entra na
  // conta para que a rolagem automática nas bordas mova a barra junto.
  function applyDrag(clientX: number) {
    const d = bar.current;
    if (!d) return;
    const scrollNow = scrollRef.current?.scrollLeft ?? 0;
    const dx = (clientX - d.startX) + (scrollNow - d.startScroll);
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const deltaMonths = (dx / d.gridWidth) * timeline.totalMonths;
    setDraftValue({ itemId: d.itemId, ...computeDragDates(d.mode, d.origin, deltaMonths, timeline) });
  }

  function tickAutoScroll() {
    const el = scrollRef.current;
    const st = autoScroll.current;
    if (!bar.current || !el || !st.dir) { st.raf = null; return; }
    el.scrollLeft += st.dir * AUTOSCROLL_STEP_PX;
    applyDrag(st.clientX);
    st.raf = requestAnimationFrame(tickAutoScroll);
  }

  // Perto das bordas da janela visível, a timeline rola sozinha — é o que
  // permite empurrar uma iniciativa para um trimestre fora da tela.
  function updateAutoScroll(clientX: number) {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const st = autoScroll.current;
    st.clientX = clientX;
    st.dir = clientX < rect.left + AUTOSCROLL_EDGE_PX ? -1
           : clientX > rect.right - AUTOSCROLL_EDGE_PX ? 1
           : 0;
    if (st.dir && st.raf === null) st.raf = requestAnimationFrame(tickAutoScroll);
  }

  function beginDrag(e: React.PointerEvent, item: Item, mode: BarDragMode) {
    barMoved.current = false;
    if (!onDatesChange || e.button !== 0 || !item.startDate || !item.endDate) return;
    const el = e.currentTarget as HTMLElement;
    const grid = el.closest("[data-gantt-grid]") as HTMLElement | null;
    const gridWidth = grid?.getBoundingClientRect().width ?? 0;
    if (gridWidth <= 0) return; // sem largura medida não há como converter pixels em datas
    e.stopPropagation();
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    el.focus?.({ preventScroll: true });
    if (keyboardTimer.current) { clearTimeout(keyboardTimer.current); keyboardTimer.current = null; }
    bar.current = {
      itemId: item.id, mode, pointerId: e.pointerId,
      startX: e.clientX, startScroll: scrollRef.current?.scrollLeft ?? 0, gridWidth,
      origin: { startDate: item.startDate, endDate: item.endDate },
      moved: false,
    };
    setDraftValue({ itemId: item.id, startDate: item.startDate, endDate: item.endDate });
  }

  function moveDrag(e: React.PointerEvent) {
    if (!bar.current) return;
    e.preventDefault();
    applyDrag(e.clientX);
    updateAutoScroll(e.clientX);
  }

  function endDrag(e: React.PointerEvent) {
    const d = bar.current;
    if (!d) return;
    bar.current = null;
    stopAutoScroll();
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(d.pointerId)) el.releasePointerCapture(d.pointerId);
    if (!d.moved) { setDraftValue(null); return; } // foi um clique, não um arrasto
    barMoved.current = true;
    commit(d.itemId);
  }

  // Envia as datas provisórias para quem sabe salvar. O `draft` só é descartado
  // quando a gravação termina — assim a barra não pisca de volta na posição
  // antiga enquanto a resposta não chega.
  function commit(itemId: number) {
    const d = draftRef.current;
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!d || !item || !onDatesChange) { setDraftValue(null); return; }
    if (d.startDate === item.startDate && d.endDate === item.endDate) { setDraftValue(null); return; }
    Promise.resolve(onDatesChange(item, d.startDate, d.endDate)).finally(() => {
      if (draftRef.current?.itemId === itemId && !bar.current) setDraftValue(null);
    });
  }

  // Setas ← → sobre a alça focada: mesma edição, sem mouse. As teclas se
  // acumulam no rascunho e uma única gravação sai no fim da sequência.
  function keyStep(e: React.KeyboardEvent, item: Item, mode: BarDragMode) {
    if (!onDatesChange || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    const current = draftRef.current?.itemId === item.id
      ? { startDate: draftRef.current.startDate, endDate: draftRef.current.endDate }
      : (item.startDate && item.endDate ? { startDate: item.startDate, endDate: item.endDate } : null);
    if (!current) return;
    e.preventDefault();
    e.stopPropagation();
    const days = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 7 : 1);
    setDraftValue({ itemId: item.id, ...shiftDatesByDays(mode, current, days) });
    if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
    keyboardTimer.current = setTimeout(() => {
      keyboardTimer.current = null;
      commit(item.id);
    }, KEYBOARD_COMMIT_DELAY_MS);
  }

  const dragHandlers = onDatesChange ? {
    onPointerDown: beginDrag,
    onPointerMove: moveDrag,
    onPointerEnd: endDrag,
    onKeyDown: keyStep,
  } : undefined;

  const grouped: Record<string, Item[]> = {
    "em-andamento": items.filter(i => i.status === "em-andamento"),
    "nao-iniciado": items.filter(i => i.status === "nao-iniciado"),
    "concluido": items.filter(i => i.status === "concluido"),
    "pausado": items.filter(i => i.status === "pausado"),
  };

  function handleDrop(targetItem: Item) {
    const fromId = draggingId.current;
    const fromStatus = draggingStatus.current;
    draggingId.current = null;
    draggingStatus.current = null;
    setDragOverId(null);
    if (!onReorder || fromId == null || fromStatus == null) return;
    if (fromStatus !== targetItem.status) return; // only reorder within same status group
    if (fromId === targetItem.id) return;
    const group = grouped[targetItem.status].slice();
    const fromIdx = group.findIndex(i => i.id === fromId);
    const toIdx = group.findIndex(i => i.id === targetItem.id);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = group.splice(fromIdx, 1);
    group.splice(toIdx, 0, moved);
    onReorder(targetItem.status, group.map(i => i.id));
  }

  const { months, quarters, totalMonths, todayFrac, todayInRange, todayLabel } = timeline;
  // Largura mínima de cada coluna de mês. Períodos curtos preenchem a largura
  // disponível (flex); períodos longos ultrapassam a tela e viram arrastáveis.
  const COL_MIN_PX = 110;
  const innerMinWidth = LABEL_W + totalMonths * COL_MIN_PX;

  const draftItem = draft ? items.find(i => i.id === draft.itemId) : null;

  return (
    <div
      ref={innerRef}
      className="rm-gantt-card"
      style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0", position: "relative" }}
    >
      {/* Leitura das datas durante o arrasto. Fica sobre o quadro, e não colada
          na barra, para nunca ser cortada pela régua nem pela borda do card. */}
      {draft && draftItem && (
        <div
          data-drag-readout
          style={{
            position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
            zIndex: 80, pointerEvents: "none",
            background: "#0f172a", color: "#fff", fontSize: 11, fontWeight: 600,
            padding: "6px 12px", borderRadius: 8, whiteSpace: "nowrap",
            boxShadow: "0 6px 20px rgba(15,23,42,0.35)",
          }}
        >
          {draftItem.title} · {fmtDate(draft.startDate)} <span style={{ opacity: 0.6 }}>→</span> {fmtDate(draft.endDate)}
          <span style={{ opacity: 0.6, marginLeft: 6 }}>
            {durationInDays(draft.startDate, draft.endDate)} dias
          </span>
        </div>
      )}

      {/* Único elemento que rola na tela do roadmap: a lista de iniciativas se
          move aqui dentro enquanto a régua de datas fica presa no topo
          (`position: sticky`). A altura vem do flex do shell — ver ADR 017. */}
      <div
        ref={scrollRef}
        className="rm-gantt-scroll"
        data-gantt-scroll
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onClickCapture={onClickCapture}
        style={{
          overflowX: "auto",
          cursor: grabbing ? "grabbing" : "grab",
          touchAction: "pan-y",
          userSelect: grabbing || draft ? "none" : "auto",
        }}
      >
        <div data-gantt-content style={{ minWidth: innerMinWidth }}>
          {/* Régua de datas — trimestres e meses num wrapper sticky único,
              para não depender da altura medida de cada faixa. */}
          <div style={{ position: "sticky", top: 0, zIndex: 30 }}>
            {/* Quarter header */}
            <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
              <div style={{ width: LABEL_W, minWidth: LABEL_W, padding: "10px 16px", borderRight: "1px solid #e2e8f0", position: "sticky", left: 0, zIndex: 20, background: "#fff" }}>
                <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Iniciativa</span>
              </div>
              <div style={{ flex: 1, display: "flex" }}>
                {quarters.map((q, qi) => (
                  <div key={q.label} style={{
                    width: `${q.span * COL_PCT}%`, padding: "10px 0",
                    textAlign: "center", fontSize: 11, fontWeight: 700, color: "#0f172a",
                    borderRight: "1px solid #e2e8f0",
                    background: qi % 2 === 1 ? "#f1f5f9" : "#fff",
                  }}>{q.label}</div>
                ))}
              </div>
            </div>

            {/* Month header */}
            <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <div style={{ width: LABEL_W, minWidth: LABEL_W, borderRight: "1px solid #e2e8f0", position: "sticky", left: 0, zIndex: 20, background: "#f8fafc" }}/>
              <div style={{ flex: 1, display: "flex" }}>
                {months.map((m, i) => (
                  <div key={i} style={{
                    width: `${COL_PCT}%`, padding: "6px 0",
                    textAlign: "center", fontSize: 10, color: "#94a3b8",
                    borderRight: "1px solid #e2e8f0",
                  }}>{m}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Rows */}
          {/* O React Compiler não consegue provar que `dragHandlers` (funções
              que mexem nos refs do arrasto) só será chamado em resposta a
              eventos, e não durante a renderização — de onde ele vê uma
              "leitura de ref no render". As funções são passadas adiante e
              acabam ligadas direto nos atributos de ponteiro e teclado do DOM,
              exatamente como os handlers do pan logo acima. */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {Object.entries(grouped).map(([status, group]) => {
            if (!group.length) return null;
            const meta = STATUS_META[status];
            return (
              <div key={status}>
                <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f1f5f9" }}>
                  <div style={{
                    width: LABEL_W, minWidth: LABEL_W, padding: "6px 16px",
                    borderRight: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 6,
                    position: "sticky", left: 0, zIndex: 20, background: "#f1f5f9",
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }}/>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {meta.label}
                    </span>
                  </div>
                  <div style={{ flex: 1, position: "relative" }}>
                    {todayInRange && (
                      <div style={{ position: "absolute", left: `${todayFrac * COL_PCT}%`, top: 0, bottom: 0, width: 1.5, background: "#ef4444", opacity: 0.4 }}/>
                    )}
                  </div>
                </div>

                {group.map(item => {
                  const dep = item.dependencyId ? items.find(i => i.id === item.dependencyId) : null;
                  const risk = calcRisk(item);
                  const isDragOver = dragOverId === item.id;
                  const itemDraft = draft?.itemId === item.id ? draft : null;
                  const isBarDragging = itemDraft !== null;
                  const rowBg = isDragOver ? "#eef2ff" : isBarDragging ? "#f5f3ff" : risk === "critico" ? "#fff7f7" : "#fff";
                  // Só há o que arrastar quando o roadmap é editável e a
                  // iniciativa já tem as duas datas cadastradas.
                  const barDrag = dragHandlers && item.startDate && item.endDate ? dragHandlers : undefined;
                  return (
                    <div key={item.id}
                      onDragOver={(e) => {
                        if (!onReorder) return;
                        if (draggingStatus.current !== item.status) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverId !== item.id) setDragOverId(item.id);
                      }}
                      onDragLeave={() => { if (dragOverId === item.id) setDragOverId(null); }}
                      onDrop={(e) => { e.preventDefault(); handleDrop(item); }}
                      style={{
                        display: "flex", borderBottom: "1px solid #f1f5f9",
                        background: rowBg,
                        borderTop: isDragOver ? "2px solid #6366f1" : undefined,
                        cursor: onSelect ? "pointer" : "default",
                      }}
                      onClick={() => onSelect && onSelect(item)}
                    >
                      <div
                        {...(onReorder ? { draggable: true, "data-reorder-handle": "" } : {})}
                        onDragStart={onReorder ? (e) => {
                          draggingId.current = item.id;
                          draggingStatus.current = item.status;
                          e.dataTransfer.effectAllowed = "move";
                        } : undefined}
                        onDragEnd={onReorder ? () => { draggingId.current = null; draggingStatus.current = null; setDragOverId(null); } : undefined}
                        title={onReorder ? "Arraste o título para reordenar" : undefined}
                        style={{
                        width: LABEL_W, minWidth: LABEL_W,
                        padding: "10px 14px", borderRight: "1px solid #e2e8f0",
                        borderLeft: risk === "critico" ? "3px solid #dc2626"
                                  : risk === "alerta" ? "3px solid #d97706"
                                  : "3px solid transparent",
                        display: "flex", gap: 6, alignItems: "flex-start",
                        position: "sticky", left: 0, zIndex: 20, background: rowBg,
                        cursor: onReorder ? "grab" : undefined,
                      }}>
                        {onReorder && (
                          <span
                            aria-hidden
                            style={{ color: "#cbd5e1", marginTop: 1, flexShrink: 0, display: "inline-flex" }}
                          ><GripVertical size={14} /></span>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", lineHeight: 1.3, flex: 1 }}>{item.title}</div>
                          {item.epicUrl && (
                            <a
                              href={item.epicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              draggable={false}
                              onMouseDown={(e) => e.stopPropagation()}
                              title="Abrir épico em nova aba"
                              style={{
                                lineHeight: 1, padding: "3px 5px",
                                borderRadius: 4, border: "1px solid #cbd5e1",
                                background: "#f8fafc", color: "#0f172a",
                                textDecoration: "none", cursor: "pointer",
                                display: "inline-flex", alignItems: "center", gap: 2,
                              }}
                            ><ExternalLink size={12} aria-hidden /></a>
                          )}
                          {risk && <RiskBadge level={risk}/>}
                        </div>
                        {dep && (
                          <div style={{ fontSize: 10, color: "#d97706", marginTop: 3, display: "flex", alignItems: "center", gap: 3 }}>
                            <CornerDownRight size={11} aria-hidden />
                            <span>{dep.title.length > 22 ? dep.title.slice(0, 22) + "…" : dep.title}</span>
                          </div>
                        )}
                        {item.status === "em-andamento" ? (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ height: 3, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ width: `${item.progress}%`, height: "100%", background: meta.color, borderRadius: 4 }}/>
                            </div>
                            <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 1 }}>
                              {item.progress}% · até {fmtDate(itemDraft?.endDate ?? item.endDate)}
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3, display: "flex", alignItems: "center", gap: 3 }}>
                            {fmtDate(itemDraft?.startDate ?? item.startDate)} <ArrowRight size={10} aria-hidden /> {fmtDate(itemDraft?.endDate ?? item.endDate)}
                          </div>
                        )}
                        <ExtDepTag item={item}/>
                        </div>
                      </div>

                      <div data-gantt-grid style={{ flex: 1, position: "relative", padding: "8px 0", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        {months.map((_, i) => (
                          <div key={i} style={{ position: "absolute", left: `${i * COL_PCT}%`, top: 0, bottom: 0, width: 1, background: "#f1f5f9" }}/>
                        ))}
                        {todayInRange && (
                          <div style={{ position: "absolute", left: `${todayFrac * COL_PCT}%`, top: 0, bottom: 0, width: 1.5, background: "#ef4444", opacity: 0.3, zIndex: 2 }}/>
                        )}
                        <GanttBar
                          item={item}
                          timeline={timeline}
                          draft={itemDraft}
                          dragging={isBarDragging}
                          drag={barDrag}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Today footer — altura própria para o badge não ser cortado pelo
              overflow:hidden do card */}
          <div style={{
            display: "flex", borderTop: "1px solid #e2e8f0", background: "#fff",
            padding: "8px 0 16px", position: "sticky", bottom: 0, zIndex: 30,
          }}>
            <div style={{ width: LABEL_W, minWidth: LABEL_W, borderRight: "1px solid #e2e8f0", position: "sticky", left: 0, zIndex: 20, background: "#fff" }}/>
            <div style={{ flex: 1, position: "relative", height: 22 }}>
              {todayInRange && (
                <div style={{
                  position: "absolute", top: 0, left: `${todayFrac * COL_PCT}%`, transform: "translateX(-50%)",
                  background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700,
                  padding: "3px 7px", borderRadius: 4, whiteSpace: "nowrap",
                }}>Hoje · {todayLabel}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
