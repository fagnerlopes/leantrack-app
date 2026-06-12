import { useRef, useState } from "react";
import type { Item } from "./api";
import {
  MONTHS, TOTAL_MONTHS, LABEL_W, TODAY_FRAC, TODAY_LABEL, QUARTERS,
  STATUS_META, BAR_COLORS, RISK_META, calcRisk, dateToFractional, endDateToFractional, fmtDate, hasExtDep,
} from "./roadmap-utils";

type Props = {
  items: Item[];
  onSelect?: (it: Item) => void;
  onReorder?: (status: string, orderedIds: number[]) => void;
  innerRef?: React.RefObject<HTMLDivElement | null>;
};

function RiskBadge({ level }: { level: "critico" | "alerta" | "ok" }) {
  const m = RISK_META[level];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
      background: m.bg, color: m.text, border: `1px solid ${m.color}44`,
    }}>
      {m.icon} {m.label}
    </span>
  );
}

function MilestoneDiamond({ frac, risk, label }: { frac: number; risk: any; label: string }) {
  const COL_W = 100 / TOTAL_MONTHS;
  const left = frac * COL_W;
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

function GanttBar({ item }: { item: Item }) {
  const COL_W = 100 / TOTAL_MONTHS;
  const risk = calcRisk(item);
  const isCritico = risk === "critico";
  const isAlerta = risk === "alerta";
  const hasMs = hasExtDep(item);

  const startFrac = item.startDate ? dateToFractional(item.startDate)! : TODAY_FRAC;
  const endFrac = item.endDate ? endDateToFractional(item.endDate)! : startFrac + 1;
  const left = Math.max(0, startFrac) * COL_W;
  // No half-month floor: tiny items can be very thin (we rely on minWidth: 8px
  // for visibility). Forcing 0.5 month would make short tasks visually invade
  // the next item's date range.
  const width = Math.max(0, endFrac - Math.max(0, startFrac)) * COL_W;

  const baseColor = item.color || BAR_COLORS[item.status] || "#64748b";
  const barColor = isCritico ? "#dc2626" : isAlerta ? "#d97706" : baseColor;
  const msFrac = hasMs ? dateToFractional(item.extMilestone!) : null;

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
            transform: "translateY(-50%)", fontSize: 11, color: "rgba(255,255,255,0.9)" }}>
            {isCritico ? "⚠" : "⚡"}
          </div>
        )}
      </div>
      {hasMs && msFrac !== null && (
        <MilestoneDiamond frac={msFrac} risk={risk} label={fmtDate(item.extMilestone)}/>
      )}
    </div>
  );
}

function ExtDepTag({ item }: { item: Item }) {
  if (!hasExtDep(item)) return null;
  const risk = calcRisk(item) || "alerta";
  const rm = RISK_META[risk];
  return (
    <div style={{
      marginTop: 4, padding: "4px 7px", borderRadius: 5,
      background: rm.bg, border: `1px solid ${rm.color}44`, fontSize: 9, lineHeight: 1.4,
    }}>
      <div style={{ fontWeight: 700, color: rm.text, display: "flex", alignItems: "center", gap: 3 }}>
        {rm.icon} {item.extTeam}
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

export default function Gantt({ items, onSelect, onReorder, innerRef }: Props) {
  const COL_PCT = 100 / TOTAL_MONTHS;
  const draggingId = useRef<number | null>(null);
  const draggingStatus = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

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

  return (
    <div ref={innerRef} style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 860 }}>
          {/* Quarter header */}
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
            <div style={{ width: LABEL_W, minWidth: LABEL_W, padding: "10px 16px", borderRight: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Iniciativa</span>
            </div>
            <div style={{ flex: 1, display: "flex" }}>
              {QUARTERS.map(q => (
                <div key={q.label} style={{
                  width: `${q.span * COL_PCT}%`, padding: "10px 0",
                  textAlign: "center", fontSize: 11, fontWeight: 700, color: "#0f172a",
                  borderRight: "1px solid #e2e8f0",
                  background: q.label.startsWith("Q3") || q.label.startsWith("Q1") ? "#f1f5f9" : "#fff",
                }}>{q.label}</div>
              ))}
            </div>
          </div>

          {/* Month header */}
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <div style={{ width: LABEL_W, minWidth: LABEL_W, borderRight: "1px solid #e2e8f0" }}/>
            <div style={{ flex: 1, display: "flex" }}>
              {MONTHS.map((m, i) => (
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
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }}/>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {meta.label}
                    </span>
                  </div>
                  <div style={{ flex: 1, position: "relative" }}>
                    <div style={{ position: "absolute", left: `${TODAY_FRAC * COL_PCT}%`, top: 0, bottom: 0, width: 1.5, background: "#ef4444", opacity: 0.4 }}/>
                  </div>
                </div>

                {group.map(item => {
                  const dep = item.dependencyId ? items.find(i => i.id === item.dependencyId) : null;
                  const risk = calcRisk(item);
                  const isDragOver = dragOverId === item.id;
                  return (
                    <div key={item.id}
                      draggable={!!onReorder}
                      onDragStart={(e) => {
                        if (!onReorder) return;
                        draggingId.current = item.id;
                        draggingStatus.current = item.status;
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        if (!onReorder) return;
                        if (draggingStatus.current !== item.status) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverId !== item.id) setDragOverId(item.id);
                      }}
                      onDragLeave={() => { if (dragOverId === item.id) setDragOverId(null); }}
                      onDrop={(e) => { e.preventDefault(); handleDrop(item); }}
                      onDragEnd={() => { draggingId.current = null; draggingStatus.current = null; setDragOverId(null); }}
                      style={{
                        display: "flex", borderBottom: "1px solid #f1f5f9",
                        background: isDragOver ? "#eef2ff" : risk === "critico" ? "#fff7f7" : "#fff",
                        borderTop: isDragOver ? "2px solid #6366f1" : undefined,
                        cursor: onSelect ? "pointer" : onReorder ? "grab" : "default",
                      }}
                      onClick={() => onSelect && onSelect(item)}
                    >
                      <div style={{
                        width: LABEL_W, minWidth: LABEL_W,
                        padding: "10px 14px", borderRight: "1px solid #e2e8f0",
                        borderLeft: risk === "critico" ? "3px solid #dc2626"
                                  : risk === "alerta" ? "3px solid #d97706"
                                  : "3px solid transparent",
                      }}>
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
                                fontSize: 11, lineHeight: 1, padding: "2px 5px",
                                borderRadius: 4, border: "1px solid #cbd5e1",
                                background: "#f8fafc", color: "#0f172a",
                                textDecoration: "none", cursor: "pointer",
                                display: "inline-flex", alignItems: "center", gap: 2,
                              }}
                            >🔗</a>
                          )}
                          {risk && <RiskBadge level={risk}/>}
                        </div>
                        {dep && (
                          <div style={{ fontSize: 10, color: "#d97706", marginTop: 3 }}>
                            ↳ {dep.title.length > 22 ? dep.title.slice(0, 22) + "…" : dep.title}
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
                          <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3 }}>
                            {fmtDate(item.startDate)} → {fmtDate(item.endDate)}
                          </div>
                        )}
                        <ExtDepTag item={item}/>
                      </div>

                      <div style={{ flex: 1, position: "relative", padding: "8px 0", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        {MONTHS.map((_, i) => (
                          <div key={i} style={{ position: "absolute", left: `${i * COL_PCT}%`, top: 0, bottom: 0, width: 1, background: "#f1f5f9" }}/>
                        ))}
                        <div style={{ position: "absolute", left: `${TODAY_FRAC * COL_PCT}%`, top: 0, bottom: 0, width: 1.5, background: "#ef4444", opacity: 0.3, zIndex: 2 }}/>
                        <GanttBar item={item}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Today footer */}
          <div style={{ display: "flex", borderTop: "1px solid #e2e8f0", background: "#fff", padding: "8px 0" }}>
            <div style={{ width: LABEL_W, minWidth: LABEL_W, borderRight: "1px solid #e2e8f0" }}/>
            <div style={{ flex: 1, position: "relative" }}>
              <div style={{
                position: "absolute", left: `${TODAY_FRAC * COL_PCT}%`, transform: "translateX(-50%)",
                background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700,
                padding: "3px 7px", borderRadius: 4, whiteSpace: "nowrap",
              }}>Hoje · {TODAY_LABEL}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
