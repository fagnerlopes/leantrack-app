import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import UserMenu from "./UserMenu";

// AppHeader é o cabeçalho padrão de todas as rotas autenticadas:
// botão "voltar" (quando aplicável), título/subtítulo, ações da página e o menu do usuário.
export default function AppHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { to: string; label?: string };
  actions?: React.ReactNode;
}) {
  return (
    <header style={headerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        {back && <BackButton to={back.to} label={back.label ?? "Voltar"} />}
        <div style={{ minWidth: 0 }}>
          <div style={titleStyle}>{title}</div>
          {subtitle && <div style={subtitleStyle}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {actions}
        <UserMenu />
      </div>
    </header>
  );
}

// BackButton é um botão de voltar evidente e clicável, com seta e rótulo, e realce no hover.
function BackButton({ to, label }: { to: string; label: string }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={to}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...backBtn, ...(hover ? backBtnHover : null) }}
    >
      <span style={{ display: "inline-flex", lineHeight: 1, transform: hover ? "translateX(-2px)" : "none", transition: "transform 120ms" }} aria-hidden>
        <ArrowLeft size={16} />
      </span>
      <span>{label}</span>
    </Link>
  );
}

const headerStyle: React.CSSProperties = {
  background: "#0f172a", color: "#fff", padding: "16px 24px",
  display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
};
const titleStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const subtitleStyle: React.CSSProperties = {
  fontSize: 12, color: "#94a3b8", marginTop: 2,
};
const backBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7,
  padding: "8px 14px", borderRadius: 9,
  background: "#1e293b", border: "1px solid #334155",
  color: "#e2e8f0", fontSize: 13, fontWeight: 600,
  textDecoration: "none", cursor: "pointer", flexShrink: 0,
  transition: "background 120ms, border-color 120ms, color 120ms",
};
const backBtnHover: React.CSSProperties = {
  background: "#334155", borderColor: "#475569", color: "#fff",
};
