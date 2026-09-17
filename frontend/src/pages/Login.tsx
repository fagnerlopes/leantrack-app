import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import Turnstile from "../components/Turnstile";

export default function Login() {
  const { login, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const nav = useNavigate();
  const loc = useLocation() as any;

  useEffect(() => {
    api
      .publicConfig()
      .then((c) => setSiteKey(c.turnstileSiteKey || null))
      .catch(() => {});
  }, []);

  if (loading) return null;
  if (user) {
    const to = loc.state?.from?.pathname || "/";
    return <Navigate to={to} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (siteKey && !turnstileToken) {
      setErr("Resolva a verificação de segurança antes de entrar");
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password, turnstileToken || undefined);
      const to = loc.state?.from?.pathname || "/";
      nav(to, { replace: true });
    } catch (e: any) {
      setErr(e.message || "erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", padding: 20,
    }}>
      <form onSubmit={onSubmit} style={{
        background: "#fff", borderRadius: 16, padding: 36, width: 380, maxWidth: "100%",
        boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>LeanTrack</h1>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Acesso restrito</div>
        </div>

        <label htmlFor="login-email" style={lblStyle}>Email</label>
        <input
          id="login-email"
          type="email" autoComplete="username" value={email}
          onChange={e => setEmail(e.target.value)}
          required style={inputStyle}
        />

        <label htmlFor="login-password" style={{ ...lblStyle, marginTop: 14 }}>Senha</label>
        <input
          id="login-password"
          type="password" autoComplete="current-password" value={password}
          onChange={e => setPassword(e.target.value)}
          required style={inputStyle}
        />

        {siteKey && (
          <div style={{ marginTop: 16 }}>
            <Turnstile siteKey={siteKey} onToken={setTurnstileToken} />
          </div>
        )}

        {err && <div style={{ marginTop: 12, padding: "8px 12px", background: "#fee2e2", color: "#991b1b", fontSize: 12, borderRadius: 6 }}>{err}</div>}

        <button type="submit" disabled={busy} style={{
          marginTop: 22, width: "100%", padding: "11px 16px", borderRadius: 8,
          border: "none", background: busy ? "#475569" : "#0f172a", color: "#fff",
          fontSize: 14, fontWeight: 600, cursor: busy ? "wait" : "pointer",
        }}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

const lblStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#64748b",
  letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1.5px solid #e2e8f0", fontSize: 14, outline: "none",
  background: "#f8fafc", color: "#0f172a",
};
