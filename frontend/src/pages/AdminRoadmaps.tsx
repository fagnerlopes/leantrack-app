import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { UserCog, Users2 } from "lucide-react";
import { api } from "../api";
import type { AdminRoadmap, AdminUser } from "../api";
import AppHeader from "../components/AppHeader";
import ShareDialog from "../components/ShareDialog";
import Toast from "../components/Toast";

// Painel do admin sobre roadmaps (ADR 016). Existe para destravar roadmaps
// órfãos: quando o dono deixa a empresa, ninguém mais consegue editá-los nem
// conceder acesso. Aqui o admin transfere a propriedade e gerencia o
// compartilhamento de qualquer roadmap.
export default function AdminRoadmaps() {
  const [roadmaps, setRoadmaps] = useState<AdminRoadmap[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [transferring, setTransferring] = useState<AdminRoadmap | null>(null);
  const [sharing, setSharing] = useState<AdminRoadmap | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    setLoading(true);
    Promise.all([api.adminListRoadmaps(), api.listUsers()])
      .then(([rms, us]) => { setRoadmaps(rms); setUsers(us); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return roadmaps;
    return roadmaps.filter(rm =>
      rm.name.toLowerCase().includes(q) ||
      rm.ownerName.toLowerCase().includes(q) ||
      rm.ownerEmail.toLowerCase().includes(q));
  }, [roadmaps, filter]);

  async function handleTransfer(rm: AdminRoadmap, newOwnerId: number, keep: boolean) {
    const updated = await api.transferRoadmapOwner(rm.id, { newOwnerId, keepPreviousAsCollaborator: keep });
    setRoadmaps(prev => prev.map(x => x.id === rm.id ? updated : x));
    setTransferring(null);
    showToast(`"${updated.name}" agora é de ${updated.ownerName}`);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <AppHeader
        back={{ to: "/", label: "Roadmaps" }}
        title="Roadmaps (administração)"
        subtitle={`${roadmaps.length} ${roadmaps.length === 1 ? "roadmap" : "roadmaps"} na empresa`}
        actions={<Link to="/admin/users" style={btnLight}>Usuários</Link>}
      />

      <div style={{ padding: 24 }}>
        <div style={infoBox}>
          Transfira a propriedade de roadmaps conforme a necessidade e ajuste o
          compartilhamento. Excluir um roadmap continua sendo exclusividade do dono.
        </div>

        <input
          aria-label="filtrar roadmaps"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filtrar por roadmap, dono ou e-mail…"
          style={{ ...input, maxWidth: 380, margin: "16px 0" }}
        />

        {loading && <div style={{ color: "#64748b" }}>Carregando…</div>}
        {err && <div style={{ color: "#991b1b" }}>{err}</div>}

        {!loading && !err && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <Th>Roadmap</Th><Th>Dono</Th><Th>Iniciativas</Th><Th>Colaboradores</Th><Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map(rm => (
                  <tr key={rm.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <Td>
                      <strong style={{ color: "#0f172a" }}>{rm.name}</strong>
                      {rm.description && (
                        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>{rm.description}</div>
                      )}
                    </Td>
                    <Td>
                      <div style={{ color: "#0f172a" }}>{rm.ownerName}</div>
                      <div style={{ fontSize: 11.5, color: "#64748b" }}>{rm.ownerEmail}</div>
                    </Td>
                    <Td><span style={{ color: "#475569" }}>{rm.itemCount}</span></Td>
                    <Td><span style={{ color: "#475569" }}>{rm.collaboratorCount}</span></Td>
                    <Td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={() => setTransferring(rm)} style={btnSmall}>
                          <UserCog size={13} aria-hidden /> Transferir dono
                        </button>
                        <button onClick={() => setSharing(rm)} style={btnSmall}>
                          <Users2 size={13} aria-hidden /> Gerenciar acesso
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
                {!visible.length && (
                  <tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>
                    {roadmaps.length ? "Nenhum roadmap corresponde ao filtro." : "Nenhum roadmap cadastrado."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {transferring && (
        <TransferOwnerModal
          roadmap={transferring}
          users={users}
          onClose={() => setTransferring(null)}
          onTransfer={handleTransfer}
        />
      )}

      {sharing && (
        <ShareDialog roadmapId={sharing.id} onClose={() => setSharing(null)} />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

function TransferOwnerModal({ roadmap, users, onClose, onTransfer }: {
  roadmap: AdminRoadmap;
  users: AdminUser[];
  onClose: () => void;
  onTransfer: (rm: AdminRoadmap, newOwnerId: number, keep: boolean) => Promise<void>;
}) {
  const [newOwnerId, setNewOwnerId] = useState(0);
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // O dono atual não pode ser escolhido como novo dono.
  const candidates = users
    .filter(u => u.id !== roadmap.ownerId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const submit = async () => {
    if (!newOwnerId) { setErr("Escolha o novo dono"); return; }
    setBusy(true); setErr(null);
    try { await onTransfer(roadmap, newOwnerId, keep); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalCard} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Transferir propriedade</h2>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          <strong style={{ color: "#0f172a" }}>{roadmap.name}</strong> — hoje de {roadmap.ownerName} ({roadmap.ownerEmail}).
        </div>

        <label style={lbl} htmlFor="novo-dono">Novo dono</label>
        <select
          id="novo-dono"
          autoFocus
          value={newOwnerId || ""}
          onChange={e => setNewOwnerId(Number(e.target.value))}
          style={input}
        >
          <option value="">Selecione uma pessoa…</option>
          {candidates.map(u => (
            <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
          ))}
        </select>

        <label style={{ ...chk, marginTop: 16 }}>
          <input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} />
          Manter {roadmap.ownerName} como colaborador com permissão de editar
        </label>
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 6, lineHeight: 1.45 }}>
          Deixe desmarcado quando a pessoa saiu da empresa — ela perde todo o acesso ao roadmap.
        </div>

        {err && <div style={errBox}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={btnGhostDark}>Cancelar</button>
          <button onClick={submit} disabled={busy} style={btnAccent}>{busy ? "Transferindo…" : "Transferir"}</button>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: any }) { return <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{children}</th>; }
function Td({ children }: { children: any }) { return <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>{children}</td>; }

const infoBox: React.CSSProperties = {
  padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe",
  borderRadius: 8, fontSize: 12.5, color: "#1e40af", lineHeight: 1.5,
};
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 };
const modalCard: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 28, width: 480, maxWidth: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 14, outline: "none", background: "#f8fafc", color: "#0f172a", boxSizing: "border-box" };
const chk: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#0f172a", cursor: "pointer", lineHeight: 1.4 };
const errBox: React.CSSProperties = { marginTop: 12, padding: "8px 12px", background: "#fee2e2", color: "#991b1b", fontSize: 12, borderRadius: 6 };
const btnLight: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, background: "#1e293b", color: "#fff", fontSize: 12, fontWeight: 600, textDecoration: "none" };
const btnGhostDark: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnAccent: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnSmall: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 11.5, fontWeight: 600, cursor: "pointer" };
