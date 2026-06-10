import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Roadmap } from "../api";

const getRoadmap = vi.fn();
const listItems = vi.fn();
const deleteRoadmap = vi.fn();
vi.mock("../api", () => ({
  api: {
    getRoadmap: (id: number) => getRoadmap(id),
    listItems: (id: number) => listItems(id),
    deleteRoadmap: (id: number, slug: string) => deleteRoadmap(id, slug),
  },
}));
vi.mock("../auth", () => ({ useAuth: () => ({ user: { id: 1, name: "Fagner", role: "user" }, logout: vi.fn() }) }));

import RoadmapView from "./RoadmapView";

const base: Roadmap = {
  id: 5, name: "Roadmap Squad Cloud 2026", slug: "roadmap-squad-cloud-2026",
  description: "", ownerId: 9, ownerName: "Eduarda Moraes", itemCount: 3,
  canEdit: false, canShare: false, canDelete: false, isOwner: false,
};

// Conjunto de permissões de um dono (edita, compartilha, exclui).
const ownerPerms = { canEdit: true, canShare: true, canDelete: true, isOwner: true };

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/roadmaps/5-roadmap-squad-cloud-2026"]}>
      <Routes><Route path="/roadmaps/:idSlug" element={<RoadmapView />} /></Routes>
    </MemoryRouter>,
  );
}

describe("RoadmapView", () => {
  beforeEach(() => {
    getRoadmap.mockReset(); listItems.mockReset(); deleteRoadmap.mockReset();
    listItems.mockResolvedValue([]);
  });

  it("renderiza roadmap de outro usuário em modo leitura (sem controles de edição)", async () => {
    getRoadmap.mockResolvedValue({ ...base, canEdit: false });
    renderView();
    await waitFor(() => expect(screen.getByText(/Somente leitura/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "+ Nova iniciativa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir roadmap" })).not.toBeInTheDocument();
  });

  it("mostra controles de edição quando o usuário é o dono", async () => {
    getRoadmap.mockResolvedValue({ ...base, ...ownerPerms });
    renderView();
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Nova iniciativa" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Excluir roadmap" })).toBeInTheDocument();
    expect(screen.queryByText(/Somente leitura/)).not.toBeInTheDocument();
  });

  it("habilita o botão de exclusão somente quando o slug digitado confere", async () => {
    getRoadmap.mockResolvedValue({ ...base, ...ownerPerms });
    deleteRoadmap.mockResolvedValue(undefined);
    renderView();
    await waitFor(() => expect(screen.getByRole("button", { name: "Excluir roadmap" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Excluir roadmap" }));
    const confirmBtn = screen.getByRole("button", { name: "Excluir" });
    expect(confirmBtn).toBeDisabled();

    const field = screen.getByLabelText("confirmar slug");
    await userEvent.type(field, "slug-errado");
    expect(confirmBtn).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, base.slug);
    expect(confirmBtn).toBeEnabled();

    await userEvent.click(confirmBtn);
    await waitFor(() => expect(deleteRoadmap).toHaveBeenCalledWith(5, base.slug));
  });
});
