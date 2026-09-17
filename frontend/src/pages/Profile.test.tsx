import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const updateProfile = vi.fn();
vi.mock("../api", () => ({ api: { updateProfile: (i: any) => updateProfile(i) } }));

const updateUser = vi.fn();
vi.mock("../auth", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Administrador", email: "admin@x.com", role: "user" },
    updateUser,
    logout: vi.fn(),
  }),
}));

import Profile from "./Profile";

const renderPage = () => render(<MemoryRouter><Profile /></MemoryRouter>);
const pwdInput = () => screen.getByPlaceholderText("Mínimo de 12 caracteres") as HTMLInputElement;
const confirmInput = () => screen.getByPlaceholderText("Repita a nova senha") as HTMLInputElement;
const save = () => fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

describe("Profile", () => {
  beforeEach(() => { updateProfile.mockReset(); updateProfile.mockResolvedValue({ id: 1, name: "Administrador", email: "admin@x.com", role: "user" }); updateUser.mockReset(); });

  it("salva só o nome quando a senha fica em branco (password = undefined)", async () => {
    renderPage();
    save();
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ name: "Administrador", password: undefined }));
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
  });

  it("envia a nova senha quando preenchida e confirmada", async () => {
    renderPage();
    fireEvent.change(pwdInput(), { target: { value: "NovaSenha123!" } });
    fireEvent.change(confirmInput(), { target: { value: "NovaSenha123!" } });
    save();
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ name: "Administrador", password: "NovaSenha123!" }));
  });

  it("bloqueia senha que não atende à política", async () => {
    renderPage();
    fireEvent.change(pwdInput(), { target: { value: "1234567" } });
    fireEvent.change(confirmInput(), { target: { value: "1234567" } });
    save();
    await waitFor(() => expect(updateProfile).not.toHaveBeenCalled());
    // A regra aparece fixa e também no erro quando bloqueado.
    expect(screen.getAllByText(/ao menos 12 caracteres/).length).toBeGreaterThanOrEqual(2);
  });

  it("bloqueia quando as senhas não conferem", async () => {
    renderPage();
    fireEvent.change(pwdInput(), { target: { value: "NovaSenha123!" } });
    fireEvent.change(confirmInput(), { target: { value: "OutraSenha123!" } });
    save();
    await waitFor(() => expect(screen.getByText(/não conferem/)).toBeInTheDocument());
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("alterna entre mostrar e ocultar a senha", () => {
    renderPage();
    expect(pwdInput().type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));
    expect(pwdInput().type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(pwdInput().type).toBe("password");
  });
});
