import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Item, ItemInput } from "../api";
import { useAuth } from "../auth";
import { STATUS_META, calcRisk, RISK_META, fmtDate } from "../roadmap-utils";

const emptyForm: ItemInput = {
  title: "", status: "nao-iniciado",
  startDate: null, endDate: null, progress: 0,
  dependencyId: null, notes: "",
  extTeam: null, extDescription: null, extMilestone: null,
  sortOrder: 0,
};

export default function Admin() {
  const { user, logout } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    api.listItems().then(setItems).catch(e => setErr(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  async function handleSave(input: ItemInput, id?: number) {
    try {
      if (id) {
        const updated = await api.updateItem(id, input);
        setItems(prev => prev.map(i => i.id === id ? updated : i));
        showToast("Atualizado ✓");
      } else {
        const created = await api.createItem(input);
        setItems(prev => [...prev, created]);
        showToast("Criado ✓");
      }
      setEditing(null); setCreating(false);
    } catch (e: any) { alert(e.message); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remover este item?")) return;
    try {
      await api.deleteItem(id);
      setItems(prev => prev.filter(i => i.id !== id));
      setEditing(null);
      showToast("Removido");
    } catch (e: any) { alert(e.message); }
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{
        background: "#0f172a", color: "#fff", padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Dashboard de Gestão</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{items.length} iniciativas cadastradas</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link to="/" style={btnLight}>Ver roadmap</Link>
          <button onClick={() => setCreating(true)} style={btnAccent}>+ Nova iniciativa</button>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{user?.name}</span>
          <button onClick={logout} style={btnGhost}>Sair</button>
        </div>
      </header>

      <div style={{ padding: 24 }}>
        {loading && <div style={{ color: "#64748b" }}>Carregando…</div>}
        {err && <div style={{ color: "#991b1b" }}>{err}</div>}
        {!loading && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <Th>Iniciativa</Th>
                  <Th>Status</Th>
                  <Th>Início</Th>
                  <Th>Fim</Th>
                  <Th>Progresso</Th>
                  <Th>Dep. externa</Th>
                  <Th>Risco</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {items.map(i => {
                  const sm = STATUS_META[i.status];
                  const risk = calcRisk(i);
                  return (
                    <tr key={i.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <Td><strong>{i.title}</strong>{i.notes && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{i.notes.slice(0,60)}</div>}</Td>
                      <Td><span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: sm.bg, color: sm.text, fontWeight: 600 }}>{sm.label}</span></Td>
                      <Td>{fmtDate(i.startDate)}</Td>
                      <Td>{fmtDate(i.endDate)}</Td>
                      <Td>{i.status === "em-andamento" ? `${i.progress}%` : "—"}</Td>
                      <Td>{i.extTeam ? <><div>{i.extTeam}</div>{i.extMilestone && <div style={{ fontSize: 10, color: "#94a3b8" }}>Marco: {fmtDate(i.extMilestone)}</div>}</> : "—"}</Td>
                      <Td>{risk ? <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: RISK_META[risk].bg, color: RISK_META[risk].text, fontWeight: 700 }}>{RISK_META[risk].icon} {RISK_META[risk].label}</span> : "—"}</Td>
                      <Td>
                        <button onClick={() => setEditing(i)} style={btnSmallPrimary}>Editar</button>{" "}
                        <button onClick={() => handleDelete(i.id)} style={btnSmallDanger}>Remover</button>
                      </Td>
                    </tr>
                  );
                })}
                {!items.length && (
                  <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>Nenhuma iniciativa cadastrada. Clique em "Nova iniciativa".</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(editing || creating) && (
        <ItemModal
          initial={editing || { ...emptyForm, id: 0 } as Item}
          allItems={items}
          isNew={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={(input) => handleSave(input, editing?.id)}
          onDelete={editing ? () => handleDelete(editing.id) : undefined}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, background: "#0f172a", color: "#fff",
          padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 9999,
        }}>{toast}</div>
      )}
    </div>
  );
}

function Th({ children }: { children: any }) { return <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{children}</th>; }
function Td({ children }: { children: any }) { return <td style={{ padding: "12px 14px", verticalAlign: "top" }}>{children}</td>; }

function ItemModal({ initial, allItems, isNew, onClose, onSave, onDelete }: {
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
    };
    onSave(input);
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, outline: "none", background: "#f8fafc", color: "#1e293b", fontFamily: "inherit" };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4, display: "block" };

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

const btnLight: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, background: "#1e293b", color: "#fff", fontSize: 12, fontWeight: 600, textDecoration: "none" };
const btnGhost: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer" };
const btnAccent: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnSmallPrimary: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "none", background: "#0f172a", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const btnSmallDanger: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const btnSmallGhost: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 11, cursor: "pointer" };
