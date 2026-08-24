import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Lock, Pencil, Share2, Trash2, Zap } from "lucide-react";
import { api } from "../api";
import type { Item, ItemInput, Roadmap, RoadmapInput } from "../api";
import AppHeader from "../components/AppHeader";
import ShareDialog from "../components/ShareDialog";
import Gantt from "../Gantt";
import RoadmapLegend from "../components/RoadmapLegend";
import ItemModal from "../ItemModal";
import ActionMenu, { type ActionItem } from "../components/ActionMenu";
import Toast from "../components/Toast";
import { buildTimeline, calcRisk, applyReorder, fmtDate } from "../roadmap-utils";
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
        showToast("Atualizado");
      } else {
        const created = await api.createItem(roadmapId, input);
        setItems(prev => [...prev, created]);
        showToast("Criado");
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
    // Reordena o array localmente (otimista) para a mudança aparecer na hora —
    // o Gantt renderiza na ordem do array, não pelo valor de sortOrder.
    const { entries } = applyReorder(items, orderedIds);
    setItems(prev => applyReorder(prev, orderedIds).items);
    try {
      await api.reorderItems(roadmapId, entries);
    } catch (e: any) {
      alert(`Erro ao reordenar: ${e.message}`);
      reloadItems();
    }
  }

  // Ajuste de datas pelas alças da barra (ADR 018). A lista é atualizada na
  // hora — o arrasto precisa parecer instantâneo — e desfeita se a gravação
  // falhar, para a tela nunca mostrar uma data que o banco não tem.
  async function handleDatesChange(item: Item, startDate: string, endDate: string) {
    if (roadmapId == null) return;
    const snapshot = items;
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, startDate, endDate } : i)));
    try {
      const { id: _id, ...rest } = { ...item, startDate, endDate };
      const updated = await api.updateItem(roadmapId, item.id, rest);
      setItems(prev => prev.map(i => (i.id === item.id ? updated : i)));
      showToast(`${fmtDate(startDate)} → ${fmtDate(endDate)}`);
    } catch (e: any) {
      setItems(snapshot);
      showToast(`Não foi possível salvar as datas: ${e.message}`);
    }
  }

  // Timeline derivada de TODAS as iniciativas (não das filtradas) para que o
  // intervalo e a lista de trimestres permaneçam estáveis ao aplicar filtros.
  const timeline = useMemo(() => buildTimeline(items), [items]);

  const filtered = useMemo(() => {
    let out = items;
    if (statusFilter !== "all") out = out.filter(i => i.status === statusFilter);
    if (quarterFilter !== "all") {
      const q = timeline.quarters.find(x => x.label === quarterFilter);
      if (q) {
        out = out.filter(i => {
          const sf = timeline.dateToFractional(i.startDate);
          const ef = timeline.dateToFractional(i.endDate);
          if (sf === null || ef === null) return false;
          return ef >= q.start && sf <= q.start + q.span;
        });
      }
    }
    if (riskOnly) out = out.filter(i => ["critico", "alerta"].includes(calcRisk(i) as any));
    return out;
  }, [items, statusFilter, quarterFilter, riskOnly, timeline]);

  const blockedCount = items.filter(i => calcRisk(i) === "critico").length;
  const alertCount = items.filter(i => calcRisk(i) === "alerta").length;
  const slugForFile = roadmap?.slug || "roadmap";

  // Ações do roadmap reunidas no menu suspenso ao lado de "Exportar PDF".
  const actionItems: ActionItem[] = [];
  if (canEdit) actionItems.push({ label: "Renomear", Icon: Pencil, onClick: () => setRenaming(true) });
  if (canShare) actionItems.push({ label: "Compartilhar", Icon: Share2, onClick: () => setSharing(true) });
  if (canDelete) actionItems.push({ label: "Excluir roadmap", Icon: Trash2, onClick: () => setDeleting(true), danger: true });

  // O quadro do roadmap é uma janela com rolagem própria (ver ADR 017): tirar a
  // foto do nó como ele está na tela cortaria a lista na vertical e a timeline
  // na horizontal. Antes de capturar, soltamos as amarras de altura/largura e
  // devolvemos tudo ao estado anterior em seguida — inclusive a rolagem.
  async function captureGantt(): Promise<string | null> {
    const card = ganttRef.current;
    if (!card) return null;
    const { toPng } = await import("html-to-image");
    const opts = { backgroundColor: "#ffffff", pixelRatio: 2 };
    const scroll = card.querySelector<HTMLElement>("[data-gantt-scroll]");
    const content = card.querySelector<HTMLElement>("[data-gantt-content]");
    if (!scroll || !content) return toPng(card, opts);

    const saved = {
      cardHeight: card.style.height,
      cardWidth: card.style.width,
      cardFlex: card.style.flex,
      overflow: scroll.style.overflow,
      flex: scroll.style.flex,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
    };
    // `flex: none` nos dois é essencial: como itens de um contêiner flex de
    // altura definida, card e área de rolagem seriam comprimidos de volta ao
    // tamanho da janela visível — e a foto sairia cortada na vertical.
    card.style.height = "auto";
    card.style.width = `${content.scrollWidth}px`;
    card.style.flex = "none";
    scroll.style.overflow = "visible";
    scroll.style.flex = "none";
    try {
      return await toPng(card, opts);
    } finally {
      card.style.height = saved.cardHeight;
      card.style.width = saved.cardWidth;
      card.style.flex = saved.cardFlex;
      scroll.style.overflow = saved.overflow;
      scroll.style.flex = saved.flex;
      scroll.scrollLeft = saved.scrollLeft;
      scroll.scrollTop = saved.scrollTop;
    }
  }

  async function exportPNG() {
    const dataUrl = await captureGantt();
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${slugForFile}-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
  }

  async function exportPDF() {
    const dataUrl = await captureGantt();
    if (!dataUrl) return;
    const { jsPDF } = await import("jspdf");
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
    showToast("Roadmap atualizado");
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
      <Link to="/" style={{ ...btnLight, display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14} aria-hidden /> Voltar</Link>
    </div>
  );

  return (
    <div className="rm-shell" style={{ display: "flex", flexDirection: "column" }}>
      <AppHeader
        back={{ to: "/", label: "Roadmaps" }}
        title={roadmap?.name}
        subtitle={`${roadmap?.ownerName} · ${items.length} ${items.length === 1 ? "iniciativa" : "iniciativas"}`}
        actions={
          <>
            {blockedCount > 0 && <span style={chipStyle("#fee2e2", "#991b1b", "#fca5a5")}><AlertTriangle size={12} aria-hidden /> {blockedCount} crítico{blockedCount > 1 ? "s" : ""}</span>}
            {alertCount > 0 && <span style={chipStyle("#fef3c7", "#92400e", "#fcd34d")}><Zap size={12} aria-hidden /> {alertCount} alerta{alertCount > 1 ? "s" : ""}</span>}
            {canEdit ? (
              <button onClick={() => setCreating(true)} style={btnAccent}>+ Nova iniciativa</button>
            ) : (
              <span style={readOnlyBadge}><Lock size={13} aria-hidden /> Somente leitura — roadmap de {roadmap?.ownerName}</span>
            )}
          </>
        }
      />

      <div style={{ padding: "16px 24px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", background: "#fff", borderBottom: "1px solid #e2e8f0", flexShrink: 0, position: "relative", zIndex: 60 }}>
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[
          { v: "all", l: "Todos" }, { v: "em-andamento", l: "Em andamento" }, { v: "nao-iniciado", l: "Não iniciado" },
          { v: "concluido", l: "Concluído" }, { v: "pausado", l: "Pausado" },
        ]} />
        <FilterSelect label="Trimestre" value={quarterFilter} onChange={setQuarterFilter} options={[
          { v: "all", l: "Todos" }, ...timeline.quarters.map(q => ({ v: q.label, l: q.label })),
        ]} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#0f172a", cursor: "pointer" }}>
          <input type="checkbox" checked={riskOnly} onChange={e => setRiskOnly(e.target.checked)} />
          Apenas em risco
        </label>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={exportPNG} style={btnPrimaryOutline}>Exportar PNG</button>
          <button onClick={exportPDF} style={btnPrimary}>Exportar PDF</button>
          <ActionMenu items={actionItems} />
        </div>
      </div>

      <div className="rm-main" style={{ padding: 24 }}>
        {items.length === 0 ? (
          <div style={{ color: "#94a3b8", padding: "40px 0", textAlign: "center" }}>
            {canEdit ? 'Nenhuma iniciativa ainda. Clique em "+ Nova iniciativa".' : "Este roadmap ainda não tem iniciativas."}
          </div>
        ) : (
          <Gantt
            items={filtered}
            timeline={timeline}
            innerRef={ganttRef}
            onSelect={canEdit ? (it) => setEditing(it) : undefined}
            onReorder={canEdit ? handleReorder : undefined}
            onDatesChange={canEdit ? handleDatesChange : undefined}
          />
        )}
      </div>

      {items.length > 0 && (
        <div style={{ padding: "0 24px 10px", fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>
          Dica: arraste a timeline para navegar no tempo{canEdit ? " · arraste as pontas da barra para mudar as datas (ou a barra inteira para deslocá-la) · arraste o título da iniciativa para reordenar dentro do mesmo status · clique para editar" : ""}.
        </div>
      )}

      <RoadmapLegend />

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

      {toast && <Toast message={toast} />}
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
  return { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, background: bg, color, padding: "4px 10px", borderRadius: 6, border: `1px solid ${border}` };
}

const readOnlyBadge: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
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
