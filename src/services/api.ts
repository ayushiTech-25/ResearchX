import type { Paper, PaperAnalysis, Researcher, ResearcherProfile, Trend, User } from "../types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const requestTimeoutMs = 15_000;
const aiRequestTimeoutMs = 55_000;

function errorMessageForStatus(status: number) {
  switch (status) {
    case 400: return "Some search or form details are invalid. Check them and try again.";
    case 401: return "Your session has expired. Please sign in again.";
    case 403: return "You do not have permission to perform this action.";
    case 404: return "The requested research record or page could not be found.";
    case 408:
    case 504: return "Research service is taking too long to respond. Please try again.";
    case 429: return "The research service is receiving too many requests. Please wait a moment and try again.";
    case 500: return "The server could not complete this request. Please try again.";
    case 502: return "A research provider is temporarily unavailable. Please try again.";
    case 503: return "This feature is not configured on the server yet.";
    default: return `Request failed (${status}). Please try again.`;
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = requestTimeoutMs): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort(new DOMException("The request timed out.", "TimeoutError"));
  }, timeoutMs);
  const forwardAbort = () => controller.abort(init?.signal?.reason);
  if (init?.signal?.aborted) forwardAbort();
  else init?.signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new ApiError(body?.error ?? errorMessageForStatus(response.status), response.status);
    }
    if (response.status === 204) return undefined as T;
    try {
      return await response.json() as T;
    } catch (error) {
      if (error instanceof SyntaxError) throw new ApiError("The server returned an invalid response. Please try again.", 502);
      throw error;
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError("Research service is taking too long to respond. Please try again.", 504);
    }
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError("Unable to reach the server. Check your connection and try again.", 0);
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", forwardAbort);
  }
}

export const api = {
  me: () => request<{ user: User | null }>("/api/auth/me"),
  dashboard: (signal?: AbortSignal) => request<{
    source: string;
    paperSource: string | null;
    researcherSource: string | null;
    topicCount: number | null;
    paperCount: number | null;
    researcherCount: number | null;
    topicsReturned: number;
    papers: Paper[];
    trends: Trend[];
    retrievedAt: string;
    authenticated: boolean;
    savedCount: number | null;
    collectionCount: number | null;
    workspaceCount: number | null;
    recentActivity: Array<{
      id: string;
      action: string;
      targetType: string;
      targetId: string | null;
      targetName: string | null;
      contextName: string | null;
      externalId: string | null;
      createdAt: string;
    }>;
  }>("/api/dashboard", { signal }),
  login: (email: string, password: string) => request<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) => request<{ user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  papers: (filters: { q?: string; title?: string; author?: string; topic?: string; yearFrom?: string; yearTo?: string; page?: number; perPage?: number }, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") params.set(key, String(value));
    return request<{ results: Paper[]; total: number | null; page: number; perPage: number; source: string }>(`/api/research/papers?${params}`, { signal });
  },
  paper: (id: string, signal?: AbortSignal) => request<{ paper: Paper }>(`/api/research/paper?id=${encodeURIComponent(id)}`, { signal }),
  researchers: (filters: { q?: string; topic?: string; institution?: string; page?: number; perPage?: number }, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") params.set(key, String(value));
    return request<{ results: Researcher[]; total: number | null; page: number; perPage: number; source: string; hasMore: boolean }>(`/api/research/researchers?${params}`, { signal });
  },
  researcher: (id: string, page = 1, signal?: AbortSignal) => request<{ researcher: ResearcherProfile }>(`/api/research/researcher?id=${encodeURIComponent(id)}&page=${page}`, { signal }),
  trends: (signal?: AbortSignal) => request<{ results: Trend[]; total: number | null; page: number; perPage: number; source: string }>("/api/research/trends", { signal }),
  publicationYears: (topic?: string, signal?: AbortSignal) => request<{ results: Array<{ year: number; papers: number }>; source: string }>(`/api/research/works-by-year${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`, { signal }),
  assistant: (message: string, context?: string) => request<{ answer: string }>("/api/ai/assistant", { method: "POST", body: JSON.stringify({ message, context }) }, aiRequestTimeoutMs),
  analyzePaper: (title: string, content: string) => request<{ analysis: PaperAnalysis; analysisId: string; analyzedAt: string }>("/api/ai/paper-analysis", { method: "POST", body: JSON.stringify({ title, content }) }, aiRequestTimeoutMs),
  collections: () => request<{ collections: Array<{ id: string; name: string; description: string | null; createdAt: string; items: Array<{ id: string; externalId: string; kind: string; title: string; createdAt: string }>; _count: { items: number } }> }>("/api/collections"),
  createCollection: (name: string, description?: string, workspaceId?: string) => request<{ collection: { id: string; name: string }; created: boolean }>("/api/collections", { method: "POST", body: JSON.stringify({ name, description, workspaceId }) }),
  saveItem: (collectionId: string, item: { externalId: string; kind: "paper" | "researcher"; title: string }) => request<{ item: { id: string } }>(`/api/collections/${encodeURIComponent(collectionId)}/items`, { method: "POST", body: JSON.stringify(item) }),
  removeCollectionItem: (collectionId: string, itemId: string) => request<void>(`/api/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}`, { method: "DELETE" }),
  savePaper: (externalId: string, title: string) => request<{ saved: boolean; itemId?: string }>("/api/saved/papers", { method: "POST", body: JSON.stringify({ externalId, title }) }),
  unsavePaper: (externalId: string) => request<{ saved: boolean; itemId?: string }>("/api/saved/papers", { method: "DELETE", body: JSON.stringify({ externalId }) }),
  saveResearcher: (id: string) => request<{ saved: boolean; collectionId: string }>(`/api/research/researchers/${encodeURIComponent(id)}/save`, { method: "POST" }),
  workspaces: () => request<{ workspaces: Array<{
    id: string; name: string; description: string | null; updatedAt: string;
    _count: { collections: number; papers: number; researchers: number };
    papers: Array<{ paper: { id: string; externalId: string; title: string | null; publicationYear: number | null; source: string } }>;
    researchers: Array<{ researcher: { id: string; externalId: string; displayName: string | null; institutionName: string | null } }>;
  }> }>("/api/workspaces"),
  createWorkspace: (name: string, description?: string) => request<{ workspace: { id: string; name: string }; created: boolean }>("/api/workspaces", { method: "POST", body: JSON.stringify({ name, description }) }),
  addToWorkspace: (workspaceId: string, externalId: string, kind: "paper" | "researcher") => request<{ added: true }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/items`, { method: "POST", body: JSON.stringify({ externalId, kind }) }),
  removeWorkspaceItem: (workspaceId: string, externalId: string, kind: "paper" | "researcher") => request<void>(`/api/workspaces/${encodeURIComponent(workspaceId)}/items`, { method: "DELETE", body: JSON.stringify({ externalId, kind }) }),
};
