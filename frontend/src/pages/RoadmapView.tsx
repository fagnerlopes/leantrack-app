import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Item, ItemInput, Roadmap, RoadmapInput } from "../api";
import AppHeader from "../components/AppHeader";
import ShareDialog from "../components/ShareDialog";
import Gantt from "../Gantt";
import ItemModal from "../ItemModal";
import { QUARTERS, calcRisk, dateToFractional } from "../roadmap-utils";
import { parseRoadmapId } from "../roadmap-path";

const emptyForm: ItemInput = {
  title: "", status: "nao-iniciado",
  startDate: null, endDate: null, progress: 0,
  dependencyId: null, notes: "",
  extTeam: null, extDescription: null, extMilestone: null,
  sortOrder: 0, color: null, epicUrl: null,
};

export default function RoadmapView() {
  const { idSlug } = useParams();
  const roadmapId = parseRoadmapId(idSlug);
  const nav = useNavigate();

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [quarterFilter, setQuarterFilter] = useState<string>("all");
  const [riskOnly, setRiskOnly] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const ganttRef = useRef<HTMLDivElement>(null);

  const canEdit = !!roadmap?.canEdit;
  const canShare = !!roadmap?.canShare;
  const canDelete = !!roadmap?.canDelete;
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1800); };

  const reloadItems = useCallback(() => {
    if (roadmapId == null) return;
    api.listItems(roadmapId).then(setItems).catch(() => {});
  }, [roadmapId]);

  useEffect(() => {
    if (roadmapId == null) { setErr("Roadmap inválido"); setLoading(false); return; }
    setLoading(true);
    Promise.all([api.getRoadmap(roadmapId), api.listItems(roadmapId)])
      .then(([rm, its]) => { setRoadmap(rm); setItems(its); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [roadmapId]);

  async function handleSave(input: ItemInput, id?: number) {
    if (roadmapId == null) return;
    try {
      if (id) {
        const updated = await api.updateItem(roadmapId, id, input);
        setItems(prev => prev.map(i => i.id === id ? updated : i));
        showToast("Atualizado ✓");
      } else {
        const created = await api.createItem(roadmapId, input);
        setItems(prev => [...prev, created]);
        showToast("Criado ✓");
      }
      setEditing(null); setCreating(false);
    } catch (e: any) { alert(e.message); }
  }

  async function handleDelete(id: number) {
    if (roadmapId == null) return;
    if (!confirm("Remover este item?")) return;
    try {
      await api.deleteItem(roadmapId, id);
      setItems(prev => prev.filter(i => i.id !== id));
      setEditing(null);
      showToast("Removido");
    } catch (e: any) { alert(e.message); }
  }

  async function handleReorder(_status: string, orderedIds: number[]) {
    if (roadmapId == null) return;
    const entries = orderedIds.map((id, idx) => ({ id, sortOrder: (idx + 1) * 10 }));
    setItems(prev => {
      const map = new Map(entries.map(e => [e.id, e.sortOrder]));
      return prev.map(i => map.has(i.id) ? { ...i, sortOrder: map.get(i.id)! } : i);
    });
    try {
      await api.reorderItems(roadmapId, entries);
    } catch (e: any) {
      alert(`Erro ao reordenar: ${e.message}`);
      reloadItems();
    }
  }

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
          return ef >= q.start && sf <= q.start + q.span;
        });
      }
    }
    if (riskOnly) out = out.filter(i => ["critico", "alerta"].includes(calcRisk(i) as any));
    return out;
  }, [items, statusFilter, quarterFilter, riskOnly]);

  const blockedCount = items.filter(i => calcRisk(i) === "critico").length;
  const alertCount = items.filter(i => calcRisk(i) === "alerta").length;
  const slugForFile = roadmap?.slug || "roadmap";

  async function exportPNG() {
    if (!ganttRef.current) return;
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(ganttRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${slugForFile}-${new Date().toISOString().slice(0, 10)}.png`;
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
    pdf.save(`${slugForFile}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function handleRenameSave(input: RoadmapInput) {
    if (roadmapId == null) return;
    const updated = await api.updateRoadmap(roadmapId, input);
    setRoadmap(updated);
    setRenaming(false);
    showToast("Roadmap atualizado ✓");
  }

  async function handleDeleteRoadmap(confirmSlug: string) {
    if (roadmapId == null) return;
    await api.deleteRoadmap(roadmapId, confirmSlug);
    nav("/");
  }

  if (loading) return <div style={{ padding: 40, color: "#64748b" }}>Carregando…</div>;
  if (err) return (
    <div style={{ padding: 40 }}>
      <div style={{ color: "#991b1b", marginBottom: 16 }}>{err}</div>
      <Link to="/" style={btnLight}>← Voltar</Link>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh" }}>
      <AppHeader
        back={{ to: "/", label: "Roadmaps" }}
        title={roadmap?.name}
        subtitle={`${roadmap?.ownerName} · ${items.length} ${items.length === 1 ? "iniciativa" : "iniciativas"}`}
        actions={
          <>
            {blockedCount > 0 && <span style={chipStyle("#fee2e2", "#991b1b", "#fca5a5")}>⚠ {blockedCount} crítico{blockedCount > 1 ? "s" : ""}</span>}
            {alertCount > 0 && <span style={chipStyle("#fef3c7", "#92400e", "#fcd34d")}>⚡ {alertCount} alerta{alertCount > 1 ? "s" : ""}</span>}
            {canEdit ? (
              <>
                <button onClick={() => setCreating(true)} style={btnAccent}>+ Nova iniciativa</button>
                <button onClick={() => setRenaming(true)} style={btnLight}>Renomear</button>
                {canShare && <button onClick={() => setSharing(true)} style={btnLight}>Compartilhar</button>}
                {canDelete && <button onClick={() => setDeleting(true)} style={btnDanger}>Excluir roadmap</button>}
              </>
            ) : (
              <>
                <span style={readOnlyBadge}>🔒 Somente leitura — roadmap de {roadmap?.ownerName}</span>
                {canShare && <button onClick={() => setSharing(true)} style={btnLight}>Compartilhar</button>}
              </>
            )}
          </>
        }
      />

      <div style={{ padding: "16px 24px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[
          { v: "all", l: "Todos" }, { v: "em-andamento", l: "Em andamento" }, { v: "nao-iniciado", l: "Não iniciado" },
          { v: "concluido", l: "Concluído" }, { v: "pausado", l: "Pausado" },
        ]} />
        <FilterSelect label="Trimestre" value={quarterFilter} onChange={setQuarterFilter} options={[
          { v: "all", l: "Todos" }, ...QUARTERS.map(q => ({ v: q.label, l: q.label })),
        ]} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#0f172a", cursor: "pointer" }}>
          <input type="checkbox" checked={riskOnly} onChange={e => setRiskOnly(e.target.checked)} />
          Apenas em risco
        </label>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={exportPNG} style={btnPrimaryOutline}>Exportar PNG</button>
          <button onClick={exportPDF} style={btnPrimary}>Exportar PDF</button>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {items.length === 0 ? (
          <div style={{ color: "#94a3b8", padding: "40px 0", textAlign: "center" }}>
            {canEdit ? 'Nenhuma iniciativa ainda. Clique em "+ Nova iniciativa".' : "Este roadmap ainda não tem iniciativas."}
          </div>
        ) : (
          <Gantt
            items={filtered}
            innerRef={ganttRef}
            onSelect={canEdit ? (it) => setEditing(it) : undefined}
            onReorder={canEdit ? handleReorder : undefined}
          />
        )}
        {canEdit && items.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8" }}>
            Dica: arraste uma linha para reordenar dentro do mesmo status · clique para editar.
          </div>
        )}
      </div>

      {(editing || creating) && (
        <ItemModal
          initial={editing || ({ ...emptyForm, id: 0 } as Item)}
          allItems={items}
          isNew={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={(input) => handleSave(input, editing?.id)}
          onDelete={editing ? () => handleDelete(editing.id) : undefined}
        />
      )}

      {renaming && roadmap && (
        <RoadmapFormModal
          initial={{ name: roadmap.name, description: roadmap.description }}
          onClose={() => setRenaming(false)}
          onSave={handleRenameSave}
        />
      )}

      {deleting && roadmap && (
        <DeleteRoadmapModal
          roadmap={roadmap}
          onClose={() => setDeleting(false)}
          onConfirm={handleDeleteRoadmap}
        />
      )}

      {sharing && roadmap && (
        <ShareDialog roadmapId={roadmap.id} onClose={() => setSharing(false)} />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#0f172a", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 9999 }}>{toast}</div>
      )}
    </div>
  );
}

function RoadmapFormModal({ initial, onClose, onSave }: { initial: RoadmapInput; onClose: () => void; onSave: (input: RoadmapInput) => Promise<void> }) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) { setErr("Informe um nome"); return; }
    setBusy(true); setErr(null);
    try { await onSave({ name: name.trim(), description: description.trim() }); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalCard} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Editar roadmap</h2>
        <label style={lbl}>Nome</label>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} style={input} />
        <label style={{ ...lbl, marginTop: 14 }}>Descrição (opcional)</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...input, resize: "vertical" as const }} />
        {err && <div style={{ marginTop: 12, padding: "8px 12px", background: "#fee2e2", color: "#991b1b", fontSize: 12, borderRadius: 6 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={btnGhostDark}>Cancelar</button>
          <button onClick={submit} disabled={busy} style={btnAccent}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

function DeleteRoadmapModal({ roadmap, onClose, onConfirm }: { roadmap: Roadmap; onClose: () => void; onConfirm: (confirmSlug: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const matches = text.trim() === roadmap.slug;

  const submit = async () => {
    if (!matches) return;
    setBusy(true); setErr(null);
    try { await onConfirm(text.trim()); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalCard} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#dc2626" }}>Excluir roadmap</h2>
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, marginBottom: 16 }}>
          Esta ação remove <strong>{roadmap.name}</strong> e todas as suas {roadmap.itemCount} iniciativas. Não pode ser desfeita.
          <br />Para confirmar, digite o identificador abaixo:
          <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 13, background: "#f1f5f9", padding: "6px 10px", borderRadius: 6, color: "#0f172a", userSelect: "all" }}>{roadmap.slug}</div>
        </div>
        <input
          autoFocus value={text} onChange={e => setText(e.target.value)}
          placeholder={roadmap.slug}
          aria-label="confirmar slug"
          style={{ ...input, borderColor: text && !matches ? "#fca5a5" : "#e2e8f0" }}
        />
        {err && <div style={{ marginTop: 12, padding: "8px 12px", background: "#fee2e2", color: "#991b1b", fontSize: 12, borderRadius: 6 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={btnGhostDark}>Cancelar</button>
          <button onClick={submit} disabled={!matches || busy} style={{ ...btnDanger, opacity: matches ? 1 : 0.5, cursor: matches ? "pointer" : "not-allowed" }}>
            {busy ? "Excluindo…" : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <span style={{ color: "#64748b" }}>{label}:</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, color: "#0f172a" }}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}

function chipStyle(bg: string, color: string, border: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 700, background: bg, color, padding: "4px 10px", borderRadius: 6, border: `1px solid ${border}` };
}

const readOnlyBadge: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, background: "#1e293b", color: "#cbd5e1",
  padding: "6px 12px", borderRadius: 8, border: "1px solid #334155",
};
const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex",
  alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000,
};
const modalCard: React.CSSProperties = {
  background: "#fff", borderRadius: 14, padding: 28, width: 460, maxWidth: "100%",
  boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#64748b",
  letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0",
  fontSize: 14, outline: "none", background: "#f8fafc", color: "#0f172a", boxSizing: "border-box",
};
const btnLight: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, background: "#1e293b", color: "#fff", fontSize: 12, fontWeight: 600, textDecoration: "none", border: "none", cursor: "pointer" };
const btnGhostDark: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnAccent: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnPrimary: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnPrimaryOutline: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "1.5px solid #0f172a", background: "#fff", color: "#0f172a", fontSize: 12, fontWeight: 600, cursor: "pointer" };
