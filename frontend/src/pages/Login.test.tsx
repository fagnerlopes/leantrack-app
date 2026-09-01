import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const login = vi.fn();
const logout = vi.fn();
const updateUser = vi.fn();
const publicConfig = vi.fn();

vi.mock("../api", () => ({
  api: {
    publicConfig: () => publicConfig(),
    login: (email: string, password: string, turnstileToken?: string) => login(email, password, turnstileToken),
  },
}));

vi.mock("../auth", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    login: (email: string, password: string, turnstileToken?: string) => login(email, password, turnstileToken),
    logout,
    updateUser,
  }),
}));

vi.mock("../components/Turnstile", () => ({
  default: ({ siteKey, onToken }: { siteKey: string; onToken: (t: string | null) => void }) => (
    <button type="button" onClick={() => onToken("widget-token")}>turnstile-{siteKey}</button>
  ),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  const nav = vi.fn();
  return {
    ...actual,
    useNavigate: () => nav,
    useLocation: () => ({ state: null }),
  };
});

import Login from "./Login";

const renderPage = () => render(<MemoryRouter><Login /></MemoryRouter>);

describe("Login com Turnstile", () => {
  beforeEach(() => {
    login.mockReset();
    login.mockResolvedValue({ id: 1, name: "T", email: "t@x.com", role: "user", mustChangePassword: false });
    publicConfig.mockReset();
  });

  it("mostra o widget quando há site key configurada", async () => {
    publicConfig.mockResolvedValue({ turnstileSiteKey: "key-1" });
    renderPage();
    await waitFor(() => expect(screen.getByText("turnstile-key-1")).toBeInTheDocument());
  });

  it("não mostra o widget e faz login direto sem site key", async () => {
    publicConfig.mockResolvedValue({ turnstileSiteKey: "" });
    renderPage();
    await waitFor(() => expect(publicConfig).toHaveBeenCalled());
    expect(screen.queryByText(/turnstile-/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@x.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Senha123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(login).toHaveBeenCalledWith("a@x.com", "Senha123!", undefined));
  });

  it("bloqueia envio enquanto o desafio não é resolvido", async () => {
    publicConfig.mockResolvedValue({ turnstileSiteKey: "key-1" });
    renderPage();
    await waitFor(() => expect(screen.getByText("turnstile-key-1")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@x.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Senha123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByText(/Resolva a verificação/)).toBeInTheDocument());
    expect(login).not.toHaveBeenCalled();
  });

  it("envia o token do Turnstile junto com o login", async () => {
    publicConfig.mockResolvedValue({ turnstileSiteKey: "key-1" });
    renderPage();
    const widgetBtn = await screen.findByText("turnstile-key-1");
    fireEvent.click(widgetBtn);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@x.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Senha123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("a@x.com", "Senha123!", "widget-token"));
  });
});