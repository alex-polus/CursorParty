import type {
  GuestDTO,
  MessageDTO,
  ModelDTO,
  ThreadDTO,
  WorkspaceDTO,
} from "../types";

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export function fetchDefaults() {
  return fetchJSON<{
    repoUrl: string;
    startingRef: string;
    name: string;
    hasApiKey: boolean;
  }>("/api/defaults");
}

export function fetchWorkspaces() {
  return fetchJSON<{ workspaces: WorkspaceDTO[] }>("/api/workspaces");
}

export function createWorkspace(body: {
  name?: string;
  repoUrl: string;
  startingRef: string;
}) {
  return fetchJSON<{ workspace: WorkspaceDTO }>("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchWorkspace(id: string) {
  return fetchJSON<{
    workspace: WorkspaceDTO;
    me: GuestDTO | null;
    busy: { threadId: string; guestId: string; guestName: string } | null;
  }>(`/api/workspaces/${id}`);
}

export function claimGuest(
  workspaceId: string,
  displayName: string,
  profilePicture: string | null,
) {
  return fetchJSON<{ guest: GuestDTO }>(
    `/api/workspaces/${workspaceId}/guests`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, profilePicture }),
    },
  );
}

export function fetchThreads(workspaceId: string) {
  return fetchJSON<{ threads: ThreadDTO[] }>(
    `/api/workspaces/${workspaceId}/threads`,
  );
}

export function fetchMessages(threadId: string) {
  return fetchJSON<{ messages: MessageDTO[] }>(
    `/api/threads/${threadId}/messages`,
  );
}

export function fetchModels() {
  return fetchJSON<{ models: ModelDTO[] }>("/api/models");
}
