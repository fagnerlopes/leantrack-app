export type User = { id: number; email: string; name: string; role: string };

export type Roadmap = {
  id: number;
  name: string;
  slug: string;
  description: string;
  ownerId: number;
  ownerName: string;
  itemCount: number;
  canEdit: boolean;
  canShare: boolean;
  canDelete: boolean;
  isOwner: boolean;
};

export type Collaborator = {
  userId: number;
  name: string;
  email: string;
  canEdit: boolean;
  canShare: boolean;
};

export type UserSuggestion = {
  id: number;
  name: string;
  email: string;
};

export type RoadmapInput = { name: string; description: string };

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  role: string;
  authProvider: string;
};

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
  color: string | null;
  epicUrl: string | null;
};

export type ItemInput = Omit<Item, "id">;
export type ReorderEntry = { id: number; sortOrder: number };

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
  // Auth
  login: (email: string, password: string) =>
    req<User>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => req<{ status: string }>("/api/auth/logout", { method: "POST" }),
  me: () => req<User>("/api/auth/me"),
  // Atualiza o próprio perfil. password vazio/omitido = mantém a senha atual.
  updateProfile: (input: { name: string; password?: string }) =>
    req<User>("/api/auth/me", { method: "PUT", body: JSON.stringify(input) }),

  // Roadmaps
  listRoadmaps: (mine = false) =>
    req<Roadmap[]>(`/api/roadmaps${mine ? "?mine=true" : ""}`),
  getRoadmap: (id: number) => req<Roadmap>(`/api/roadmaps/${id}`),
  createRoadmap: (input: RoadmapInput) =>
    req<Roadmap>("/api/roadmaps", { method: "POST", body: JSON.stringify(input) }),
  updateRoadmap: (id: number, input: RoadmapInput) =>
    req<Roadmap>(`/api/roadmaps/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteRoadmap: (id: number, confirmSlug: string) =>
    req<void>(`/api/roadmaps/${id}`, { method: "DELETE", body: JSON.stringify({ confirmSlug }) }),
  listSharedRoadmaps: () => req<Roadmap[]>("/api/roadmaps/shared"),

  // Colaboradores
  searchUsers: (roadmapId: number, q: string) =>
    req<UserSuggestion[]>(`/api/roadmaps/${roadmapId}/user-search?q=${encodeURIComponent(q)}`),
  listCollaborators: (roadmapId: number) =>
    req<Collaborator[]>(`/api/roadmaps/${roadmapId}/collaborators`),
  addCollaborator: (roadmapId: number, input: { email: string; canEdit: boolean; canShare: boolean }) =>
    req<Collaborator>(`/api/roadmaps/${roadmapId}/collaborators`, { method: "POST", body: JSON.stringify(input) }),
  updateCollaborator: (roadmapId: number, userId: number, input: { canEdit: boolean; canShare: boolean }) =>
    req<Collaborator>(`/api/roadmaps/${roadmapId}/collaborators/${userId}`, { method: "PUT", body: JSON.stringify(input) }),
  removeCollaborator: (roadmapId: number, userId: number) =>
    req<void>(`/api/roadmaps/${roadmapId}/collaborators/${userId}`, { method: "DELETE" }),

  // Items (scoped by roadmap)
  listItems: (roadmapId: number) =>
    req<Item[]>(`/api/roadmaps/${roadmapId}/items`),
  createItem: (roadmapId: number, it: ItemInput) =>
    req<Item>(`/api/roadmaps/${roadmapId}/items`, { method: "POST", body: JSON.stringify(it) }),
  updateItem: (roadmapId: number, id: number, it: ItemInput) =>
    req<Item>(`/api/roadmaps/${roadmapId}/items/${id}`, { method: "PUT", body: JSON.stringify(it) }),
  deleteItem: (roadmapId: number, id: number) =>
    req<void>(`/api/roadmaps/${roadmapId}/items/${id}`, { method: "DELETE" }),
  reorderItems: (roadmapId: number, entries: ReorderEntry[]) =>
    req<{ status: string }>(`/api/roadmaps/${roadmapId}/items/reorder`, { method: "PUT", body: JSON.stringify(entries) }),

  // Admin — user accounts
  listUsers: () => req<AdminUser[]>("/api/admin/users"),
  createUser: (input: { name: string; email: string; password: string; role: string }) =>
    req<AdminUser>("/api/admin/users", { method: "POST", body: JSON.stringify(input) }),
  deleteUser: (id: number) =>
    req<void>(`/api/admin/users/${id}`, { method: "DELETE" }),
  updateUserRole: (id: number, role: string) =>
    req<AdminUser>(`/api/admin/users/${id}/role`, { method: "PUT", body: JSON.stringify({ role }) }),
};
