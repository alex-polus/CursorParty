import type { IncomingMessage, ServerResponse } from "node:http";
import { count, eq } from "drizzle-orm";
import {
  Cursor,
  IntegrationNotConnectedError,
} from "@cursor/sdk";
import { db } from "../db/client";
import { guests, workspaces } from "../db/schema";
import {
  getGuest,
  getGuestInWorkspace,
  getThread,
  getWorkspace,
  listMessages,
  listThreads,
  listWorkspaces,
  toGuest,
} from "../db/queries";
import { colorForIndex } from "../colors";
import { cursorApiKey } from "../env";
import { nid, now } from "../ids";
import { createLogger } from "../logging";
import { GUEST_COOKIE, parseCookies, serializeCookie } from "./cookies";
import {
  isFormSubmission,
  parseWorkspaceCreateInput,
} from "./workspace-input";
import type { Orchestrator } from "../sdk/orchestrator";

const log = createLogger("api");

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw.trim()) return {} as T;
  return JSON.parse(raw) as T;
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function notFound(res: ServerResponse) {
  json(res, 404, { error: "Not found" });
}

function redirect(res: ServerResponse, location: string) {
  res.writeHead(303, {
    Location: location,
    "Cache-Control": "no-store",
  });
  res.end();
}

function normalizeRepo(url: string) {
  return url.trim().replace(/\.git$/i, "").replace(/\/$/, "").toLowerCase();
}

async function validateRepo(repoUrl: string): Promise<{ ok: true } | { ok: false; error: string; helpUrl?: string }> {
  const apiKey = cursorApiKey();
  if (!apiKey) {
    return { ok: true };
  }
  try {
    const repos = await Cursor.repositories.list({ apiKey });
    if (repos.length === 0) return { ok: true };
    const target = normalizeRepo(repoUrl);
    const match = repos.some((r) => normalizeRepo(r.url) === target);
    if (!match) {
      return {
        ok: false,
        error: `That repo is not connected to this Cursor account. Connect it at cursor.com, then retry. Looked for ${repoUrl}.`,
      };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof IntegrationNotConnectedError) {
      log.warn("repository.integration_not_connected", {
        repoUrl,
        error: err,
      });
      return { ok: false, error: err.message, helpUrl: err.helpUrl };
    }
    log.error("repository.validation_failed", err, { repoUrl });
    return { ok: true };
  }
}

export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  orchestrator: Orchestrator,
): Promise<boolean> {
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);
  if (!url.pathname.startsWith("/api/")) return false;

  const method = req.method ?? "GET";
  const path = url.pathname.replace(/\/$/, "") || "/";
  const requestId = String(req.headers["x-request-id"] ?? "unknown");
  const startedAt = performance.now();

  log.debug("request.started", { requestId, method, path });
  res.once("finish", () => {
    log.info("request.completed", {
      requestId,
      method,
      path,
      statusCode: res.statusCode,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    });
  });

  try {
    if (method === "GET" && path === "/api/health") {
      json(res, 200, { ok: true });
      return true;
    }

    if (method === "GET" && path === "/api/defaults") {
      json(res, 200, {
        repoUrl: process.env.CURSOR_PARTY_REPO_URL ?? "",
        startingRef: process.env.CURSOR_PARTY_STARTING_REF ?? "main",
        name: process.env.CURSOR_PARTY_WORKSPACE_NAME ?? "",
        hasApiKey: Boolean(cursorApiKey()),
      });
      return true;
    }

    if (method === "GET" && path === "/api/models") {
      json(res, 200, { models: await orchestrator.listModels() });
      return true;
    }

    if (method === "GET" && path === "/api/workspaces") {
      json(res, 200, { workspaces: await listWorkspaces() });
      return true;
    }

    if (method === "POST" && path === "/api/workspaces") {
      const contentType = req.headers["content-type"];
      const nativeForm = isFormSubmission(contentType);
      let body;
      try {
        body = parseWorkspaceCreateInput(await readBody(req), contentType);
      } catch (err) {
        log.warn("request.invalid_body", {
          requestId,
          method,
          path,
          contentType,
          error: err,
        });
        json(res, 400, { error: "Invalid request body" });
        return true;
      }
      const repoUrl = body.repoUrl?.trim();
      const startingRef = body.startingRef?.trim() || "main";
      if (!repoUrl) {
        json(res, 400, { error: "repoUrl is required" });
        return true;
      }
      const check = await validateRepo(repoUrl);
      if (!check.ok) {
        json(res, 400, { error: check.error, helpUrl: check.helpUrl });
        return true;
      }
      const name =
        body.name?.trim() ||
        repoUrl.split("/").filter(Boolean).slice(-1)[0] ||
        "Workspace";
      const id = nid(10);
      await db.insert(workspaces).values({
        id,
        name,
        repoUrl,
        startingRef,
        createdAt: now(),
      });
      if (nativeForm) {
        redirect(res, `/w/${encodeURIComponent(id)}`);
      } else {
        json(res, 201, { workspace: await getWorkspace(id) });
      }
      return true;
    }

    const wsMatch = path.match(/^\/api\/workspaces\/([^/]+)$/);
    if (method === "GET" && wsMatch) {
      const workspace = await getWorkspace(wsMatch[1]);
      if (!workspace) {
        notFound(res);
        return true;
      }
      const cookies = parseCookies(req.headers.cookie);
      const guestId = cookies[GUEST_COOKIE];
      const me = guestId
        ? await getGuestInWorkspace(guestId, workspace.id)
        : null;
      json(res, 200, {
        workspace,
        me,
        busy: orchestrator.getBusy(workspace.id),
      });
      return true;
    }

    const guestMatch = path.match(/^\/api\/workspaces\/([^/]+)\/guests$/);
    if (method === "POST" && guestMatch) {
      const workspace = await getWorkspace(guestMatch[1]);
      if (!workspace) {
        notFound(res);
        return true;
      }
      const body = await readJson<{ displayName?: string }>(req);
      const displayName = body.displayName?.trim();
      if (!displayName || displayName.length > 32) {
        json(res, 400, { error: "Display name must be 1–32 characters." });
        return true;
      }

      const cookies = parseCookies(req.headers.cookie);
      const existingId = cookies[GUEST_COOKIE];
      const existing = existingId
        ? await getGuestInWorkspace(existingId, workspace.id)
        : null;

      if (existing) {
        await db
          .update(guests)
          .set({ displayName, lastSeenAt: now() })
          .where(eq(guests.id, existing.id));
        const me = await getGuest(existing.id);
        json(res, 200, { guest: me });
        return true;
      }

      const [{ value: guestCount }] = await db
        .select({ value: count() })
        .from(guests)
        .where(eq(guests.workspaceId, workspace.id));

      const id = existingId && !(await getGuest(existingId)) ? existingId : nid(12);
      const color = colorForIndex(Number(guestCount) || 0);
      const t = now();
      await db.insert(guests).values({
        id,
        workspaceId: workspace.id,
        displayName,
        color,
        createdAt: t,
        lastSeenAt: t,
      });
      json(res, 201, { guest: toGuest({
        id,
        workspaceId: workspace.id,
        displayName,
        color,
        createdAt: t,
        lastSeenAt: t,
      }) }, { "Set-Cookie": serializeCookie(GUEST_COOKIE, id) });
      return true;
    }

    const threadsMatch = path.match(/^\/api\/workspaces\/([^/]+)\/threads$/);
    if (method === "GET" && threadsMatch) {
      const workspace = await getWorkspace(threadsMatch[1]);
      if (!workspace) {
        notFound(res);
        return true;
      }
      json(res, 200, { threads: await listThreads(workspace.id) });
      return true;
    }

    const threadMatch = path.match(/^\/api\/threads\/([^/]+)$/);
    if (method === "GET" && threadMatch) {
      const thread = await getThread(threadMatch[1]);
      if (!thread) {
        notFound(res);
        return true;
      }
      json(res, 200, { thread });
      return true;
    }

    const msgsMatch = path.match(/^\/api\/threads\/([^/]+)\/messages$/);
    if (method === "GET" && msgsMatch) {
      const thread = await getThread(msgsMatch[1]);
      if (!thread) {
        notFound(res);
        return true;
      }
      json(res, 200, { messages: await listMessages(thread.id) });
      return true;
    }

    notFound(res);
    return true;
  } catch (err) {
    log.error("request.failed", err, {
      requestId,
      method,
      path,
      statusCode: res.statusCode,
      headersSent: res.headersSent,
    });
    json(res, 500, {
      error: err instanceof Error ? err.message : "Server error",
    });
    return true;
  }
}
