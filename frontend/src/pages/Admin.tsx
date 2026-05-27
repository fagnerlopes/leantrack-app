import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Item, ItemInput } from "../api";
import { useAuth } from "../auth";
import { STATUS_META, calcRisk, RISK_META, fmtDate } from "../roadmap-utils";
import ItemModal from "../ItemModal";

const emptyForm: ItemInput = {
  title: "", status: "nao-iniciado",
  startDate: null, endDate: null, progress: 0,
  dependencyId: null, notes: "",
  extTeam: null, extDescription: null, extMilestone: null,
  sortOrder: 0,
  color: null,
  epicUrl: null,
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
                      <Td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <strong>{i.title}</strong>
                          {i.epicUrl && (
                            <a href={i.epicUrl} target="_blank" rel="noopener noreferrer"
                              title="Abrir épico em nova aba"
                              style={{ fontSize: 11, padding: "1px 5px", borderRadius: 4, border: "1px solid #cbd5e1", background: "#f8fafc", textDecoration: "none" }}>🔗</a>
                          )}
                        </div>
                        {i.notes && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{i.notes.slice(0,60)}</div>}
                      </Td>
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

const btnLight: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, background: "#1e293b", color: "#fff", fontSize: 12, fontWeight: 600, textDecoration: "none" };
const btnGhost: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer" };
const btnAccent: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnSmallPrimary: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "none", background: "#0f172a", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const btnSmallDanger: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontSize: 11, fontWeight: 600, cursor: "pointer" };
