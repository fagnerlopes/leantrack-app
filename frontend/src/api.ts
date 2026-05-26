export type User = { id: number; email: string; name: string; role: string };

export type Item = {
  id: number;
  title: string;
  status: "em-andamento" | "nao-iniciado" | "concluido" | "pausado";
  startDate: string | null;
  endDate: string | null;
  progress: number;
  dependencyId: number | null;
  notes: string;
  extTeam: string | null;
  extDescription: string | null;
  extMilestone: string | null;
  sortOrder: number;
};

export type ItemInput = Omit<Item, "id">;

async function req<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    req<User>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => req<{ status: string }>("/api/auth/logout", { method: "POST" }),
  me: () => req<User>("/api/auth/me"),
  listItems: () => req<Item[]>("/api/items"),
  createItem: (it: ItemInput) =>
    req<Item>("/api/items", { method: "POST", body: JSON.stringify(it) }),
  updateItem: (id: number, it: ItemInput) =>
    req<Item>(`/api/items/${id}`, { method: "PUT", body: JSON.stringify(it) }),
  deleteItem: (id: number) =>
    req<void>(`/api/items/${id}`, { method: "DELETE" }),
};
