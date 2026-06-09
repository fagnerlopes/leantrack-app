import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import AppHeader from "../components/AppHeader";

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) { setErr("Informe seu nome"); return; }
    if (password) {
      if (password.length < 8) { setErr("A nova senha deve ter ao menos 8 caracteres"); return; }
      if (password !== confirm) { setErr("As senhas não conferem"); return; }
    }
    setBusy(true);
    try {
      const updated = await api.updateProfile({ name: name.trim(), password: password || undefined });
      updateUser(updated);
      const changedPwd = !!password;
      setPassword(""); setConfirm(""); setShow(false);
      showToast(changedPwd ? "Perfil e senha atualizados ✓" : "Perfil atualizado ✓");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <AppHeader back={{ to: "/", label: "Roadmaps" }} title="Perfil" subtitle="Sua conta" />

      <div style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}>
        <form onSubmit={submit} style={card}>
          <section>
            <h2 style={sectionTitle}>Dados da conta</h2>

            <label style={lbl}>Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} style={input} />

            <label style={{ ...lbl, marginTop: 14 }}>E-mail</label>
            <input value={user?.email ?? ""} disabled style={{ ...input, background: "#f1f5f9", color: "#94a3b8", cursor: "not-allowed" }} />
            <div style={hint}>O e-mail não pode ser alterado por aqui.</div>
          </section>

          <div style={{ height: 1, background: "#f1f5f9", margin: "24px 0" }} />

          <section>
            <h2 style={sectionTitle}>Alterar senha</h2>
            <div style={hint}>Deixe em branco para manter a senha atual.</div>

            <label style={{ ...lbl, marginTop: 14 }}>Nova senha</label>
            <div style={{ position: "relative" }}>
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo de 8 caracteres"
                autoComplete="new-password"
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
          </section>

          {err && <div style={errBox}>{err}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <button type="submit" disabled={busy} style={{ ...btnAccent, opacity: busy ? 0.7 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
              {busy ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </form>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#0f172a", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 9999 }}>{toast}</div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: 28,
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};
const sectionTitle: React.CSSProperties = { margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#0f172a" };
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#64748b",
  letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6,
};
const hint: React.CSSProperties = { fontSize: 12, color: "#94a3b8", marginTop: 6 };
const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0",
  fontSize: 14, outline: "none", background: "#f8fafc", color: "#0f172a", boxSizing: "border-box",
};
const toggleBtn: React.CSSProperties = {
  position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)",
  border: "none", background: "transparent", color: "#3b82f6", fontSize: 12, fontWeight: 600, cursor: "pointer",
  padding: "4px 6px",
};
const errBox: React.CSSProperties = {
  marginTop: 16, padding: "8px 12px", background: "#fee2e2", color: "#991b1b", fontSize: 12, borderRadius: 6,
};
const btnAccent: React.CSSProperties = { padding: "9px 18px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
