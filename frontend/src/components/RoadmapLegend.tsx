import { STATUS_META } from "../roadmap-utils";

// Barra de legenda fixada como rodapé da página (ver RoadmapView). Fica sempre
// na base, independente da quantidade de iniciativas.
export default function RoadmapLegend() {
  return (
    <div
      role="contentinfo"
      style={{
        display: "flex", gap: 14, padding: "14px 24px", flexWrap: "wrap",
        borderTop: "1px solid #e2e8f0", background: "#fff",
        alignItems: "center", justifyContent: "center",
      }}
    >
      {Object.values(STATUS_META).map(m => (
        <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: m.color }} />
          <span style={{ fontSize: 11, color: "#64748b" }}>{m.label}</span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ width: 12, borderTop: "2px dashed #dc2626" }} />
        <span style={{ fontSize: 11, color: "#64748b" }}>Bloqueado (crítico)</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ width: 10, height: 10, background: "#dc2626", transform: "rotate(45deg)", borderRadius: 2 }} />
        <span style={{ fontSize: 11, color: "#64748b" }}>Marco externo</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ width: 2, height: 12, background: "#ef4444" }} />
        <span style={{ fontSize: 11, color: "#64748b" }}>Hoje</span>
      </div>
    </div>
  );
}
