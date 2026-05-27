import { useEffect, useRef, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Item, ItemInput } from "../api";
import { useAuth } from "../auth";
import Gantt from "../Gantt";
import ItemModal from "../ItemModal";
import { QUARTERS, calcRisk, dateToFractional } from "../roadmap-utils";

export default function Roadmap() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [quarterFilter, setQuarterFilter] = useState<string>("all");
  const [riskOnly, setRiskOnly] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const ganttRef = useRef<HTMLDivElement>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1800); };

  async function handleSave(input: ItemInput, id?: number) {
    try {
      if (id) {
        const updated = await api.updateItem(id, input);
        setItems(prev => prev.map(i => i.id === id ? updated : i));
        showToast("Atualizado ✓");
      }
      setEditing(null);
    } catch (e: any) { alert(e.message); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remover este item?")) return;
    try {
      await api.deleteItem(id);
      setItems(prev => prev.filter(i => i.id !== id));
      setEditing(null);
      showToast("Removido");
    } catch (e: any) { alert(e.message); }
  }

  async function handleReorder(_status: string, orderedIds: number[]) {
    // Compute new sortOrder by index (10, 20, 30...) and persist.
    const entries = orderedIds.map((id, idx) => ({ id, sortOrder: (idx + 1) * 10 }));
    // Optimistic update
    setItems(prev => {
      const map = new Map(entries.map(e => [e.id, e.sortOrder]));
      return prev.map(i => map.has(i.id) ? { ...i, sortOrder: map.get(i.id)! } : i);
    });
    try {
      await api.reorderItems(entries);
    } catch (e: any) {
      alert(`Erro ao reordenar: ${e.message}`);
      // Reload to recover the true order
      api.listItems().then(setItems).catch(() => {});
    }
  }

  useEffect(() => {
    api.listItems()
      .then(setItems)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let out = items;
    if (statusFilter !== "all") out = out.filter(i => i.status === statusFilter);
    if (quarterFilter !== "all") {
      const q = QUARTERS.find(x => x.label === quarterFilter);
      if (q) {
        out = out.filter(i => {
          const sf = dateToFractional(i.startDate);
          const ef = dateToFractional(i.endDate);
          if (sf === null || ef === null) return false;
          // overlap [sf,ef] with [q.start, q.start+q.span]
          return ef >= q.start && sf <= q.start + q.span;
        });
      }
    }
    if (riskOnly) out = out.filter(i => ["critico","alerta"].includes(calcRisk(i) as any));
    return out;
  }, [items, statusFilter, quarterFilter, riskOnly]);

  const blockedCount = items.filter(i => calcRisk(i) === "critico").length;
  const alertCount   = items.filter(i => calcRisk(i) === "alerta").length;

  async function exportPNG() {
    if (!ganttRef.current) return;
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(ganttRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `roadmap-squad-cloud-${new Date().toISOString().slice(0,10)}.png`;
    link.click();
  }

  async function exportPDF() {
    if (!ganttRef.current) return;
    const { toPng } = await import("html-to-image");
    const { jsPDF } = await import("jspdf");
    const dataUrl = await toPng(ganttRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
    const img = new Image();
    img.src = dataUrl;
    await new Promise(res => (img.onload = res));
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [img.width, img.height] });
    pdf.addImage(dataUrl, "PNG", 0, 0, img.width, img.height);
    pdf.save(`roadmap-squad-cloud-${new Date().toISOString().slice(0,10)}.pdf`);
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{
        background: "#0f172a", color: "#fff", padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Roadmap · Squad Cloud</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            Mai 2026 — Q2 2027 · {items.length} {items.length === 1 ? "iniciativa" : "iniciativas"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {blockedCount > 0 && (
            <span style={chipStyle("#fee2e2", "#991b1b", "#fca5a5")}>⚠ {blockedCount} crítico{blockedCount > 1 ? "s" : ""}</span>
          )}
          {alertCount > 0 && (
            <span style={chipStyle("#fef3c7", "#92400e", "#fcd34d")}>⚡ {alertCount} alerta{alertCount > 1 ? "s" : ""}</span>
          )}
          {user?.role === "admin" && (
            <Link to="/admin" style={btnLight}>Dashboard</Link>
          )}
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{user?.name}</span>
          <button onClick={logout} style={btnGhost}>Sair</button>
        </div>
      </header>

      <div style={{ padding: "16px 24px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[
          { v: "all", l: "Todos" }, { v: "em-andamento", l: "Em andamento" }, { v: "nao-iniciado", l: "Não iniciado" },
          { v: "concluido", l: "Concluído" }, { v: "pausado", l: "Pausado" },
        ]}/>
        <FilterSelect label="Trimestre" value={quarterFilter} onChange={setQuarterFilter} options={[
          { v: "all", l: "Todos" }, ...QUARTERS.map(q => ({ v: q.label, l: q.label })),
        ]}/>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#0f172a", cursor: "pointer" }}>
          <input type="checkbox" checked={riskOnly} onChange={e => setRiskOnly(e.target.checked)}/>
          Apenas em risco
        </label>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={exportPNG} style={btnPrimaryOutline}>Exportar PNG</button>
          <button onClick={exportPDF} style={btnPrimary}>Exportar PDF</button>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {loading && <div style={{ color: "#64748b" }}>Carregando…</div>}
        {err && <div style={{ color: "#991b1b" }}>{err}</div>}
        {!loading && !err && (
          <Gantt
            items={filtered}
            innerRef={ganttRef}
            onSelect={isAdmin ? (it) => setEditing(it) : undefined}
            onReorder={isAdmin ? handleReorder : undefined}
          />
        )}
        {isAdmin && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8" }}>
            Dica: arraste uma linha para reordenar dentro do mesmo status · clique para editar.
          </div>
        )}
      </div>

      {editing && (
        <ItemModal
          initial={editing}
          allItems={items}
          isNew={false}
          onClose={() => setEditing(null)}
          onSave={(input) => handleSave(input, editing.id)}
          onDelete={() => handleDelete(editing.id)}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, background: "#0f172a", color: "#fff",
          padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 9999,
        }}>{toast}</div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <span style={{ color: "#64748b" }}>{label}:</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        padding: "5px 8px", borderRadius: 6, border: "1px solid #e2e8f0",
        background: "#fff", fontSize: 12, color: "#0f172a",
      }}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}

function chipStyle(bg: string, color: string, border: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 700, background: bg, color, padding: "4px 10px", borderRadius: 6, border: `1px solid ${border}` };
}

const btnLight: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, background: "#1e293b", color: "#fff",
  fontSize: 12, fontWeight: 600, textDecoration: "none",
};
const btnGhost: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, border: "1px solid #334155",
  background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 8, border: "none", background: "#0f172a",
  color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const btnPrimaryOutline: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 8, border: "1.5px solid #0f172a", background: "#fff",
  color: "#0f172a", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
