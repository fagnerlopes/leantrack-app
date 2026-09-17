import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AdminUser } from "../api";

const listUsers = vi.fn();
const resetUserPassword = vi.fn();
vi.mock("../api", () => ({ api: { listUsers: () => listUsers(), resetUserPassword: (id: number, pw: string) => resetUserPassword(id, pw) } }));
vi.mock("../auth", () => ({ useAuth: () => ({ user: { id: 1, name: "Ana", role: "admin" }, logout: vi.fn() }) }));

import Users from "./Users";

const sample: AdminUser[] = [
  { id: 1, name: "Ana", email: "admin@x.com", role: "admin", authProvider: "local" },
  { id: 2, name: "Bruno", email: "bruno@x.com", role: "user", authProvider: "local" },
];

describe("Users", () => {
  beforeEach(() => { listUsers.mockReset(); listUsers.mockResolvedValue(sample); resetUserPassword.mockReset(); resetUserPassword.mockResolvedValue(sample[1]); });

  it("lista os usuários e marca o próprio usuário", async () => {
    render(<MemoryRouter><Users /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("bruno@x.com")).toBeInTheDocument());
    expect(screen.getByText("(você)")).toBeInTheDocument();
  });

  it("impede remover a própria conta (botão desabilitado)", async () => {
    render(<MemoryRouter><Users /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("admin@x.com")).toBeInTheDocument());
    const removeButtons = screen.getAllByRole("button", { name: "Remover" });
    expect(removeButtons[0]).toBeDisabled(); // própria conta (Ana, id 1)
    expect(removeButtons[1]).toBeEnabled();  // Bruno
  });

  it("reseta a senha com uma senha temporária forte pré-gerada", async () => {
    render(<MemoryRouter><Users /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("bruno@x.com")).toBeInTheDocument());
    // Abre o modal de reset da Bruno (2ª linha).
    fireEvent.click(screen.getAllByRole("button", { name: "Resetar senha" })[1]);
    expect(screen.getByText(/Salve esta senha no/)).toBeInTheDocument();
    // A senha já vem gerada e válida; basta confirmar.
    fireEvent.click(screen.getByRole("button", { name: "Definir senha" }));
    await waitFor(() => expect(resetUserPassword).toHaveBeenCalled());
    expect(resetUserPassword.mock.calls[0][0]).toBe(2); // id da Bruno
    expect(typeof resetUserPassword.mock.calls[0][1]).toBe("string");
    expect(resetUserPassword.mock.calls[0][1].length).toBeGreaterThanOrEqual(12);
  });
});
