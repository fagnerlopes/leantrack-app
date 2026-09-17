import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AdminRoadmap, AdminUser } from "../api";

const adminListRoadmaps = vi.fn();
const listUsers = vi.fn();
const transferRoadmapOwner = vi.fn();
const listCollaborators = vi.fn();

vi.mock("../api", () => ({
  api: {
    adminListRoadmaps: () => adminListRoadmaps(),
    listUsers: () => listUsers(),
    transferRoadmapOwner: (id: number, input: any) => transferRoadmapOwner(id, input),
    listCollaborators: (id: number) => listCollaborators(id),
  },
}));
vi.mock("../auth", () => ({ useAuth: () => ({ user: { id: 1, name: "Ana", role: "admin" }, logout: vi.fn() }) }));

import AdminRoadmaps from "./AdminRoadmaps";

const roadmaps: AdminRoadmap[] = [
  {
    id: 7, name: "Roadmap VPS 2026", slug: "roadmap-vps-2026", description: "",
    ownerId: 42, ownerName: "Quem Saiu", ownerEmail: "saiu@x.com",
    itemCount: 14, collaboratorCount: 0,
  },
  {
    id: 8, name: "Roadmap Plataforma", slug: "roadmap-plataforma", description: "",
    ownerId: 2, ownerName: "Bruno", ownerEmail: "bruno@x.com",
    itemCount: 23, collaboratorCount: 2,
  },
];

const users: AdminUser[] = [
  { id: 1, name: "Ana", email: "admin@x.com", role: "admin", authProvider: "local" },
  { id: 2, name: "Bruno", email: "bruno@x.com", role: "user", authProvider: "local" },
  { id: 42, name: "Quem Saiu", email: "saiu@x.com", role: "user", authProvider: "local" },
];

describe("AdminRoadmaps", () => {
  beforeEach(() => {
    adminListRoadmaps.mockReset(); adminListRoadmaps.mockResolvedValue(roadmaps);
    listUsers.mockReset(); listUsers.mockResolvedValue(users);
    transferRoadmapOwner.mockReset();
    listCollaborators.mockReset(); listCollaborators.mockResolvedValue([]);
  });

  const setup = () => render(<MemoryRouter><AdminRoadmaps /></MemoryRouter>);

  it("lista todos os roadmaps com dono, e-mail e contagens", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("Roadmap VPS 2026")).toBeInTheDocument());
    expect(screen.getByText("saiu@x.com")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("Roadmap Plataforma")).toBeInTheDocument();
  });

  it("filtra por dono", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("Roadmap VPS 2026")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("filtrar roadmaps"), { target: { value: "bruno" } });
    expect(screen.queryByText("Roadmap VPS 2026")).not.toBeInTheDocument();
    expect(screen.getByText("Roadmap Plataforma")).toBeInTheDocument();
  });

  it("transfere o dono sem manter o anterior (caso de quem saiu da empresa)", async () => {
    transferRoadmapOwner.mockResolvedValue({ ...roadmaps[0], ownerId: 2, ownerName: "Bruno", ownerEmail: "bruno@x.com" });
    setup();
    await waitFor(() => expect(screen.getByText("Roadmap VPS 2026")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: /Transferir dono/ })[0]);
    fireEvent.change(screen.getByLabelText("Novo dono"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Transferir" }));

    await waitFor(() => expect(transferRoadmapOwner).toHaveBeenCalled());
    expect(transferRoadmapOwner.mock.calls[0][0]).toBe(7);
    expect(transferRoadmapOwner.mock.calls[0][1]).toEqual({ newOwnerId: 2, keepPreviousAsCollaborator: false });
    // A linha da tabela passa a mostrar o novo dono.
    await waitFor(() => expect(screen.getAllByText("bruno@x.com").length).toBeGreaterThan(0));
  });

  it("permite manter o dono anterior como colaborador", async () => {
    transferRoadmapOwner.mockResolvedValue({ ...roadmaps[0], ownerId: 1, ownerName: "Ana", ownerEmail: "admin@x.com" });
    setup();
    await waitFor(() => expect(screen.getByText("Roadmap VPS 2026")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: /Transferir dono/ })[0]);
    fireEvent.change(screen.getByLabelText("Novo dono"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Transferir" }));

    await waitFor(() => expect(transferRoadmapOwner).toHaveBeenCalled());
    expect(transferRoadmapOwner.mock.calls[0][1]).toEqual({ newOwnerId: 1, keepPreviousAsCollaborator: true });
  });

  it("não oferece o dono atual como novo dono", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("Roadmap VPS 2026")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Transferir dono/ })[0]);
    const options = screen.getAllByRole("option").map(o => (o as HTMLOptionElement).value);
    expect(options).not.toContain("42"); // "Quem Saiu" é o dono atual
    expect(options).toContain("2");
  });

  it("exige escolher o novo dono antes de transferir", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("Roadmap VPS 2026")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Transferir dono/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Transferir" }));
    await waitFor(() => expect(screen.getByText("Escolha o novo dono")).toBeInTheDocument());
    expect(transferRoadmapOwner).not.toHaveBeenCalled();
  });

  it("mostra o erro do servidor quando o novo dono já tem roadmap homônimo", async () => {
    transferRoadmapOwner.mockRejectedValue(new Error('Bruno já tem um roadmap chamado "Roadmap VPS 2026".'));
    setup();
    await waitFor(() => expect(screen.getByText("Roadmap VPS 2026")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Transferir dono/ })[0]);
    fireEvent.change(screen.getByLabelText("Novo dono"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Transferir" }));
    await waitFor(() => expect(screen.getByText(/já tem um roadmap chamado/)).toBeInTheDocument());
  });

  it("abre o diálogo de compartilhamento do roadmap escolhido", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("Roadmap VPS 2026")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Gerenciar acesso/ })[0]);
    await waitFor(() => expect(screen.getByText("Compartilhar roadmap")).toBeInTheDocument());
    expect(listCollaborators).toHaveBeenCalledWith(7);
  });
});
