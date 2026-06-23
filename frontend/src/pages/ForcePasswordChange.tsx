import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import { validatePassword, PASSWORD_POLICY_MSG } from "../lib/password";

// Tela bloqueante exibida no primeiro acesso após o admin definir/resetar a
// senha. Enquanto user.mustChangePassword for true, o App redireciona qualquer
// rota para cá; só liberamos o app depois que o usuário escolhe a nova senha.
export default function ForcePasswordChange() {
  const { user, loading, updateUser, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // Já trocou (ou nunca precisou): não há por que ficar nesta tela.
  if (!user.mustChangePassword) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const msg = validatePassword(password);
    if (msg) { setErr(msg); return; }
    if (password !== confirm) { setErr("As senhas não conferem."); return; }
    setBusy(true);
    try {
      const updated = await api.changePassword(password);
      updateUser(updated);
      nav("/", { replace: true });
    } catch (e: any) {
      setErr(e.message || "erro");
      setBusy(false);
    }
  };

  return (
    <div style={page}>
      <form onSubmit={onSubmit} style={card}>
        <div style={{ marginBottom: 20 }}>
          <div style={badge}>Primeiro acesso</div>
          <h1 style={{ margin: "12px 0 4px", fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
            Defina sua nova senha
          </h1>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Sua senha atual é temporária. Escolha uma nova para continuar.
          </div>
        </div>

        {/* Alerta para salvar a senha no Keeper. */}
        <div style={keeperBox}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>🔑</span>
          <div>
            <strong style={{ display: "block", marginBottom: 2 }}>Guarde sua senha no Keeper</strong>
            Não há recuperação de senha por e-mail. Antes de continuar, salve a nova
            senha no <strong>Keeper</strong> para não perder o acesso.
          </div>
        </div>

        <label style={lbl}>Nova senha</label>
        <div style={{ position: "relative" }}>
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={`Mínimo de 12 caracteres`}
            autoComplete="new-password"
            autoFocus
            style={{ ...input, paddingRight: 70 }}
          />
          <button type="button" onClick={() => setShow(s => !s)} style={toggleBtn}>
            {show ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        <label style={{ ...lbl, marginTop: 14 }}>Confirmar nova senha</label>
        <input
          type={show ? "text" : "password"}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Repita a nova senha"
          autoComplete="new-password"
          style={input}
        />

        <div style={rule}>{PASSWORD_POLICY_MSG}</div>

        {err && <div style={errBox}>{err}</div>}

        <button type="submit" disabled={busy} style={{ ...submitBtn, opacity: busy ? 0.7 : 1, cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Salvando…" : "Salvar e entrar"}
        </button>

        <button type="button" onClick={() => logout()} style={logoutBtn}>
          Sair
        </button>
      </form>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
  background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", padding: 20,
};
const card: React.CSSProperties = {
  background: "#fff", borderRadius: 16, padding: 36, width: 420, maxWidth: "100%",
  boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
};
const badge: React.CSSProperties = {
  display: "inline-block", fontSize: 11, fontWeight: 700, color: "#3b82f6",
  background: "#eff6ff", padding: "4px 10px", borderRadius: 999, letterSpacing: "0.05em",
  textTransform: "uppercase",
};
const keeperBox: React.CSSProperties = {
  display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 22,
  padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a",
  borderRadius: 10, fontSize: 12.5, color: "#92400e", lineHeight: 1.45,
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#64748b",
  letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0",
  fontSize: 14, outline: "none", background: "#f8fafc", color: "#0f172a", boxSizing: "border-box",
};
const toggleBtn: React.CSSProperties = {
  position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)",
  border: "none", background: "transparent", color: "#3b82f6", fontSize: 12, fontWeight: 600,
  cursor: "pointer", padding: "4px 6px",
};
const rule: React.CSSProperties = { fontSize: 11.5, color: "#94a3b8", marginTop: 10 };
const errBox: React.CSSProperties = {
  marginTop: 14, padding: "8px 12px", background: "#fee2e2", color: "#991b1b", fontSize: 12, borderRadius: 6,
};
const submitBtn: React.CSSProperties = {
  marginTop: 20, width: "100%", padding: "11px 16px", borderRadius: 8, border: "none",
  background: "#0f172a", color: "#fff", fontSize: 14, fontWeight: 600,
};
const logoutBtn: React.CSSProperties = {
  marginTop: 10, width: "100%", padding: "9px 16px", borderRadius: 8, border: "1px solid #e2e8f0",
  background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
