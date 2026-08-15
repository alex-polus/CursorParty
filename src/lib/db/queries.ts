import { desc, eq } from "drizzle-orm";
import { db } from "./client";
import { guests, messages, runs, threads, workspaces } from "./schema";
import type {
  GuestDTO,
  MessageDTO,
  RunDTO,
  ThreadDTO,
  WorkspaceDTO,
} from "../types";
import { createLogger } from "../logging";

const log = createLogger("database");

export function toWorkspace(row: typeof workspaces.$inferSelect): WorkspaceDTO {
  return {
    id: row.id,
    name: row.name,
    repoUrl: row.repoUrl,
    startingRef: row.startingRef,
    createdAt: row.createdAt,
  };
}

export function toGuest(row: typeof guests.$inferSelect): GuestDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    displayName: row.displayName,
    color: row.color,
    profilePicture: row.profilePicture,
  };
}

export function toThread(row: typeof threads.$inferSelect): ThreadDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    cursorAgentId: row.cursorAgentId,
    title: row.title,
    status: row.status as ThreadDTO["status"],
    mode: row.mode as ThreadDTO["mode"],
    model: row.model,
    createdByGuestId: row.createdByGuestId,
    gitBranch: row.gitBranch,
    gitPrUrl: row.gitPrUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRun(row: typeof runs.$inferSelect): RunDTO {
  return {
    id: row.id,
    threadId: row.threadId,
    cursorRunId: row.cursorRunId,
    status: row.status as RunDTO["status"],
    startedByGuestId: row.startedByGuestId,
    error: row.error,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}

export function toMessage(
  row: typeof messages.$inferSelect,
  guest: GuestDTO | null,
): MessageDTO {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
  } catch (err) {
    log.error("message.invalid_payload_json", err, {
      messageId: row.id,
      threadId: row.threadId,
      runId: row.runId,
      payloadBytes: Buffer.byteLength(row.payloadJson),
    });
    payload = { raw: row.payloadJson };
  }
  return {
    id: row.id,
    threadId: row.threadId,
    runId: row.runId,
    guestId: row.guestId,
    type: row.type as MessageDTO["type"],
    payload,
    createdAt: row.createdAt,
    guest,
  };
}

export async function getWorkspace(id: string) {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  return row ? toWorkspace(row) : null;
}

export async function listWorkspaces() {
  const rows = await db
    .select()
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt));
  return rows.map(toWorkspace);
}

export async function listThreads(workspaceId: string) {
  const rows = await db
    .select()
    .from(threads)
    .where(eq(threads.workspaceId, workspaceId))
    .orderBy(desc(threads.updatedAt));
  return rows.map(toThread);
}

export async function getThread(id: string) {
  const [row] = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
  return row ? toThread(row) : null;
}

export async function getGuest(id: string) {
  const [row] = await db.select().from(guests).where(eq(guests.id, id)).limit(1);
  return row ? toGuest(row) : null;
}

export async function getGuestInWorkspace(id: string, workspaceId: string) {
  const [row] = await db.select().from(guests).where(eq(guests.id, id)).limit(1);
  if (!row || row.workspaceId !== workspaceId) return null;
  return toGuest(row);
}

export async function listMessages(threadId: string) {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(messages.createdAt);

  const guestIds = [...new Set(rows.map((r) => r.guestId).filter(Boolean))] as string[];
  const guestRows =
    guestIds.length === 0
      ? []
      : await db.select().from(guests);

  const guestMap = new Map(
    guestRows.filter((g) => guestIds.includes(g.id)).map((g) => [g.id, toGuest(g)]),
  );

  return rows.map((row) =>
    toMessage(row, row.guestId ? (guestMap.get(row.guestId) ?? null) : null),
  );
}
