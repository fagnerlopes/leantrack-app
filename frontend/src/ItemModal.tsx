import { useState } from "react";
import type { Item, ItemInput } from "./api";
import { STATUS_META, BAR_COLORS } from "./roadmap-utils";

export default function ItemModal({ initial, allItems, isNew, onClose, onSave, onDelete }: {
  initial: Item;
  allItems: Item[];
  isNew: boolean;
  onClose: () => void;
  onSave: (input: ItemInput) => void;
  onDelete?: () => void;
}) {
  const [f, setF] = useState<ItemInput & { hasExt: boolean }>({
    title: initial.title || "",
    status: initial.status || "nao-iniciado",
    startDate: initial.startDate || null,
    endDate: initial.endDate || null,
    progress: initial.progress || 0,
    dependencyId: initial.dependencyId || null,
    notes: initial.notes || "",
    extTeam: initial.extTeam || null,
    extDescription: initial.extDescription || null,
    extMilestone: initial.extMilestone || null,
    sortOrder: initial.sortOrder || 0,
    color: initial.color || null,
    epicUrl: initial.epicUrl || null,
    hasExt: !!initial.extTeam,
  });
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  const submit = () => {
    if (!f.title.trim()) { alert("Título obrigatório"); return; }
    const input: ItemInput = {
      title: f.title.trim(),
      status: f.status,
      startDate: f.startDate || null,
      endDate: f.endDate || null,
      progress: Number(f.progress) || 0,
      dependencyId: f.dependencyId,
      notes: f.notes,
      extTeam: f.hasExt && f.extTeam ? f.extTeam.trim() : null,
      extDescription: f.hasExt && f.extDescription ? f.extDescription.trim() : null,
      extMilestone: f.hasExt ? (f.extMilestone || null) : null,
      sortOrder: f.sortOrder,
      color: f.color || null,
      epicUrl: f.epicUrl ? f.epicUrl.trim() : null,
    };
    onSave(input);
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, outline: "none", background: "#f8fafc", color: "#1e293b", fontFamily: "inherit" };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4, display: "block" };
  const statusColor = BAR_COLORS[f.status] || "#64748b";
  const effectiveColor = f.color || statusColor;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 520, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{isNew ? "Nova iniciativa" : "Editar iniciativa"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={lbl}>Título *</label><input style={inp} value={f.title} onChange={e => set("title", e.target.value)}/></div>
          <div><label style={lbl}>Status</label>
            <select style={inp} value={f.status} onChange={e => set("status", e.target.value)}>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>Início</label><input type="date" style={inp} value={f.startDate || ""} onChange={e => set("startDate", e.target.value || null)}/></div>
            <div><label style={lbl}>Término</label><input type="date" style={inp} value={f.endDate || ""} onChange={e => set("endDate", e.target.value || null)}/></div>
          </div>
          <div>
            <label style={lbl}>Cor do card</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                type="color"
                value={effectiveColor}
                onChange={e => set("color", e.target.value)}
                style={{ width: 48, height: 36, border: "1.5px solid #e2e8f0", borderRadius: 8, cursor: "pointer", background: "#fff" }}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["#059669","#2563eb","#7c3aed","#d97706","#dc2626","#0ea5e9","#ec4899","#64748b"].map(c => (
                  <button key={c} type="button" onClick={() => set("color", c)}
                    title={c}
                    style={{ width: 22, height: 22, borderRadius: "50%", background: c,
                      border: f.color?.toLowerCase() === c ? "2px solid #0f172a" : "1px solid #e2e8f0", cursor: "pointer" }}/>
                ))}
              </div>
              {f.color && (
                <button type="button" onClick={() => set("color", null)} style={{ fontSize: 11, color: "#64748b", background: "none", border: "1px solid #e2e8f0", padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}>
                  Usar cor do status
                </button>
              )}
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
              {f.color ? `Cor customizada (${f.color}).` : `Sem customização — usa a cor do status (${statusColor}).`}
            </div>
          </div>
          {f.status === "em-andamento" && (
            <div><label style={lbl}>Progresso: {f.progress}%</label>
              <input type="range" min={0} max={100} value={f.progress} onChange={e => set("progress", Number(e.target.value))} style={{ width: "100%" }}/>
            </div>
          )}
          <div><label style={lbl}>Depende de</label>
            <select style={inp} value={f.dependencyId || ""} onChange={e => set("dependencyId", e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Nenhuma —</option>
              {allItems.filter(i => i.id !== initial.id).map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Ordem</label><input type="number" style={inp} value={f.sortOrder} onChange={e => set("sortOrder", Number(e.target.value))}/></div>
          <div>
            <label style={lbl}>Link do épico (Jira / Azure DevOps)</label>
            <input
              type="url"
              placeholder="https://..."
              style={inp}
              value={f.epicUrl || ""}
              onChange={e => set("epicUrl", e.target.value || null)}
            />
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
              Cole a URL do épico (deve começar com http:// ou https://).
            </div>
          </div>
          <div><label style={lbl}>Notas</label><textarea style={{ ...inp, height: 60, resize: "vertical" }} value={f.notes} onChange={e => set("notes", e.target.value)}/></div>

          <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, fontSize: 11, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.03em" }}>Dependência externa</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={f.hasExt} onChange={e => set("hasExt", e.target.checked)}/>
            Bloqueada por time externo
          </label>
          {f.hasExt && (
            <div style={{ padding: 14, borderRadius: 10, background: "#fff7ed", border: "1.5px solid #fed7aa", display: "flex", flexDirection: "column", gap: 8 }}>
              <div><label style={lbl}>Time</label><input style={{ ...inp, background: "#fff" }} value={f.extTeam || ""} onChange={e => set("extTeam", e.target.value)}/></div>
              <div><label style={lbl}>O que está bloqueando</label><input style={{ ...inp, background: "#fff" }} value={f.extDescription || ""} onChange={e => set("extDescription", e.target.value)}/></div>
              <div><label style={lbl}>Marco previsto</label><input type="date" style={{ ...inp, background: "#fff" }} value={f.extMilestone || ""} onChange={e => set("extMilestone", e.target.value || null)}/></div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, gap: 10 }}>
          {!isNew && onDelete ? <button onClick={onDelete} style={btnSmallDanger}>Remover</button> : <div/>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btnSmallGhost}>Cancelar</button>
            <button onClick={submit} style={btnSmallPrimary}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnSmallPrimary: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "none", background: "#0f172a", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const btnSmallDanger: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const btnSmallGhost: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 11, cursor: "pointer" };
