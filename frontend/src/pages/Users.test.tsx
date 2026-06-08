import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AdminUser } from "../api";

const listUsers = vi.fn();
vi.mock("../api", () => ({ api: { listUsers: () => listUsers() } }));
vi.mock("../auth", () => ({ useAuth: () => ({ user: { id: 1, name: "Fagner", role: "admin" }, logout: vi.fn() }) }));

import Users from "./Users";

const sample: AdminUser[] = [
  { id: 1, name: "Fagner", email: "fagner@x.com", role: "admin", authProvider: "local" },
  { id: 2, name: "Eduarda", email: "eduarda@x.com", role: "user", authProvider: "local" },
];

describe("Users", () => {
  beforeEach(() => { listUsers.mockReset(); listUsers.mockResolvedValue(sample); });

  it("lista os usuários e marca o próprio usuário", async () => {
    render(<MemoryRouter><Users /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("eduarda@x.com")).toBeInTheDocument());
    expect(screen.getByText("(você)")).toBeInTheDocument();
  });

  it("impede remover a própria conta (botão desabilitado)", async () => {
    render(<MemoryRouter><Users /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("fagner@x.com")).toBeInTheDocument());
    const removeButtons = screen.getAllByRole("button", { name: "Remover" });
    expect(removeButtons[0]).toBeDisabled(); // própria conta (Fagner, id 1)
    expect(removeButtons[1]).toBeEnabled();  // Eduarda
  });
});
