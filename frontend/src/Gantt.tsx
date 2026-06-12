import { useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CornerDownRight, ExternalLink, GripVertical, Zap } from "lucide-react";
import type { Item } from "./api";
import {
  LABEL_W, STATUS_META, BAR_COLORS, RISK_META, calcRisk, fmtDate, hasExtDep,
  type Timeline,
} from "./roadmap-utils";

type Props = {
  items: Item[];
  timeline: Timeline;
  onSelect?: (it: Item) => void;
  onReorder?: (status: string, orderedIds: number[]) => void;
  innerRef?: React.RefObject<HTMLDivElement | null>;
};

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

function GanttBar({ item, timeline }: { item: Item; timeline: Timeline }) {
  const COL_W = 100 / timeline.totalMonths;
  const risk = calcRisk(item);
  const isCritico = risk === "critico";
  const isAlerta = risk === "alerta";
  const hasMs = hasExtDep(item);

  const startFrac = item.startDate ? timeline.dateToFractional(item.startDate)! : timeline.todayFrac;
  const endFrac = item.endDate ? timeline.endDateToFractional(item.endDate)! : startFrac + 1;
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
      <div style={{
        position: "absolute", left: `${left}%`, width: `${width}%`,
        top: 0, height: "100%", background: barColor, borderRadius: 6,
        opacity: item.status === "nao-iniciado" ? 0.72 : 0.9,
        border: isCritico ? `2px dashed #991b1b` : isAlerta ? `2px dashed #92400e` : "none",
        overflow: "hidden", minWidth: 8,
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

export default function Gantt({ items, timeline, onSelect, onReorder, innerRef }: Props) {
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

  function isInteractive(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el?.closest("a, button, input, [data-reorder-handle]");
  }

  function onPointerDown(e: React.PointerEvent) {
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

  // Suprime o clique que segue um pan, para não selecionar a iniciativa por engano.
  function onClickCapture(e: React.MouseEvent) {
    if (pan.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      pan.current.moved = false;
    }
  }

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
  // Cada coluna de mês tem ~64px; garante que a timeline seja larga o bastante
  // para rolar/arrastar mesmo com muitos meses.
  const innerMinWidth = LABEL_W + totalMonths * 64;

  return (
    <div ref={innerRef} style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" }}>
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onClickCapture={onClickCapture}
        style={{
          overflowX: "auto",
          cursor: grabbing ? "grabbing" : "grab",
          touchAction: "pan-y",
          userSelect: grabbing ? "none" : "auto",
        }}
      >
        <div style={{ minWidth: innerMinWidth }}>
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

          {/* Rows */}
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
                  const rowBg = isDragOver ? "#eef2ff" : risk === "critico" ? "#fff7f7" : "#fff";
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
                      <div style={{
                        width: LABEL_W, minWidth: LABEL_W,
                        padding: "10px 14px", borderRight: "1px solid #e2e8f0",
                        borderLeft: risk === "critico" ? "3px solid #dc2626"
                                  : risk === "alerta" ? "3px solid #d97706"
                                  : "3px solid transparent",
                        display: "flex", gap: 6, alignItems: "flex-start",
                        position: "sticky", left: 0, zIndex: 20, background: rowBg,
                      }}>
                        {onReorder && (
                          <span
                            data-reorder-handle
                            draggable
                            onDragStart={(e) => {
                              draggingId.current = item.id;
                              draggingStatus.current = item.status;
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => { draggingId.current = null; draggingStatus.current = null; setDragOverId(null); }}
                            onClick={(e) => e.stopPropagation()}
                            title="Arraste para reordenar"
                            style={{ cursor: "grab", color: "#cbd5e1", marginTop: 1, flexShrink: 0, display: "inline-flex" }}
                          ><GripVertical size={14} aria-hidden /></span>
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
                              {item.progress}% · até {fmtDate(item.endDate)}
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3, display: "flex", alignItems: "center", gap: 3 }}>
                            {fmtDate(item.startDate)} <ArrowRight size={10} aria-hidden /> {fmtDate(item.endDate)}
                          </div>
                        )}
                        <ExtDepTag item={item}/>
                        </div>
                      </div>

                      <div style={{ flex: 1, position: "relative", padding: "8px 0", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        {months.map((_, i) => (
                          <div key={i} style={{ position: "absolute", left: `${i * COL_PCT}%`, top: 0, bottom: 0, width: 1, background: "#f1f5f9" }}/>
                        ))}
                        {todayInRange && (
                          <div style={{ position: "absolute", left: `${todayFrac * COL_PCT}%`, top: 0, bottom: 0, width: 1.5, background: "#ef4444", opacity: 0.3, zIndex: 2 }}/>
                        )}
                        <GanttBar item={item} timeline={timeline}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Today footer — altura própria para o badge não ser cortado pelo
              overflow:hidden do card */}
          <div style={{ display: "flex", borderTop: "1px solid #e2e8f0", background: "#fff", padding: "8px 0 16px" }}>
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
