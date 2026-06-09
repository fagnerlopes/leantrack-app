import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Roadmap, RoadmapInput } from "../api";
import { useAuth } from "../auth";
import { roadmapPath } from "../roadmap-path";
import AppHeader from "../components/AppHeader";

type Tab = "mine" | "all";

export default function RoadmapList() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("mine");
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback((t: Tab) => {
    setLoading(true);
    setErr(null);
    api.listRoadmaps(t === "mine")
      .then(setRoadmaps)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  async function handleCreate(input: RoadmapInput) {
    const rm = await api.createRoadmap(input);
    setCreating(false);
    nav(roadmapPath(rm)); // abre o novo roadmap (em modo edição, pois é o dono)
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <AppHeader
        title="Roadmaps"
        subtitle="Squad Cloud · Locaweb"
        actions={isAdmin && <Link to="/admin/users" style={btnLight}>Usuários</Link>}
      />

      <div style={{ padding: "16px 24px", display: "flex", alignItems: "center", gap: 8, background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>Meus roadmaps</TabButton>
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>Todos os roadmaps</TabButton>
        <button onClick={() => setCreating(true)} style={{ ...btnAccent, marginLeft: "auto" }}>+ Novo roadmap</button>
      </div>

      <div style={{ padding: 24 }}>
        {loading && <div style={{ color: "#64748b" }}>Carregando…</div>}
        {err && <div style={{ color: "#991b1b" }}>{err}</div>}
        {!loading && !err && roadmaps.length === 0 && (
          <div style={{ color: "#94a3b8", padding: "40px 0", textAlign: "center" }}>
            {tab === "mine"
              ? 'Você ainda não criou nenhum roadmap. Clique em "+ Novo roadmap".'
              : "Nenhum roadmap cadastrado."}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {roadmaps.map(rm => (
            <Link key={rm.id} to={roadmapPath(rm)} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{rm.name}</div>
                {rm.canEdit && <span style={ownerBadge}>seu</span>}
              </div>
              {rm.description && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, lineHeight: 1.4 }}>{rm.description}</div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, fontSize: 12, color: "#94a3b8" }}>
                <span>{rm.ownerName}</span>
                <span>{rm.itemCount} {rm.itemCount === 1 ? "iniciativa" : "iniciativas"}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {creating && <CreateRoadmapModal onClose={() => setCreating(false)} onCreate={handleCreate} />}
    </div>
  );
}

function CreateRoadmapModal({ onClose, onCreate }: { onClose: () => void; onCreate: (input: RoadmapInput) => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) { setErr("Informe um nome"); return; }
    setBusy(true); setErr(null);
    try {
      await onCreate({ name: name.trim(), description: description.trim() });
    } catch (e: any) {
      setErr(e.message); setBusy(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalCard} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Novo roadmap</h2>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>Você será o dono e poderá editá-lo.</div>

        <label style={lbl}>Nome</label>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Roadmap VPS 2026" style={input} />

        <label style={{ ...lbl, marginTop: 14 }}>Descrição (opcional)</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...input, resize: "vertical" as const }} />

        {err && <div style={{ marginTop: 12, padding: "8px 12px", background: "#fee2e2", color: "#991b1b", fontSize: 12, borderRadius: 6 }}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={btnGhostDark}>Cancelar</button>
          <button onClick={submit} disabled={busy} style={btnAccent}>{busy ? "Criando…" : "Criar"}</button>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
      fontSize: 13, fontWeight: 600,
      background: active ? "#0f172a" : "transparent",
      color: active ? "#fff" : "#64748b",
    }}>{children}</button>
  );
}

const cardStyle: React.CSSProperties = {
  display: "block", background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
  padding: 18, textDecoration: "none", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};
const ownerBadge: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, background: "#dbeafe", color: "#1e40af",
  padding: "2px 7px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.05em",
};
const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex",
  alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000,
};
const modalCard: React.CSSProperties = {
  background: "#fff", borderRadius: 14, padding: 28, width: 440, maxWidth: "100%",
  boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#64748b",
  letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0",
  fontSize: 14, outline: "none", background: "#f8fafc", color: "#0f172a", boxSizing: "border-box",
};
const btnLight: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, background: "#1e293b", color: "#fff", fontSize: 12, fontWeight: 600, textDecoration: "none" };
const btnGhostDark: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnAccent: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
