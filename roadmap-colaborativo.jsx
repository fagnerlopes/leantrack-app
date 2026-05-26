import { useState, useEffect } from "react";

// ── constants ─────────────────────────────────────────────────────────────────
const MONTHS = ["Mai","Jun","Jul","Ago","Set","Out","Nov","Dez","Jan","Fev","Mar","Abr","Mai'27"];
const TOTAL_MONTHS = 13;
const LABEL_W = 230;
const TODAY_FRAC = (25 - 1) / 31; // Mai 25 → ≈ 0.774
const STORAGE_KEY = "roadmap_items_v3";

const QUARTERS = [
  { label: "Q2 2026", start: 0, span: 2 },
  { label: "Q3 2026", start: 2, span: 3 },
  { label: "Q4 2026", start: 5, span: 3 },
  { label: "Q1 2027", start: 8, span: 3 },
  { label: "Q2 2027", start: 11, span: 2 },
];

const STATUS_META = {
  "em-andamento": { label: "Em andamento", color: "#059669", bg: "#d1fae5", text: "#065f46" },
  "nao-iniciado": { label: "Não iniciado",  color: "#2563eb", bg: "#dbeafe", text: "#1e3a8a" },
  "concluido":    { label: "Concluído",      color: "#7c3aed", bg: "#ede9fe", text: "#4c1d95" },
  "pausado":      { label: "Pausado",        color: "#d97706", bg: "#fef3c7", text: "#92400e" },
};

const BAR_COLORS = {
  "em-andamento": "#059669",
  "nao-iniciado": "#2563eb",
  "concluido":    "#7c3aed",
  "pausado":      "#d97706",
};

// Risk level derived from milestone proximity to task start
// "critico"  = milestone is AFTER task startDate (already blocking)
// "alerta"   = milestone is within 14 days before task startDate
// "ok"       = milestone is safely before task startDate
function calcRisk(item) {
  if (!item.extDep?.milestoneDate) return null;
  if (!item.startDate) return "alerta";
  const ms   = new Date(item.extDep.milestoneDate);
  const st   = new Date(item.startDate);
  const diff = (ms - st) / 86400000; // positive = milestone after start = blocking
  if (diff > 0)   return "critico";
  if (diff > -14) return "alerta";
  return "ok";
}

const RISK_META = {
  critico: { label: "Crítico",  color: "#dc2626", bg: "#fee2e2", text: "#991b1b", icon: "⚠" },
  alerta:  { label: "Alerta",   color: "#d97706", bg: "#fef3c7", text: "#92400e", icon: "⚡" },
  ok:      { label: "No prazo", color: "#059669", bg: "#d1fae5", text: "#065f46", icon: "✓"  },
};

// ── date math ─────────────────────────────────────────────────────────────────
function dateToFractional(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const base = (2026 - 1) * 12 + 5;
  const absMonths = (y - 1) * 12 + m;
  const monthIdx = absMonths - base;
  return monthIdx + (d - 1) / daysInMonth;
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

// ── default data ──────────────────────────────────────────────────────────────
const DEFAULT_ITEMS = [
  {
    id: "1", title: "Atualização da Nephelae",
    status: "em-andamento", startDate: "2026-04-01", endDate: "2026-06-15",
    progress: 80, dependency: null, notes: "", extDep: null,
  },
  {
    id: "2", title: "Audit Infra + API Hub + Agente Embarcado",
    status: "em-andamento", startDate: "2026-04-15", endDate: "2026-07-31",
    progress: 55, dependency: null, notes: "",
    extDep: {
      team: "Time de Infraestrutura",
      description: "Liberação das credenciais de acesso ao API Hub",
      milestoneDate: "2026-07-10",
    },
  },
  {
    id: "3", title: "Novo Painel Cloud (Shell) + Co-founder",
    status: "nao-iniciado", startDate: "2026-06-05", endDate: "2026-06-30",
    progress: 0, dependency: null, notes: "", extDep: null,
  },
  {
    id: "4", title: "Migração de Lote entre Pools",
    status: "nao-iniciado", startDate: "2026-06-15", endDate: "2026-07-31",
    progress: 0, dependency: "1",
    notes: "Depende do término da Atualização da Nephelae",
    extDep: {
      team: "Equipe de DBAs",
      description: "Script de migração homologado e aprovado pelo time de dados",
      milestoneDate: "2026-06-20",
    },
  },
];

// ── RiskBadge ─────────────────────────────────────────────────────────────────
function RiskBadge({ level }) {
  const m = RISK_META[level];
  if (!m) return null;
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

// ── Milestone diamond on the Gantt track ──────────────────────────────────────
function MilestoneDiamond({ frac, totalMonths, risk, label }) {
  const COL_W = 100 / totalMonths;
  const left = frac * COL_W;
  const color = risk === "critico" ? "#dc2626" : risk === "alerta" ? "#d97706" : "#059669";
  return (
    <div style={{
      position: "absolute",
      left: `${left}%`,
      top: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 10,
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      {/* diamond shape */}
      <div style={{
        width: 14, height: 14,
        background: color,
        transform: "rotate(45deg)",
        borderRadius: 2,
        boxShadow: `0 0 0 2px white, 0 0 0 3px ${color}`,
        flexShrink: 0,
      }}/>
      {/* label below */}
      <div style={{
        marginTop: 6,
        fontSize: 8, fontWeight: 700, color, whiteSpace: "nowrap",
        background: "white", padding: "1px 4px", borderRadius: 3,
        border: `1px solid ${color}55`,
        lineHeight: 1.4,
      }}>
        {label}
      </div>
    </div>
  );
}

// ── GanttBar ──────────────────────────────────────────────────────────────────
function GanttBar({ item, totalMonths, onEdit }) {
  const COL_W = 100 / totalMonths;
  const risk = calcRisk(item);
  const isCritico = risk === "critico";
  const isAlerta  = risk === "alerta";
  const hasExtDep = !!item.extDep?.milestoneDate;

  const startFrac = item.startDate ? dateToFractional(item.startDate) : TODAY_FRAC;
  const endFrac   = item.endDate   ? dateToFractional(item.endDate)   : startFrac + 1;
  const left  = Math.max(0, startFrac) * COL_W;
  const width = Math.max(0.5, (endFrac - Math.max(0, startFrac))) * COL_W;

  const baseColor = BAR_COLORS[item.status] || "#64748b";
  const barColor  = isCritico ? "#dc2626" : isAlerta ? "#d97706" : baseColor;
  const msFrac    = hasExtDep ? dateToFractional(item.extDep.milestoneDate) : null;

  return (
    <div style={{ position: "relative", height: 38, cursor: "pointer" }} onClick={() => onEdit(item)}>
      {/* bar */}
      <div style={{
        position: "absolute",
        left: `${left}%`, width: `${width}%`,
        top: 4, height: 22,
        background: barColor,
        borderRadius: 6,
        opacity: item.status === "nao-iniciado" ? 0.72 : 0.9,
        border: isCritico ? `2px dashed #991b1b`
               : isAlerta  ? `2px dashed #92400e`
               : "none",
        boxSizing: "border-box",
        overflow: "hidden",
        minWidth: 8,
      }}>
        {/* progress overlay for em-andamento */}
        {item.status === "em-andamento" && (
          <div style={{
            position: "absolute", left: 0, top: 0,
            width: `${item.progress}%`, height: "100%",
            background: "rgba(255,255,255,0.22)", borderRadius: 4,
          }}/>
        )}
        {/* ⚠ icon inside bar if blocked */}
        {(isCritico || isAlerta) && (
          <div style={{
            position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
            fontSize: 11, color: "rgba(255,255,255,0.9)", lineHeight: 1,
          }}>
            {isCritico ? "⚠" : "⚡"}
          </div>
        )}
      </div>

      {/* milestone diamond */}
      {hasExtDep && msFrac !== null && (
        <MilestoneDiamond
          frac={msFrac}
          totalMonths={totalMonths}
          risk={risk}
          label={fmtDate(item.extDep.milestoneDate)}
        />
      )}
    </div>
  );
}

// ── ExtDepSection inside label column ────────────────────────────────────────
function ExtDepTag({ item }) {
  const risk = calcRisk(item);
  if (!item.extDep) return null;
  const rm = RISK_META[risk] || RISK_META.alerta;
  return (
    <div style={{
      marginTop: 4,
      padding: "4px 7px",
      borderRadius: 5,
      background: rm.bg,
      border: `1px solid ${rm.color}44`,
      fontSize: 9, lineHeight: 1.4,
    }}>
      <div style={{ fontWeight: 700, color: rm.text, display: "flex", alignItems: "center", gap: 3 }}>
        {rm.icon} {item.extDep.team}
      </div>
      <div style={{ color: rm.text, opacity: 0.85, marginTop: 1 }}>
        {item.extDep.description.length > 38
          ? item.extDep.description.slice(0, 38) + "…"
          : item.extDep.description}
      </div>
      {item.extDep.milestoneDate && (
        <div style={{ color: rm.color, fontWeight: 700, marginTop: 1 }}>
          Marco: {fmtDate(item.extDep.milestoneDate)}
        </div>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ item, items, onSave, onDelete, onClose }) {
  const isNew = !item.id;
  const [form, setForm] = useState({
    title:           item.title           || "",
    status:          item.status          || "nao-iniciado",
    startDate:       item.startDate       || "",
    endDate:         item.endDate         || "",
    progress:        item.progress        ?? 0,
    dependency:      item.dependency      || "",
    notes:           item.notes           || "",
    hasExtDep:       !!item.extDep,
    extTeam:         item.extDep?.team         || "",
    extDescription:  item.extDep?.description  || "",
    extMilestone:    item.extDep?.milestoneDate || "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.title.trim()) return;
    onSave({
      ...item,
      id:         item.id || String(Date.now()),
      title:      form.title.trim(),
      status:     form.status,
      startDate:  form.startDate  || null,
      endDate:    form.endDate    || null,
      progress:   Number(form.progress),
      dependency: form.dependency || null,
      notes:      form.notes,
      extDep: form.hasExtDep && form.extTeam.trim() ? {
        team:          form.extTeam.trim(),
        description:   form.extDescription.trim(),
        milestoneDate: form.extMilestone || null,
      } : null,
    });
  };

  const inp = {
    width: "100%", padding: "8px 10px", borderRadius: 8,
    border: "1.5px solid #e2e8f0", fontSize: 13, outline: "none",
    background: "#f8fafc", color: "#1e293b", boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const lbl = {
    fontSize: 11, fontWeight: 600, color: "#64748b",
    letterSpacing: "0.06em", textTransform: "uppercase",
    marginBottom: 4, display: "block",
  };
  const sectionDivider = {
    margin: "6px 0 2px", paddingBottom: 6,
    borderBottom: "1px solid #e2e8f0",
    fontSize: 11, fontWeight: 700, color: "#0f172a", letterSpacing: "0.03em",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: 28, width: 500, maxWidth: "95vw",
        boxShadow: "0 24px 60px rgba(0,0,0,0.18)", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
            {isNew ? "Novo item" : "Editar item"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>

          {/* ── básico ── */}
          <div><label style={lbl}>Título *</label>
            <input style={inp} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Nome da iniciativa"/>
          </div>
          <div><label style={lbl}>Status</label>
            <select style={inp} value={form.status} onChange={e => set("status", e.target.value)}>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>Data de início</label>
              <input type="date" style={inp} value={form.startDate} onChange={e => set("startDate", e.target.value)}/>
            </div>
            <div><label style={lbl}>Previsão de término</label>
              <input type="date" style={inp} value={form.endDate} onChange={e => set("endDate", e.target.value)}/>
            </div>
          </div>
          {form.status === "em-andamento" && (
            <div><label style={lbl}>Progresso: {form.progress}%</label>
              <input type="range" min={0} max={100} value={form.progress}
                onChange={e => set("progress", e.target.value)}
                style={{ width: "100%", accentColor: "#059669" }}/>
            </div>
          )}
          <div><label style={lbl}>Dependência interna</label>
            <select style={inp} value={form.dependency} onChange={e => set("dependency", e.target.value)}>
              <option value="">— Nenhuma —</option>
              {items.filter(i => i.id !== item.id).map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Notas</label>
            <textarea style={{ ...inp, height: 60, resize: "vertical" }}
              value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Observações…"/>
          </div>

          {/* ── dependência externa ── */}
          <div style={sectionDivider}>Dependência externa</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "#0f172a" }}>
            <input type="checkbox" checked={form.hasExtDep} onChange={e => set("hasExtDep", e.target.checked)}
              style={{ width: 15, height: 15, accentColor: "#dc2626" }}/>
            Este item é bloqueado por um time externo
          </label>

          {form.hasExtDep && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 10,
              padding: 14, borderRadius: 10,
              background: "#fff7ed", border: "1.5px solid #fed7aa",
            }}>
              <div><label style={{ ...lbl, color: "#92400e" }}>Time responsável *</label>
                <input style={{ ...inp, background: "#fff" }} value={form.extTeam}
                  onChange={e => set("extTeam", e.target.value)}
                  placeholder="Ex: Time de CyberSec, Equipe de DBAs…"/>
              </div>
              <div><label style={{ ...lbl, color: "#92400e" }}>O que está bloqueando</label>
                <input style={{ ...inp, background: "#fff" }} value={form.extDescription}
                  onChange={e => set("extDescription", e.target.value)}
                  placeholder="Ex: Aprovação do certificado SSL, Janela de manutenção…"/>
              </div>
              <div><label style={{ ...lbl, color: "#92400e" }}>Data do marco (entrega prevista do time externo)</label>
                <input type="date" style={{ ...inp, background: "#fff" }} value={form.extMilestone}
                  onChange={e => set("extMilestone", e.target.value)}/>
              </div>
              {form.extMilestone && form.startDate && (
                <div style={{ fontSize: 11 }}>
                  {(() => {
                    const risk = calcRisk({ startDate: form.startDate, extDep: { milestoneDate: form.extMilestone } });
                    const rm = RISK_META[risk];
                    return (
                      <span style={{ color: rm.text, background: rm.bg, padding: "3px 8px", borderRadius: 5, fontWeight: 600 }}>
                        {rm.icon} Risco calculado: {rm.label}
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, gap: 10 }}>
          {!isNew
            ? <button onClick={() => onDelete(item.id)} style={{ padding: "9px 16px", borderRadius: 8, border: "1.5px solid #fca5a5", background: "#fff", color: "#ef4444", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>Remover</button>
            : <div/>
          }
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ padding: "9px 16px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button onClick={handleSave} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Roadmap() {
  const [items, setItems]   = useState(DEFAULT_ITEMS);
  const [modal, setModal]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState(null);
  const [filterRisk, setFilterRisk] = useState(false);

  const COL_PCT = 100 / TOTAL_MONTHS;

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res?.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed) && parsed.length) setItems(parsed);
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const persist = async (next) => {
    setSaving(true);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next));
      showToast("Salvo ✓");
    } catch { showToast("Erro ao salvar"); }
    setSaving(false);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const saveItem = (item) => {
    setItems(prev => {
      const next = prev.find(i => i.id === item.id)
        ? prev.map(i => i.id === item.id ? item : i)
        : [...prev, item];
      persist(next);
      return next;
    });
    setModal(null);
  };

  const deleteItem = (id) => {
    setItems(prev => {
      const next = prev
        .filter(i => i.id !== id)
        .map(i => ({ ...i, dependency: i.dependency === id ? null : i.dependency }));
      persist(next);
      return next;
    });
    setModal(null);
  };

  const visibleItems = filterRisk
    ? items.filter(i => i.extDep && ["critico","alerta"].includes(calcRisk(i)))
    : items;

  const grouped = {
    "em-andamento": visibleItems.filter(i => i.status === "em-andamento"),
    "nao-iniciado": visibleItems.filter(i => i.status === "nao-iniciado"),
    "concluido":    visibleItems.filter(i => i.status === "concluido"),
    "pausado":      visibleItems.filter(i => i.status === "pausado"),
  };

  const blockedCount = items.filter(i => i.extDep && calcRisk(i) === "critico").length;
  const alertCount   = items.filter(i => i.extDep && calcRisk(i) === "alerta").length;

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:300, fontFamily:"system-ui", color:"#64748b", fontSize:14 }}>
      Carregando roadmap…
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans','Sora',system-ui,sans-serif", background: "#f8fafc", minHeight: "100vh", paddingBottom: 40 }}>

      {/* ── HEADER ── */}
      <div style={{
        background: "#0f172a", color: "#fff", padding: "18px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 50, borderBottom: "1px solid #1e293b",
        flexWrap: "wrap", gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>Roadmap</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            Mai 2026 — Q2 2027 · {items.length} {items.length === 1 ? "item" : "itens"}
          </div>
        </div>

        {/* risk summary chips */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {blockedCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, background: "#fee2e2", color: "#991b1b", padding: "4px 10px", borderRadius: 6, border: "1px solid #fca5a5" }}>
              ⚠ {blockedCount} crítico{blockedCount > 1 ? "s" : ""}
            </span>
          )}
          {alertCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, background: "#fef3c7", color: "#92400e", padding: "4px 10px", borderRadius: 6, border: "1px solid #fcd34d" }}>
              ⚡ {alertCount} alerta{alertCount > 1 ? "s" : ""}
            </span>
          )}
          <button onClick={() => setFilterRisk(f => !f)} style={{
            padding: "6px 12px", borderRadius: 8,
            border: filterRisk ? "none" : "1px solid #334155",
            background: filterRisk ? "#dc2626" : "transparent",
            color: filterRisk ? "#fff" : "#94a3b8",
            fontSize: 12, cursor: "pointer", fontWeight: 500,
          }}>
            {filterRisk ? "Ver todos" : "Só bloqueados"}
          </button>
          {saving && <span style={{ fontSize: 11, color: "#94a3b8" }}>Salvando…</span>}
          <button onClick={() => { setItems(DEFAULT_ITEMS); persist(DEFAULT_ITEMS); }} style={{
            padding: "6px 12px", borderRadius: 8, border: "1px solid #334155",
            background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer",
          }}>Resetar</button>
          <button onClick={() => setModal({ id:"", title:"", status:"nao-iniciado", startDate:"", endDate:"", progress:0, dependency:null, notes:"", extDep:null })} style={{
            padding: "7px 16px", borderRadius: 8, border: "none",
            background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Novo item
          </button>
        </div>
      </div>

      {/* ── GANTT ── */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 860 }}>

          {/* Quarter header */}
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
            <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, padding: "10px 16px", borderRight: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Iniciativa</span>
            </div>
            <div style={{ flex: 1, display: "flex" }}>
              {QUARTERS.map(q => (
                <div key={q.label} style={{
                  width: `${q.span * COL_PCT}%`, padding: "10px 0",
                  textAlign: "center", fontSize: 11, fontWeight: 700, color: "#0f172a",
                  letterSpacing: "0.04em", borderRight: "1px solid #e2e8f0",
                  background: q.label.startsWith("Q3") || q.label.startsWith("Q1") ? "#f1f5f9" : "#fff",
                }}>
                  {q.label}
                </div>
              ))}
            </div>
          </div>

          {/* Month header */}
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, borderRight: "1px solid #e2e8f0" }}/>
            <div style={{ flex: 1, display: "flex" }}>
              {MONTHS.map((m, i) => (
                <div key={i} style={{
                  width: `${COL_PCT}%`, padding: "6px 0",
                  textAlign: "center", fontSize: 10, color: "#94a3b8",
                  borderRight: "1px solid #e2e8f0", fontWeight: 500,
                }}>{m}</div>
              ))}
            </div>
          </div>

          {/* Rows */}
          {Object.entries(grouped).map(([status, groupItems]) => {
            if (!groupItems.length) return null;
            const meta = STATUS_META[status];
            return (
              <div key={status}>
                {/* section header */}
                <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f1f5f9" }}>
                  <div style={{
                    width: LABEL_W, minWidth: LABEL_W, flexShrink: 0,
                    padding: "6px 16px", borderRight: "1px solid #e2e8f0",
                    display: "flex", alignItems: "center", gap: 6,
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

                {/* item rows */}
                {groupItems.map(item => {
                  const dep  = item.dependency ? items.find(i => i.id === item.dependency) : null;
                  const risk = calcRisk(item);

                  return (
                    <div key={item.id} style={{
                      display: "flex", borderBottom: "1px solid #f1f5f9",
                      background: risk === "critico" ? "#fff7f7" : "#fff",
                      transition: "background 0.15s",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = risk === "critico" ? "#fff0f0" : "#f8fafc"}
                      onMouseLeave={e => e.currentTarget.style.background = risk === "critico" ? "#fff7f7" : "#fff"}
                    >
                      {/* label column */}
                      <div style={{
                        width: LABEL_W, minWidth: LABEL_W, flexShrink: 0,
                        padding: "10px 14px", borderRight: "1px solid #e2e8f0",
                        cursor: "pointer",
                        borderLeft: risk === "critico" ? "3px solid #dc2626"
                                  : risk === "alerta"  ? "3px solid #d97706"
                                  : "3px solid transparent",
                      }} onClick={() => setModal(item)}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", lineHeight: 1.3, flex: 1 }}>{item.title}</div>
                          {risk && <RiskBadge level={risk}/>}
                        </div>
                        {dep && (
                          <div style={{ fontSize: 10, color: "#d97706", marginTop: 3, display: "flex", alignItems: "center", gap: 3 }}>
                            <span>↳</span>{dep.title.length > 22 ? dep.title.slice(0,22)+"…" : dep.title}
                          </div>
                        )}
                        {status === "em-andamento" ? (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ height: 3, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ width: `${item.progress}%`, height: "100%", background: meta.color, borderRadius: 4 }}/>
                            </div>
                            <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 1 }}>{item.progress}% · até {fmtDate(item.endDate)}</div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3 }}>
                            {fmtDate(item.startDate)} → {fmtDate(item.endDate)}
                          </div>
                        )}
                        {/* external dep tag */}
                        <ExtDepTag item={item}/>
                      </div>

                      {/* bar area */}
                      <div style={{ flex: 1, position: "relative", padding: "8px 0", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        {MONTHS.map((_, i) => (
                          <div key={i} style={{ position: "absolute", left: `${i * COL_PCT}%`, top: 0, bottom: 0, width: 1, background: "#f1f5f9" }}/>
                        ))}
                        {/* today line */}
                        <div style={{ position: "absolute", left: `${TODAY_FRAC * COL_PCT}%`, top: 0, bottom: 0, width: 1.5, background: "#ef4444", opacity: 0.3, zIndex: 2 }}/>
                        {/* critical zone overlay: from task start to milestone if milestone is after start */}
                        {risk === "critico" && item.extDep?.milestoneDate && item.startDate && (() => {
                          const sf = dateToFractional(item.startDate);
                          const mf = dateToFractional(item.extDep.milestoneDate);
                          const l  = Math.min(sf, mf) * COL_PCT;
                          const w  = Math.abs(mf - sf) * COL_PCT;
                          return (
                            <div style={{
                              position: "absolute", left: `${l}%`, width: `${w}%`,
                              top: 0, bottom: 0, background: "#fee2e2", opacity: 0.45, zIndex: 0,
                            }}/>
                          );
                        })()}
                        <GanttBar item={item} totalMonths={TOTAL_MONTHS} onEdit={setModal}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* today footer label */}
          <div style={{ display: "flex", borderTop: "1px solid #e2e8f0", background: "#fff", padding: "8px 0" }}>
            <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, borderRight: "1px solid #e2e8f0" }}/>
            <div style={{ flex: 1, position: "relative" }}>
              <div style={{
                position: "absolute", left: `${TODAY_FRAC * COL_PCT}%`,
                transform: "translateX(-50%)",
                background: "#ef4444", color: "#fff",
                fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 4, whiteSpace: "nowrap",
              }}>
                Hoje · 25 Mai 2026
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── LEGEND ── */}
      <div style={{ display: "flex", gap: 14, padding: "14px 24px", flexWrap: "wrap", borderTop: "1px solid #e2e8f0", background: "#fff" }}>
        {Object.values(STATUS_META).map(m => (
          <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: m.color }}/>
            <span style={{ fontSize: 11, color: "#64748b" }}>{m.label}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 12, borderTop: "2px dashed #dc2626" }}/><span style={{ fontSize: 11, color: "#64748b" }}>Bloqueado (crítico)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 12, borderTop: "2px dashed #d97706" }}/><span style={{ fontSize: 11, color: "#64748b" }}>Em alerta</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 10, height: 10, background: "#dc2626", transform: "rotate(45deg)", borderRadius: 2 }}/>
          <span style={{ fontSize: 11, color: "#64748b" }}>Marco externo</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 2, height: 12, background: "#ef4444" }}/><span style={{ fontSize: 11, color: "#64748b" }}>Hoje</span>
        </div>
      </div>

      {/* ── MODAL ── */}
      {modal && <Modal item={modal} items={items} onSave={saveItem} onDelete={deleteItem} onClose={() => setModal(null)}/>}

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: "#0f172a", color: "#fff",
          padding: "10px 18px", borderRadius: 10,
          fontSize: 13, fontWeight: 500, zIndex: 9999,
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
