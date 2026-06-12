import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export type ActionItem = {
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
};

// Ícone de "9 pontos" (grade 3x3). O lucide não tem um equivalente exato
// (o mais próximo, Grip, tem 6 pontos), então desenhamos a grade aqui.
function NineDots() {
  const coords = [5, 12, 19];
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden focusable="false">
      {coords.flatMap(y => coords.map(x => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={2} fill="currentColor" />
      )))}
    </svg>
  );
}

function MenuItem({ item, onRun }: { item: ActionItem; onRun: () => void }) {
  const [hover, setHover] = useState(false);
  const { Icon } = item;
  const color = item.danger ? "#dc2626" : "#0f172a";
  return (
    <button
      role="menuitem"
      type="button"
      onClick={() => { onRun(); item.onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%",
        padding: "8px 12px", border: "none", cursor: "pointer", textAlign: "left",
        background: hover ? (item.danger ? "#fef2f2" : "#f1f5f9") : "transparent",
        color, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
      }}
    >
      <Icon size={15} aria-hidden />
      <span>{item.label}</span>
    </button>
  );
}

// Menu suspenso de ações disparado por um botão de "9 pontos". Fecha ao clicar
// fora ou ao pressionar Esc.
export default function ActionMenu({ items, label = "Ações" }: { items: ActionItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!items.length) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 33, borderRadius: 8, cursor: "pointer",
          border: "1.5px solid #0f172a",
          background: open || hover ? "#0f172a" : "#fff",
          color: open || hover ? "#fff" : "#0f172a",
          transition: "background 120ms, color 120ms",
        }}
      >
        <NineDots />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
            minWidth: 180, background: "#fff", borderRadius: 10,
            border: "1px solid #e2e8f0", boxShadow: "0 12px 32px rgba(15,23,42,0.16)",
            padding: 6, overflow: "hidden",
          }}
        >
          {items.map(it => (
            <MenuItem key={it.label} item={it} onRun={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}
