export type AgentMode = "agent" | "plan";

export type ThreadStatus =
  | "idle"
  | "running"
  | "error"
  | "cancelled"
  | "archived";

export type RunStatus = "running" | "finished" | "error" | "cancelled";

export type MessageType =
  | "user"
  | "assistant"
  | "thinking"
  | "tool_call"
  | "status";

export type GuestDTO = {
  id: string;
  workspaceId: string;
  displayName: string;
  color: string;
};

export type PresenceGuest = GuestDTO & {
  viewingThreadId: string | null;
};

export type WorkspaceDTO = {
  id: string;
  name: string;
  repoUrl: string;
  startingRef: string;
  createdAt: number;
};

export type ThreadDTO = {
  id: string;
  workspaceId: string;
  cursorAgentId: string | null;
  title: string;
  status: ThreadStatus;
  mode: AgentMode;
  model: string;
  createdByGuestId: string;
  gitBranch: string | null;
  gitPrUrl: string | null;
  createdAt: number;
  updatedAt: number;
};

export type RunDTO = {
  id: string;
  threadId: string;
  cursorRunId: string | null;
  status: RunStatus;
  startedByGuestId: string;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
};

export type MessageDTO = {
  id: string;
  threadId: string;
  runId: string | null;
  guestId: string | null;
  type: MessageType;
  payload: Record<string, unknown>;
  createdAt: number;
  guest: GuestDTO | null;
};

export type ModelDTO = {
  id: string;
  displayName: string;
};

export type BusyState = {
  threadId: string;
  guestId: string;
  guestName: string;
};

export type ClientMessage =
  | { type: "hello" }
  | { type: "viewing"; threadId: string | null }
  | {
      type: "create_thread";
      text: string;
      mode: AgentMode;
      model: string;
    }
  | {
      type: "prompt";
      threadId: string;
      text: string;
      mode: AgentMode;
      model: string;
    }
  | { type: "cancel"; threadId: string }
  | { type: "archive_thread"; threadId: string }
  | { type: "delete_thread"; threadId: string };

export type ServerMessage =
  | {
      type: "hello_ok";
      guest: GuestDTO;
      workspace: WorkspaceDTO;
    }
  | { type: "presence_state"; guests: PresenceGuest[] }
  | { type: "thread_upsert"; thread: ThreadDTO }
  | { type: "thread_removed"; threadId: string }
  | { type: "run_status"; threadId: string; run: RunDTO }
  | { type: "stream_event"; threadId: string; message: MessageDTO }
  | {
      type: "stream_delta";
      threadId: string;
      kind: "text" | "thinking";
      text: string;
    }
  | { type: "workspace_busy"; busy: BusyState | null }
  | { type: "models"; models: ModelDTO[] }
  | { type: "error"; message: string; helpUrl?: string };
