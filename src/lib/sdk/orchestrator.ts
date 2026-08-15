import {
  Agent,
  Cursor,
  CursorAgentError,
  IntegrationNotConnectedError,
  type Run,
  type SDKAgent,
  type SDKMessage,
} from "@cursor/sdk";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { messages, runs, threads, workspaces } from "../db/schema";
import {
  getGuest,
  getThread,
  toMessage,
  toRun,
} from "../db/queries";
import { cursorApiKey } from "../env";
import { nid, now } from "../ids";
import type {
  AgentMode,
  BusyState,
  MessageDTO,
  ModelDTO,
  ServerMessage,
  ThreadDTO,
} from "../types";

export type Broadcast = (workspaceId: string, message: ServerMessage) => void;

export class WorkspaceBusyError extends Error {
  constructor(public busy: BusyState) {
    super(`${busy.guestName}'s agent is running`);
    this.name = "WorkspaceBusyError";
  }
}

function requireApiKey(): string {
  const key = cursorApiKey();
  if (!key) {
    throw new Error(
      "CURSOR_API_KEY is not set. Add it to .env — see .env.example.",
    );
  }
  return key;
}

function titleFromPrompt(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "Untitled thread";
  if (t.length <= 72) return t;
  return `${t.slice(0, 69)}...`;
}

function payloadOf(event: SDKMessage): Record<string, unknown> {
  switch (event.type) {
    case "assistant": {
      const text = event.message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      return { text };
    }
    case "thinking":
      return { text: event.text };
    case "tool_call":
      return {
        callId: event.call_id,
        name: event.name,
        status: event.status,
        args: event.args ?? null,
        result: event.result ?? null,
      };
    case "status":
      return { status: event.status, message: event.message ?? null };
    case "user": {
      const text = event.message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      return { text };
    }
    default:
      return { type: event.type };
  }
}

export class Orchestrator {
  private agents = new Map<string, SDKAgent>();
  private activeRuns = new Map<string, Run>();
  private busy = new Map<string, BusyState>();

  constructor(private broadcast: Broadcast) {}

  getBusy(workspaceId: string): BusyState | null {
    return this.busy.get(workspaceId) ?? null;
  }

  async listModels(): Promise<ModelDTO[]> {
    const key = cursorApiKey();
    if (!key) {
      return [{ id: "composer-2.5", displayName: "Composer 2.5" }];
    }
    try {
      const models = await Cursor.models.list({ apiKey: key });
      return models.map((m) => ({
        id: m.id,
        displayName: m.displayName || m.id,
      }));
    } catch {
      return [
        { id: "composer-2.5", displayName: "Composer 2.5" },
        { id: "auto", displayName: "Auto" },
      ];
    }
  }

  async rehydrate() {
    const running = await db
      .select()
      .from(threads)
      .where(eq(threads.status, "running"));

    for (const row of running) {
      if (!row.cursorAgentId) {
        await this.markThread(row.id, "error");
        continue;
      }
      try {
        const apiKey = requireApiKey();
        const agent = await Agent.resume(row.cursorAgentId, { apiKey });
        this.agents.set(row.id, agent);

        const [runRow] = await db
          .select()
          .from(runs)
          .where(and(eq(runs.threadId, row.id), eq(runs.status, "running")))
          .limit(1);

        if (!runRow?.cursorRunId) {
          await this.markThread(row.id, "idle");
          continue;
        }

        const run = await Agent.getRun(runRow.cursorRunId, {
          runtime: "cloud",
          agentId: row.cursorAgentId,
          apiKey,
        });

        const guest = await getGuest(runRow.startedByGuestId);
        this.busy.set(row.workspaceId, {
          threadId: row.id,
          guestId: runRow.startedByGuestId,
          guestName: guest?.displayName ?? "Someone",
        });
        this.activeRuns.set(row.id, run);
        void this.pump(row.workspaceId, row.id, runRow.id, run);
      } catch (err) {
        console.error("[cursorparty] rehydrate failed", row.id, err);
        await this.markThread(row.id, "error");
      }
    }
  }

  async prompt(opts: {
    workspaceId: string;
    threadId?: string;
    guestId: string;
    text: string;
    mode: AgentMode;
    model: string;
  }): Promise<ThreadDTO> {
    const text = opts.text.trim();
    if (!text) throw new Error("Prompt is empty.");

    const existing = this.busy.get(opts.workspaceId);
    if (existing) throw new WorkspaceBusyError(existing);

    const guest = await getGuest(opts.guestId);
    if (!guest || guest.workspaceId !== opts.workspaceId) {
      throw new Error("Unknown guest.");
    }

    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, opts.workspaceId))
      .limit(1);
    if (!ws) throw new Error("Workspace not found.");

    let threadId = opts.threadId;
    const t = now();

    if (!threadId) {
      threadId = nid(12);
      await db.insert(threads).values({
        id: threadId,
        workspaceId: opts.workspaceId,
        cursorAgentId: null,
        title: titleFromPrompt(text),
        status: "running",
        mode: opts.mode,
        model: opts.model,
        createdByGuestId: opts.guestId,
        gitBranch: null,
        gitPrUrl: null,
        createdAt: t,
        updatedAt: t,
      });
    } else {
      const thread = await getThread(threadId);
      if (!thread || thread.workspaceId !== opts.workspaceId) {
        throw new Error("Thread not found.");
      }
      if (thread.status === "archived") {
        throw new Error("This thread is archived.");
      }
      await db
        .update(threads)
        .set({
          status: "running",
          mode: opts.mode,
          model: opts.model,
          updatedAt: t,
        })
        .where(eq(threads.id, threadId));
    }

    const busy: BusyState = {
      threadId,
      guestId: opts.guestId,
      guestName: guest.displayName,
    };
    this.busy.set(opts.workspaceId, busy);
    this.broadcast(opts.workspaceId, { type: "workspace_busy", busy });

    const thread = await getThread(threadId);
    if (thread) {
      this.broadcast(opts.workspaceId, { type: "thread_upsert", thread });
    }

    const runId = nid(12);
    await db.insert(runs).values({
      id: runId,
      threadId,
      cursorRunId: null,
      status: "running",
      startedByGuestId: opts.guestId,
      error: null,
      createdAt: t,
      finishedAt: null,
    });

    const userMessage = await this.persistMessage({
      threadId,
      runId,
      guestId: opts.guestId,
      type: "user",
      payload: { text },
    });
    this.broadcast(opts.workspaceId, {
      type: "stream_event",
      threadId,
      message: userMessage,
    });

    void this.execute({
      workspaceId: opts.workspaceId,
      threadId,
      runId,
      guestId: opts.guestId,
      text,
      mode: opts.mode,
      model: opts.model,
      repoUrl: ws.repoUrl,
      startingRef: ws.startingRef,
    });

    return (await getThread(threadId))!;
  }

  async cancel(workspaceId: string, threadId: string) {
    const run = this.activeRuns.get(threadId);
    if (run) {
      if (run.supports("cancel")) {
        await run.cancel();
        return;
      }
      throw new Error(run.unsupportedReason("cancel") ?? "Cancel is not supported.");
    }

    await db
      .update(runs)
      .set({ status: "cancelled", error: "Cancelled", finishedAt: now() })
      .where(and(eq(runs.threadId, threadId), eq(runs.status, "running")));
    await db
      .update(threads)
      .set({ status: "cancelled", updatedAt: now() })
      .where(eq(threads.id, threadId));
    const current = this.busy.get(workspaceId);
    if (current?.threadId === threadId) {
      this.busy.delete(workspaceId);
      this.broadcast(workspaceId, { type: "workspace_busy", busy: null });
    }
    const thread = await getThread(threadId);
    if (thread) {
      this.broadcast(workspaceId, { type: "thread_upsert", thread });
    }
  }

  async archive(workspaceId: string, threadId: string) {
    if (this.busy.get(workspaceId)?.threadId === threadId) {
      throw new Error("Cancel the running agent before archiving.");
    }
    const thread = await getThread(threadId);
    if (!thread || thread.workspaceId !== workspaceId) {
      throw new Error("Thread not found.");
    }
    const apiKey = cursorApiKey();
    if (thread.cursorAgentId && apiKey) {
      try {
        await Agent.archive(thread.cursorAgentId, { apiKey });
      } catch (err) {
        console.warn("[cursorparty] Agent.archive", err);
      }
    }
    await this.disposeAgent(threadId);
    await db
      .update(threads)
      .set({ status: "archived", updatedAt: now() })
      .where(eq(threads.id, threadId));
    const updated = await getThread(threadId);
    if (updated) {
      this.broadcast(workspaceId, { type: "thread_upsert", thread: updated });
    }
  }

  async delete(workspaceId: string, threadId: string) {
    if (this.busy.get(workspaceId)?.threadId === threadId) {
      throw new Error("Cancel the running agent before deleting.");
    }
    const thread = await getThread(threadId);
    if (!thread || thread.workspaceId !== workspaceId) {
      throw new Error("Thread not found.");
    }
    const apiKey = cursorApiKey();
    if (thread.cursorAgentId && apiKey) {
      try {
        await Agent.delete(thread.cursorAgentId, { apiKey });
      } catch (err) {
        console.warn("[cursorparty] Agent.delete", err);
      }
    }
    await this.disposeAgent(threadId);
    await db.delete(messages).where(eq(messages.threadId, threadId));
    await db.delete(runs).where(eq(runs.threadId, threadId));
    await db.delete(threads).where(eq(threads.id, threadId));
    this.broadcast(workspaceId, { type: "thread_removed", threadId });
  }

  private async execute(opts: {
    workspaceId: string;
    threadId: string;
    runId: string;
    guestId: string;
    text: string;
    mode: AgentMode;
    model: string;
    repoUrl: string;
    startingRef: string;
  }) {
    try {
      const apiKey = requireApiKey();
      let agent = this.agents.get(opts.threadId);
      const [threadRow] = await db
        .select()
        .from(threads)
        .where(eq(threads.id, opts.threadId))
        .limit(1);

      if (!agent) {
        if (threadRow?.cursorAgentId) {
          agent = await Agent.resume(threadRow.cursorAgentId, {
            apiKey,
            model: { id: opts.model },
            mode: opts.mode,
          });
        } else {
          agent = await Agent.create({
            apiKey,
            name: threadRow?.title ?? titleFromPrompt(opts.text),
            model: { id: opts.model },
            mode: opts.mode,
            cloud: {
              repos: [
                {
                  url: opts.repoUrl,
                  startingRef: opts.startingRef,
                },
              ],
              autoCreatePR: false,
              metadata: {
                workspace_id: opts.workspaceId,
                thread_id: opts.threadId,
                guest_id: opts.guestId,
              },
            },
          });
          await db
            .update(threads)
            .set({ cursorAgentId: agent.agentId, updatedAt: now() })
            .where(eq(threads.id, opts.threadId));
        }
        this.agents.set(opts.threadId, agent);
      }

      const run = await agent.send(opts.text, {
        mode: opts.mode,
        model: { id: opts.model },
        onDelta: ({ update }) => {
          if (update.type === "text-delta" && update.text) {
            this.broadcast(opts.workspaceId, {
              type: "stream_delta",
              threadId: opts.threadId,
              kind: "text",
              text: update.text,
            });
          }
          if (update.type === "thinking-delta" && update.text) {
            this.broadcast(opts.workspaceId, {
              type: "stream_delta",
              threadId: opts.threadId,
              kind: "thinking",
              text: update.text,
            });
          }
        },
      });

      await db
        .update(runs)
        .set({ cursorRunId: run.id })
        .where(eq(runs.id, opts.runId));

      this.activeRuns.set(opts.threadId, run);
      const upserted = await getThread(opts.threadId);
      if (upserted) {
        this.broadcast(opts.workspaceId, { type: "thread_upsert", thread: upserted });
      }

      await this.pump(opts.workspaceId, opts.threadId, opts.runId, run);
    } catch (err) {
      await this.failRun(opts.workspaceId, opts.threadId, opts.runId, err);
    }
  }

  private async pump(
    workspaceId: string,
    threadId: string,
    runId: string,
    run: Run,
  ) {
    try {
      if (run.supports("stream")) {
        for await (const event of run.stream()) {
          await this.handleEvent(workspaceId, threadId, runId, event);
        }
      }
      const result = await run.wait();

      const gitBranch = result.git?.branches[0]?.branch ?? null;
      const gitPrUrl = result.git?.branches[0]?.prUrl ?? null;
      const terminal =
        result.status === "finished"
          ? "idle"
          : result.status === "cancelled"
            ? "cancelled"
            : "error";

      await db
        .update(runs)
        .set({
          status: result.status,
          error: result.error?.message ?? null,
          finishedAt: now(),
        })
        .where(eq(runs.id, runId));

      await db
        .update(threads)
        .set({
          status: terminal,
          gitBranch,
          gitPrUrl,
          updatedAt: now(),
        })
        .where(eq(threads.id, threadId));

      const [runRow] = await db
        .select()
        .from(runs)
        .where(eq(runs.id, runId))
        .limit(1);
      if (runRow) {
        this.broadcast(workspaceId, {
          type: "run_status",
          threadId,
          run: toRun(runRow),
        });
      }
      const thread = await getThread(threadId);
      if (thread) {
        this.broadcast(workspaceId, { type: "thread_upsert", thread });
      }
    } catch (err) {
      await this.failRun(workspaceId, threadId, runId, err);
    } finally {
      this.activeRuns.delete(threadId);
      const current = this.busy.get(workspaceId);
      if (current?.threadId === threadId) {
        this.busy.delete(workspaceId);
        this.broadcast(workspaceId, { type: "workspace_busy", busy: null });
      }
    }
  }

  private async handleEvent(
    workspaceId: string,
    threadId: string,
    runId: string,
    event: SDKMessage,
  ) {
    if (
      event.type !== "assistant" &&
      event.type !== "thinking" &&
      event.type !== "tool_call" &&
      event.type !== "status"
    ) {
      return;
    }
    if (event.type === "assistant") {
      const text = event.message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      if (!text) return;
    }

    const persisted = await this.persistMessage({
      threadId,
      runId,
      guestId: null,
      type: event.type,
      payload: payloadOf(event),
    });
    this.broadcast(workspaceId, {
      type: "stream_event",
      threadId,
      message: persisted,
    });
  }

  private async persistMessage(opts: {
    threadId: string;
    runId: string | null;
    guestId: string | null;
    type: MessageDTO["type"];
    payload: Record<string, unknown>;
  }): Promise<MessageDTO> {
    const id = nid(16);
    const createdAt = now();
    await db.insert(messages).values({
      id,
      threadId: opts.threadId,
      runId: opts.runId,
      guestId: opts.guestId,
      type: opts.type,
      payloadJson: JSON.stringify(opts.payload),
      createdAt,
    });
    const guest = opts.guestId ? await getGuest(opts.guestId) : null;
    return toMessage(
      {
        id,
        threadId: opts.threadId,
        runId: opts.runId,
        guestId: opts.guestId,
        type: opts.type,
        payloadJson: JSON.stringify(opts.payload),
        createdAt,
      },
      guest,
    );
  }

  private async failRun(
    workspaceId: string,
    threadId: string,
    runId: string,
    err: unknown,
  ) {
    const { message, helpUrl } = describeError(err);
    await db
      .update(runs)
      .set({ status: "error", error: message, finishedAt: now() })
      .where(eq(runs.id, runId));
    await db
      .update(threads)
      .set({ status: "error", updatedAt: now() })
      .where(eq(threads.id, threadId));

    const statusMessage = await this.persistMessage({
      threadId,
      runId,
      guestId: null,
      type: "status",
      payload: { status: "ERROR", message },
    });
    this.broadcast(workspaceId, {
      type: "stream_event",
      threadId,
      message: statusMessage,
    });
    this.broadcast(workspaceId, { type: "error", message, helpUrl });
    const thread = await getThread(threadId);
    if (thread) {
      this.broadcast(workspaceId, { type: "thread_upsert", thread });
    }

    this.activeRuns.delete(threadId);
    const current = this.busy.get(workspaceId);
    if (current?.threadId === threadId) {
      this.busy.delete(workspaceId);
      this.broadcast(workspaceId, { type: "workspace_busy", busy: null });
    }
  }

  private async markThread(threadId: string, status: ThreadDTO["status"]) {
    await db
      .update(threads)
      .set({ status, updatedAt: now() })
      .where(eq(threads.id, threadId));
  }

  private async disposeAgent(threadId: string) {
    const agent = this.agents.get(threadId);
    this.agents.delete(threadId);
    this.activeRuns.delete(threadId);
    if (!agent) return;
    try {
      agent.close();
    } catch {
      try {
        await agent[Symbol.asyncDispose]();
      } catch {
        // ignore
      }
    }
  }
}

export function describeError(err: unknown): { message: string; helpUrl?: string } {
  if (err instanceof IntegrationNotConnectedError) {
    return {
      message: err.message,
      helpUrl: err.helpUrl,
    };
  }
  if (err instanceof WorkspaceBusyError) {
    return { message: err.message };
  }
  if (err instanceof CursorAgentError) {
    return { message: err.message };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: String(err) };
}
