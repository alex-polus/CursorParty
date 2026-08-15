import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { guests } from "../db/schema";
import { getGuestInWorkspace, getWorkspace, toGuest } from "../db/queries";
import { now } from "../ids";
import { createLogger } from "../logging";
import {
  GUEST_COOKIE,
  guestCookieName,
  parseCookies,
} from "../http/cookies";
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

const log = createLogger("websocket");

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
        try {
          socket.send(payload);
        } catch (err) {
          log.error("broadcast.failed", err, {
            workspaceId,
            guestId: meta.guestId,
            messageType: message.type,
          });
        }
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
      void this.onConnection(socket, req).catch((err) => {
        log.error("connection.unhandled_failure", err, {
          remoteAddress: req.socket.remoteAddress,
        });
        socket.close(1011, "Internal server error");
      });
    });
  }

  private async onConnection(socket: WebSocket, req: IncomingMessage) {
    const queuedMessages: string[] = [];
    const queueMessage = (raw: RawData) => {
      if (queuedMessages.length < 32) queuedMessages.push(raw.toString());
    };
    socket.on("message", queueMessage);

    try {
      const host = req.headers.host ?? "localhost";
      const url = new URL(req.url ?? "/ws", `http://${host}`);
      const workspaceId = url.searchParams.get("workspaceId");
      const cookies = parseCookies(req.headers.cookie);
      const guestId =
        (workspaceId ? cookies[guestCookieName(workspaceId)] : undefined) ??
        cookies[GUEST_COOKIE];

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

      if (socket.readyState !== WebSocket.OPEN) return;

      this.sockets.set(socket, {
        workspaceId,
        guestId: guest.id,
        viewingThreadId: null,
      });

      socket.off("message", queueMessage);
      let commandQueue = Promise.resolve();
      const enqueueMessage = (raw: string) => {
        commandQueue = commandQueue
          .then(() => this.onMessage(socket, raw))
          .catch((err) => {
            log.error("message.unhandled_failure", err, {
              workspaceId,
              guestId: guest.id,
            });
          });
      };
      socket.on("message", (raw) => {
        enqueueMessage(raw.toString());
      });
      socket.on("close", (code, reason) => {
        this.sockets.delete(socket);
        log.info("connection.closed", {
          workspaceId,
          guestId: guest.id,
          code,
          reason: reason.toString(),
        });
        void this.emitPresence(workspaceId).catch((err) => {
          log.error("presence.broadcast_failed", err, { workspaceId });
        });
      });
      socket.on("error", (err) => {
        log.error("connection.socket_error", err, {
          workspaceId,
          guestId: guest.id,
        });
      });

      for (const raw of queuedMessages) {
        enqueueMessage(raw);
      }

      log.info("connection.opened", {
        workspaceId,
        guestId: guest.id,
        remoteAddress: req.socket.remoteAddress,
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
    } catch (err) {
      log.error("connection.rejected", err, {
        remoteAddress: req.socket.remoteAddress,
      });
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
      const parsed: unknown = JSON.parse(raw);
      if (!isClientMessage(parsed)) throw new Error("Invalid message shape");
      msg = parsed;
    } catch (err) {
      log.warn("message.invalid_json", {
        error: err,
        workspaceId: meta.workspaceId,
        guestId: meta.guestId,
        payloadBytes: Buffer.byteLength(raw),
      });
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
        log.info("message.workspace_busy", {
          workspaceId: meta.workspaceId,
          guestId: meta.guestId,
          messageType: msg.type,
          activeThreadId: err.busy.threadId,
        });
        send(socket, { type: "workspace_busy", busy: err.busy });
        send(socket, { type: "error", message: err.message });
        return;
      }
      log.error("message.command_failed", err, {
        workspaceId: meta.workspaceId,
        guestId: meta.guestId,
        messageType: msg.type,
      });
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
    try {
      socket.send(JSON.stringify(message));
    } catch (err) {
      log.error("send.failed", err, { messageType: message.type });
    }
  }
}

function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case "hello":
      return true;
    case "viewing":
      return message.threadId === null || typeof message.threadId === "string";
    case "create_thread":
      return isPromptFields(message);
    case "prompt":
      return typeof message.threadId === "string" && isPromptFields(message);
    case "cancel":
    case "archive_thread":
    case "delete_thread":
      return typeof message.threadId === "string";
    default:
      return false;
  }
}

function isPromptFields(message: Record<string, unknown>): boolean {
  return (
    typeof message.text === "string" &&
    (message.mode === "agent" || message.mode === "plan") &&
    typeof message.model === "string"
  );
}
