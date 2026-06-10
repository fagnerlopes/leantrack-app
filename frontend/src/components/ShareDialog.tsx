import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import type { Collaborator } from "../api";

export default function ShareDialog({ roadmapId, onClose }: { roadmapId: number; onClose: () => void }) {
  const [collabs, setCollabs] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState("");
  const [canEdit, setCanEdit] = useState(true);
  const [canShare, setCanShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.listCollaborators(roadmapId)
      .then(setCollabs)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [roadmapId]);

  useEffect(() => { load(); }, [load]);

  async function invite() {
    const e = email.trim().toLowerCase();
    if (!e) { setErr("Informe um e-mail"); return; }
    setBusy(true); setErr(null);
    try {
      const created = await api.addCollaborator(roadmapId, { email: e, canEdit, canShare });
      setCollabs(prev => {
        const others = prev.filter(c => c.userId !== created.userId);
        return [...others, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      setEmail("");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Collaborator) {
    try {
      await api.removeCollaborator(roadmapId, c.userId);
      setCollabs(prev => prev.filter(x => x.userId !== c.userId));
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalCard} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Compartilhar roadmap</h2>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          Convide pessoas por e-mail e escolha o que elas podem fazer.
        </div>

        <label style={lbl}>E-mail do convidado</label>
        <input
          aria-label="e-mail do convidado"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="pessoa@empresa.com.br"
          style={input}
        />

        <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
          <label style={chk}>
            <input type="checkbox" checked={canEdit} onChange={e => setCanEdit(e.target.checked)} />
            Pode editar
          </label>
          <label style={chk}>
            <input type="checkbox" checked={canShare} onChange={e => setCanShare(e.target.checked)} />
            Pode compartilhar
          </label>
        </div>

        {err && <div style={errBox}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={invite} disabled={busy} style={btnAccent}>{busy ? "Convidando…" : "Convidar"}</button>
        </div>

        <div style={{ marginTop: 20, borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
          <div style={{ ...lbl, marginBottom: 10 }}>Pessoas com acesso</div>
          {loading && <div style={{ color: "#94a3b8", fontSize: 13 }}>Carregando…</div>}
          {!loading && collabs.length === 0 && (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>Ninguém além do dono tem acesso de edição.</div>
          )}
          {collabs.map(c => (
            <div key={c.userId} style={row}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{c.email}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  {c.canEdit ? "Edita" : "Leitura"}{c.canShare ? " · Compartilha" : ""}
                </div>
              </div>
              <button aria-label={`remover ${c.name}`} onClick={() => remove(c)} style={btnGhostDanger}>Remover</button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnGhostDark}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex",
  alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000,
};
const modalCard: React.CSSProperties = {
  background: "#fff", borderRadius: 14, padding: 28, width: 480, maxWidth: "100%",
  maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#64748b",
  letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0",
  fontSize: 14, outline: "none", background: "#f8fafc", color: "#0f172a", boxSizing: "border-box",
};
const chk: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#0f172a", cursor: "pointer" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" };
const errBox: React.CSSProperties = { marginTop: 12, padding: "8px 12px", background: "#fee2e2", color: "#991b1b", fontSize: 12, borderRadius: 6 };
const btnAccent: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhostDark: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhostDanger: React.CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" };
