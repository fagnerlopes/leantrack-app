import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const changePassword = vi.fn();
vi.mock("../api", () => ({ api: { changePassword: (pw: string) => changePassword(pw) } }));

const updateUser = vi.fn();
const logout = vi.fn();
vi.mock("../auth", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Bruno", email: "e@x.com", role: "user", mustChangePassword: true },
    loading: false,
    updateUser,
    logout,
  }),
}));

import ForcePasswordChange from "./ForcePasswordChange";

const renderPage = () => render(<MemoryRouter><ForcePasswordChange /></MemoryRouter>);
const pwd = () => screen.getByPlaceholderText("Mínimo de 12 caracteres") as HTMLInputElement;
const confirm = () => screen.getByPlaceholderText("Repita a nova senha") as HTMLInputElement;
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Salvar e entrar" }));

describe("ForcePasswordChange", () => {
  beforeEach(() => { changePassword.mockReset(); changePassword.mockResolvedValue({ id: 1, name: "Bruno", email: "e@x.com", role: "user", mustChangePassword: false }); updateUser.mockReset(); });

  it("exibe o alerta para salvar a senha no Keeper", () => {
    renderPage();
    expect(screen.getByText("Guarde sua senha no Keeper")).toBeInTheDocument();
  });

  it("bloqueia senha fraca e não chama a API", async () => {
    renderPage();
    fireEvent.change(pwd(), { target: { value: "fraca" } });
    fireEvent.change(confirm(), { target: { value: "fraca" } });
    submit();
    // A regra aparece fixa na tela e também no erro: duas ocorrências quando bloqueado.
    await waitFor(() => expect(screen.getAllByText(/ao menos 12 caracteres/).length).toBeGreaterThanOrEqual(2));
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("bloqueia quando as senhas não conferem", async () => {
    renderPage();
    fireEvent.change(pwd(), { target: { value: "NovaSenha123!" } });
    fireEvent.change(confirm(), { target: { value: "Diferente123!" } });
    submit();
    await waitFor(() => expect(screen.getByText(/não conferem/)).toBeInTheDocument());
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("troca a senha e atualiza o usuário quando válida", async () => {
    renderPage();
    fireEvent.change(pwd(), { target: { value: "NovaSenha123!" } });
    fireEvent.change(confirm(), { target: { value: "NovaSenha123!" } });
    submit();
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith("NovaSenha123!"));
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
  });
});
