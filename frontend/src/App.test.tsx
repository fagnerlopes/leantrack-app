import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const me = vi.fn();
vi.mock("./api", () => ({ api: { me: () => me() } }));
vi.mock("./pages/Login", () => ({ default: () => <div>LOGIN_PAGE</div> }));
vi.mock("./pages/RoadmapList", () => ({ default: () => <div>LIST_PAGE</div> }));
vi.mock("./pages/RoadmapView", () => ({ default: () => <div>VIEW_PAGE</div> }));
vi.mock("./pages/Users", () => ({ default: () => <div>USERS_PAGE</div> }));

import App from "./App";

describe("App routing — painel de usuários só para admin", () => {
  beforeEach(() => { me.mockReset(); });

  it("redireciona não-admin de /admin/users para a lista", async () => {
    me.mockResolvedValue({ id: 1, name: "User", email: "u@x.com", role: "user" });
    window.history.pushState({}, "", "/admin/users");
    render(<App />);
    await waitFor(() => expect(screen.getByText("LIST_PAGE")).toBeInTheDocument());
    expect(screen.queryByText("USERS_PAGE")).not.toBeInTheDocument();
  });

  it("permite admin acessar /admin/users", async () => {
    me.mockResolvedValue({ id: 1, name: "Admin", email: "a@x.com", role: "admin" });
    window.history.pushState({}, "", "/admin/users");
    render(<App />);
    await waitFor(() => expect(screen.getByText("USERS_PAGE")).toBeInTheDocument());
  });

  it("manda visitante não autenticado para o login", async () => {
    me.mockRejectedValue(new Error("401"));
    window.history.pushState({}, "", "/");
    render(<App />);
    await waitFor(() => expect(screen.getByText("LOGIN_PAGE")).toBeInTheDocument());
  });
});
