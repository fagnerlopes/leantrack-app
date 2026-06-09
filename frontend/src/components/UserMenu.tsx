import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

// initials extrai até duas iniciais do nome para o avatar.
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// UserMenu mostra o avatar (iniciais) e um menu suspenso com Perfil e Sair.
export default function UserMenu() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!user) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Menu do usuário"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.name}
        style={avatarBtn}
      >
        {initials(user.name)}
      </button>

      {open && (
        <div role="menu" style={menu}>
          <div style={menuHead}>
            <div style={avatarSm}>{initials(user.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
              <div style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
            </div>
          </div>
          <div style={{ height: 1, background: "#f1f5f9" }} />
          <button role="menuitem" style={menuItem} onClick={() => { setOpen(false); nav("/perfil"); }}>
            Perfil
          </button>
          <button role="menuitem" style={{ ...menuItem, color: "#dc2626" }} onClick={() => { setOpen(false); logout(); }}>
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

const avatarBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: "50%", border: "1px solid #334155",
  background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 700,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  letterSpacing: "0.02em",
};
const avatarSm: React.CSSProperties = {
  width: 34, height: 34, borderRadius: "50%", background: "#3b82f6", color: "#fff",
  fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};
const menu: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 10px)", right: 0, width: 240,
  background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)", padding: 6, zIndex: 1000, overflow: "hidden",
};
const menuHead: React.CSSProperties = {
  display: "flex", gap: 10, alignItems: "center", padding: "10px 10px 12px",
};
const menuItem: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", padding: "9px 10px",
  borderRadius: 8, border: "none", background: "transparent", color: "#0f172a",
  fontSize: 13, fontWeight: 600, cursor: "pointer",
};
