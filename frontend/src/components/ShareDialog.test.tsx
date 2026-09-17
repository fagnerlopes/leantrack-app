import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Collaborator } from "../api";

const listCollaborators = vi.fn();
const addCollaborator = vi.fn();
const removeCollaborator = vi.fn();
const searchUsers = vi.fn();
vi.mock("../api", () => ({ api: {
  listCollaborators: (id: number) => listCollaborators(id),
  addCollaborator: (id: number, input: any) => addCollaborator(id, input),
  removeCollaborator: (id: number, uid: number) => removeCollaborator(id, uid),
  searchUsers: (id: number, q: string) => searchUsers(id, q),
  updateCollaborator: vi.fn(),
} }));

import ShareDialog from "./ShareDialog";

const existing: Collaborator[] = [
  { userId: 2, name: "Bruno Lima", email: "bruno.lima@example.com", canEdit: true, canShare: false },
];

describe("ShareDialog", () => {
  beforeEach(() => {
    listCollaborators.mockReset(); listCollaborators.mockResolvedValue(existing);
    addCollaborator.mockReset();
    removeCollaborator.mockReset(); removeCollaborator.mockResolvedValue(undefined);
    searchUsers.mockReset(); searchUsers.mockResolvedValue([]);
  });

  it("lista os colaboradores atuais", async () => {
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(listCollaborators).toHaveBeenCalledWith(9));
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
  });

  it("convida por e-mail com a permissão escolhida", async () => {
    addCollaborator.mockResolvedValue({ userId: 3, name: "Novo", email: "novo@x.com", canEdit: true, canShare: false });
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(listCollaborators).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText("e-mail do convidado"), "novo@x.com");
    await userEvent.click(screen.getByRole("button", { name: /convidar/i }));
    await waitFor(() => expect(addCollaborator).toHaveBeenCalledWith(9, { email: "novo@x.com", canEdit: true, canShare: false }));
  });

  it("mostra o aviso quando o e-mail não tem conta", async () => {
    addCollaborator.mockRejectedValue(new Error("Não há conta com esse e-mail. Solicite o cadastro a um administrador."));
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(listCollaborators).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText("e-mail do convidado"), "ninguem@x.com");
    await userEvent.click(screen.getByRole("button", { name: /convidar/i }));
    await waitFor(() => expect(screen.getByText(/Solicite o cadastro a um administrador/i)).toBeInTheDocument());
  });

  it("não dispara a busca com menos de 4 caracteres", async () => {
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(listCollaborators).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText("e-mail do convidado"), "mar");
    // Aguarda além do debounce para garantir que nada foi disparado.
    await new Promise(r => setTimeout(r, 350));
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it("sugere usuários a partir de 4 caracteres e preenche ao escolher", async () => {
    searchUsers.mockResolvedValue([
      { id: 5, name: "Mariana Costa", email: "mariana.costa@x.com" },
      { id: 6, name: "Mário Alves", email: "mario.alves@x.com" },
    ]);
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(listCollaborators).toHaveBeenCalled());

    const input = screen.getByLabelText("e-mail do convidado") as HTMLInputElement;
    await userEvent.type(input, "mari");
    await waitFor(() => expect(searchUsers).toHaveBeenCalledWith(9, "mari"));

    // As sugestões aparecem (nome + e-mail).
    const option = await screen.findByText("Mariana Costa");
    expect(screen.getByText("mariana.costa@x.com")).toBeInTheDocument();

    // Ao escolher, o e-mail é preenchido no campo.
    await userEvent.click(option);
    expect(input.value).toBe("mariana.costa@x.com");
  });

  it("remove um colaborador", async () => {
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Bruno Lima")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /remover Bruno/i }));
    await waitFor(() => expect(removeCollaborator).toHaveBeenCalledWith(9, 2));
  });
});
