import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Collaborator } from "../api";

const listCollaborators = vi.fn();
const addCollaborator = vi.fn();
const removeCollaborator = vi.fn();
vi.mock("../api", () => ({ api: {
  listCollaborators: (id: number) => listCollaborators(id),
  addCollaborator: (id: number, input: any) => addCollaborator(id, input),
  removeCollaborator: (id: number, uid: number) => removeCollaborator(id, uid),
  updateCollaborator: vi.fn(),
} }));

import ShareDialog from "./ShareDialog";

const existing: Collaborator[] = [
  { userId: 2, name: "Marcus Januário", email: "marcus.januario@locaweb.com.br", canEdit: true, canShare: false },
];

describe("ShareDialog", () => {
  beforeEach(() => {
    listCollaborators.mockReset(); listCollaborators.mockResolvedValue(existing);
    addCollaborator.mockReset();
    removeCollaborator.mockReset(); removeCollaborator.mockResolvedValue(undefined);
  });

  it("lista os colaboradores atuais", async () => {
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(listCollaborators).toHaveBeenCalledWith(9));
    expect(screen.getByText("Marcus Januário")).toBeInTheDocument();
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
    addCollaborator.mockRejectedValue(new Error("Não há conta com esse e-mail. Solicite o cadastro a marcus.januario@locaweb.com.br."));
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(listCollaborators).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText("e-mail do convidado"), "ninguem@x.com");
    await userEvent.click(screen.getByRole("button", { name: /convidar/i }));
    await waitFor(() => expect(screen.getByText(/Solicite o cadastro a marcus\.januario@locaweb\.com\.br/i)).toBeInTheDocument());
  });

  it("remove um colaborador", async () => {
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Marcus Januário")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /remover Marcus/i }));
    await waitFor(() => expect(removeCollaborator).toHaveBeenCalledWith(9, 2));
  });
});
