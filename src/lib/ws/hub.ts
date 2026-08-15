import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { guests } from "../db/schema";
import { getGuestInWorkspace, getWorkspace, toGuest } from "../db/queries";
import { now } from "../ids";
import { GUEST_COOKIE, parseCookies } from "../http/cookies";
import {
  describeError,
  Orchestrator,
  WorkspaceBusyError,
} from "../sdk/orchestrator";
import type {
  ClientMessage,
  PresenceGuest,
  ServerMessage,
} from "../types";

type SocketMeta = {
  workspaceId: string;
  guestId: string;
  viewingThreadId: string | null;
};

export class Hub {
  private sockets = new Map<WebSocket, SocketMeta>();
  private orchestrator!: Orchestrator;

  setOrchestrator(orchestrator: Orchestrator) {
    this.orchestrator = orchestrator;
  }

  broadcast(workspaceId: string, message: ServerMessage) {
    const payload = JSON.stringify(message);
    for (const [socket, meta] of this.sockets) {
      if (meta.workspaceId === workspaceId && socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  presence(workspaceId: string): PresenceGuest[] {
    const seen = new Map<string, PresenceGuest>();
    for (const meta of this.sockets.values()) {
      if (meta.workspaceId !== workspaceId) continue;
      const existing = seen.get(meta.guestId);
      if (!existing) {
        seen.set(meta.guestId, {
          id: meta.guestId,
          workspaceId,
          displayName: "",
          color: "",
          viewingThreadId: meta.viewingThreadId,
        });
      }
    }
    return [...seen.values()];
  }

  attach(wss: WebSocketServer) {
    wss.on("connection", (socket, req) => {
      void this.onConnection(socket, req);
    });
  }

  private async onConnection(socket: WebSocket, req: IncomingMessage) {
    try {
      const host = req.headers.host ?? "localhost";
      const url = new URL(req.url ?? "/ws", `http://${host}`);
      const workspaceId = url.searchParams.get("workspaceId");
      const cookies = parseCookies(req.headers.cookie);
      const guestId = cookies[GUEST_COOKIE];

      if (!workspaceId || !guestId) {
        send(socket, {
          type: "error",
          message: "Pick a display name before joining the room.",
        });
        socket.close();
        return;
      }

      const workspace = await getWorkspace(workspaceId);
      const guest = await getGuestInWorkspace(guestId, workspaceId);
      if (!workspace || !guest) {
        send(socket, {
          type: "error",
          message: "Unknown workspace or guest.",
        });
        socket.close();
        return;
      }

      await db
        .update(guests)
        .set({ lastSeenAt: now() })
        .where(eq(guests.id, guest.id));

      this.sockets.set(socket, {
        workspaceId,
        guestId: guest.id,
        viewingThreadId: null,
      });

      send(socket, { type: "hello_ok", guest, workspace });
      send(socket, {
        type: "models",
        models: await this.orchestrator.listModels(),
      });
      send(socket, {
        type: "workspace_busy",
        busy: this.orchestrator.getBusy(workspaceId),
      });
      await this.emitPresence(workspaceId);

      socket.on("message", (raw) => {
        void this.onMessage(socket, raw.toString());
      });
      socket.on("close", () => {
        this.sockets.delete(socket);
        void this.emitPresence(workspaceId);
      });
    } catch (err) {
      const { message, helpUrl } = describeError(err);
      send(socket, { type: "error", message, helpUrl });
      socket.close();
    }
  }

  private async onMessage(socket: WebSocket, raw: string) {
    const meta = this.sockets.get(socket);
    if (!meta) return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      send(socket, { type: "error", message: "Invalid message." });
      return;
    }

    try {
      switch (msg.type) {
        case "hello":
          send(socket, {
            type: "workspace_busy",
            busy: this.orchestrator.getBusy(meta.workspaceId),
          });
          await this.emitPresence(meta.workspaceId);
          break;
        case "viewing":
          meta.viewingThreadId = msg.threadId;
          await this.emitPresence(meta.workspaceId);
          break;
        case "create_thread":
          await this.orchestrator.prompt({
            workspaceId: meta.workspaceId,
            guestId: meta.guestId,
            text: msg.text,
            mode: msg.mode,
            model: msg.model,
          });
          break;
        case "prompt":
          await this.orchestrator.prompt({
            workspaceId: meta.workspaceId,
            threadId: msg.threadId,
            guestId: meta.guestId,
            text: msg.text,
            mode: msg.mode,
            model: msg.model,
          });
          break;
        case "cancel":
          await this.orchestrator.cancel(meta.workspaceId, msg.threadId);
          break;
        case "archive_thread":
          await this.orchestrator.archive(meta.workspaceId, msg.threadId);
          break;
        case "delete_thread":
          await this.orchestrator.delete(meta.workspaceId, msg.threadId);
          break;
        default:
          send(socket, { type: "error", message: "Unknown message type." });
      }
    } catch (err) {
      if (err instanceof WorkspaceBusyError) {
        send(socket, { type: "workspace_busy", busy: err.busy });
        send(socket, { type: "error", message: err.message });
        return;
      }
      const { message, helpUrl } = describeError(err);
      send(socket, { type: "error", message, helpUrl });
    }
  }

  private async emitPresence(workspaceId: string) {
    const metas = [...this.sockets.values()].filter(
      (m) => m.workspaceId === workspaceId,
    );
    const ids = [...new Set(metas.map((m) => m.guestId))];
    const rows =
      ids.length === 0
        ? []
        : await db.select().from(guests);

    const byId = new Map(rows.map((g) => [g.id, toGuest(g)]));
    const viewing = new Map<string, string | null>();
    for (const meta of metas) {
      viewing.set(meta.guestId, meta.viewingThreadId);
    }

    const list: PresenceGuest[] = ids
      .map((id) => {
        const guest = byId.get(id);
        if (!guest) return null;
        return {
          ...guest,
          viewingThreadId: viewing.get(id) ?? null,
        };
      })
      .filter((g): g is PresenceGuest => g !== null);

    this.broadcast(workspaceId, { type: "presence_state", guests: list });
  }
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}
