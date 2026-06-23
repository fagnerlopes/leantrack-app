import { useEffect, useState } from "react";
import { api } from "../api";
import type { AdminUser } from "../api";
import { useAuth } from "../auth";
import AppHeader from "../components/AppHeader";
import Toast from "../components/Toast";
import { validatePassword, generatePassword, PASSWORD_POLICY_MSG } from "../lib/password";

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2000); };
  const reload = () => {
    setLoading(true);
    api.listUsers().then(setUsers).catch(e => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  async function handleCreate(input: { name: string; email: string; password: string; role: string }) {
    const u = await api.createUser(input);
    setUsers(prev => [...prev, u]);
    setCreating(false);
    showToast("Usuário criado");
  }

  async function handleRole(u: AdminUser, role: string) {
    try {
      const updated = await api.updateUserRole(u.id, role);
      setUsers(prev => prev.map(x => x.id === u.id ? updated : x));
      showToast("Papel atualizado");
    } catch (e: any) { alert(e.message); }
  }

  async function handleReset(u: AdminUser, password: string) {
    await api.resetUserPassword(u.id, password);
    setResetting(null);
    showToast(`Senha de ${u.name} redefinida`);
  }

  async function handleDelete(u: AdminUser) {
    if (!confirm(`Remover ${u.name}? Os roadmaps e iniciativas dele também serão removidos.`)) return;
    try {
      await api.deleteUser(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      showToast("Usuário removido");
    } catch (e: any) { alert(e.message); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <AppHeader
        back={{ to: "/", label: "Roadmaps" }}
        title="Usuários"
        subtitle={`${users.length} ${users.length === 1 ? "conta" : "contas"}`}
        actions={<button onClick={() => setCreating(true)} style={btnAccent}>+ Novo usuário</button>}
      />

      <div style={{ padding: 24 }}>
        {loading && <div style={{ color: "#64748b" }}>Carregando…</div>}
        {err && <div style={{ color: "#991b1b" }}>{err}</div>}
        {!loading && !err && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr><Th>Nome</Th><Th>E-mail</Th><Th>Papel</Th><Th>Origem</Th><Th>Ações</Th></tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isSelf = u.id === user?.id;
                  return (
                    <tr key={u.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <Td><strong>{u.name}</strong>{isSelf && <span style={{ fontSize: 11, color: "#94a3b8" }}> (você)</span>}</Td>
                      <Td>{u.email}</Td>
                      <Td>
                        <select value={u.role} onChange={e => handleRole(u, e.target.value)}
                          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12, background: "#fff", color: "#0f172a" }}>
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </Td>
                      <Td><span style={{ fontSize: 11, color: "#64748b" }}>{u.authProvider}</span></Td>
                      <Td>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => setResetting(u)} style={btnSmall}>
                            Resetar senha
                          </button>
                          <button onClick={() => handleDelete(u)} disabled={isSelf}
                            style={{ ...btnSmallDanger, opacity: isSelf ? 0.4 : 1, cursor: isSelf ? "not-allowed" : "pointer" }}>
                            Remover
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
                {!users.length && <tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>Nenhum usuário.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && <CreateUserModal onClose={() => setCreating(false)} onCreate={handleCreate} />}

      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} onReset={handleReset} />}

      {toast && <Toast message={toast} />}
    </div>
  );
}

function CreateUserModal({ onClose, onCreate }: { onClose: () => void; onCreate: (input: { name: string; email: string; password: string; role: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !email.trim()) { setErr("Nome e e-mail são obrigatórios"); return; }
    const msg = validatePassword(password);
    if (msg) { setErr(msg); return; }
    setBusy(true); setErr(null);
    try { await onCreate({ name: name.trim(), email: email.trim(), password, role }); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalCard} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Novo usuário</h2>
        <label style={lbl}>Nome</label>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} style={input} />
        <label style={{ ...lbl, marginTop: 14 }}>E-mail</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={input} />
        <label style={{ ...lbl, marginTop: 14 }}>Senha temporária</label>
        <PasswordField value={password} onChange={setPassword} />
        <KeeperNote />
        <label style={{ ...lbl, marginTop: 14 }}>Papel</label>
        <select value={role} onChange={e => setRole(e.target.value)} style={input}>
          <option value="user">user — cria e edita os próprios roadmaps</option>
          <option value="admin">admin — também gerencia contas</option>
        </select>
        {err && <div style={{ marginTop: 12, padding: "8px 12px", background: "#fee2e2", color: "#991b1b", fontSize: 12, borderRadius: 6 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={btnGhostDark}>Cancelar</button>
          <button onClick={submit} disabled={busy} style={btnAccent}>{busy ? "Criando…" : "Criar"}</button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onReset }: { user: AdminUser; onClose: () => void; onReset: (u: AdminUser, password: string) => Promise<void> }) {
  const [password, setPassword] = useState(() => generatePassword());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const msg = validatePassword(password);
    if (msg) { setErr(msg); return; }
    setBusy(true); setErr(null);
    try { await onReset(user, password); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalCard} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Resetar senha</h2>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          Defina uma senha temporária para <strong>{user.name}</strong>. Ele será obrigado
          a trocá-la no próximo acesso.
        </div>
        <label style={lbl}>Senha temporária</label>
        <PasswordField value={password} onChange={setPassword} showGenerate />
        <KeeperNote />
        {err && <div style={{ marginTop: 12, padding: "8px 12px", background: "#fee2e2", color: "#991b1b", fontSize: 12, borderRadius: 6 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={btnGhostDark}>Cancelar</button>
          <button onClick={submit} disabled={busy} style={btnAccent}>{busy ? "Salvando…" : "Definir senha"}</button>
        </div>
      </div>
    </div>
  );
}

// PasswordField mostra a senha em texto (o admin precisa repassá-la), com botões
// para gerar uma nova senha forte e copiar para a área de transferência.
function PasswordField({ value, onChange, showGenerate }: { value: string; onChange: (v: string) => void; showGenerate?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={value} onChange={e => onChange(e.target.value)} style={{ ...input, fontFamily: "ui-monospace, monospace" }} />
        <button type="button" onClick={copy} style={btnGhostDark} title="Copiar">{copied ? "Copiado" : "Copiar"}</button>
      </div>
      <button type="button" onClick={() => onChange(generatePassword())} style={{ ...btnGenerate, marginTop: 8 }}>
        ↻ {showGenerate ? "Gerar outra senha" : "Gerar senha forte"}
      </button>
      <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 8 }}>{PASSWORD_POLICY_MSG}</div>
    </div>
  );
}

function KeeperNote() {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, padding: "10px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e", lineHeight: 1.45 }}>
      <span style={{ fontSize: 15, lineHeight: 1 }}>🔑</span>
      <div>Salve esta senha no <strong>Keeper</strong> e repasse ao usuário com segurança. Não há recuperação de senha por e-mail.</div>
    </div>
  );
}

function Th({ children }: { children: any }) { return <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{children}</th>; }
function Td({ children }: { children: any }) { return <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>{children}</td>; }

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 };
const modalCard: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 28, width: 440, maxWidth: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 14, outline: "none", background: "#f8fafc", color: "#0f172a", boxSizing: "border-box" };
const btnGhostDark: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnAccent: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnSmallDanger: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontSize: 11, fontWeight: 600 };
const btnSmall: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const btnGenerate: React.CSSProperties = { padding: "6px 12px", borderRadius: 6, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer" };
