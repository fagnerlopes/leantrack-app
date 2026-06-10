import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Roadmap } from "../api";

const listRoadmaps = vi.fn();
const listSharedRoadmaps = vi.fn();
vi.mock("../api", () => ({ api: {
  listRoadmaps: (mine: boolean) => listRoadmaps(mine),
  listSharedRoadmaps: () => listSharedRoadmaps(),
} }));
vi.mock("../auth", () => ({ useAuth: () => ({ user: { id: 1, name: "Fagner", role: "user" }, logout: vi.fn() }) }));

import RoadmapList from "./RoadmapList";

const sample: Roadmap[] = [
  { id: 3, name: "Roadmap VPS 2026", slug: "roadmap-vps-2026", description: "", ownerId: 1, ownerName: "Fagner", itemCount: 4, canEdit: true, canShare: true, canDelete: true, isOwner: true },
];
const shared: Roadmap[] = [
  { id: 9, name: "Roadmap da Eduarda", slug: "roadmap-da-eduarda", description: "", ownerId: 2, ownerName: "Eduarda", itemCount: 7, canEdit: true, canShare: false, canDelete: false, isOwner: false },
];

function renderList() {
  return render(<MemoryRouter><RoadmapList /></MemoryRouter>);
}

describe("RoadmapList", () => {
  beforeEach(() => {
    listRoadmaps.mockReset(); listRoadmaps.mockResolvedValue(sample);
    listSharedRoadmaps.mockReset(); listSharedRoadmaps.mockResolvedValue(shared);
  });

  it('inicia na aba "Meus roadmaps" (carrega mine=true)', async () => {
    renderList();
    await waitFor(() => expect(listRoadmaps).toHaveBeenCalledWith(true));
    expect(screen.getByText("Roadmap VPS 2026")).toBeInTheDocument();
  });

  it('troca para "Todos os roadmaps" (carrega mine=false)', async () => {
    renderList();
    await waitFor(() => expect(listRoadmaps).toHaveBeenCalledWith(true));
    await userEvent.click(screen.getByText("Todos os roadmaps"));
    await waitFor(() => expect(listRoadmaps).toHaveBeenCalledWith(false));
  });

  it('mostra "Compartilhados comigo" ao trocar de aba', async () => {
    renderList();
    await waitFor(() => expect(listRoadmaps).toHaveBeenCalledWith(true));
    await userEvent.click(screen.getByText("Compartilhados comigo"));
    await waitFor(() => expect(listSharedRoadmaps).toHaveBeenCalled());
    expect(screen.getByText("Roadmap da Eduarda")).toBeInTheDocument();
  });
});
