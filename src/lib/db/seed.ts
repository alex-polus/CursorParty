import { eq } from "drizzle-orm";
import { db } from "./client";
import { workspaces } from "./schema";
import { nid, now } from "../ids";

export async function seedDefaultWorkspace() {
  const repoUrl = process.env.CURSOR_PARTY_REPO_URL?.trim();
  if (!repoUrl) return;

  const existing = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, "default"))
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(workspaces).values({
    id: "default",
    name: process.env.CURSOR_PARTY_WORKSPACE_NAME?.trim() || "CursorParty",
    repoUrl,
    startingRef: process.env.CURSOR_PARTY_STARTING_REF?.trim() || "main",
    createdAt: now(),
  });

  console.log(`[cursorparty] seeded default workspace from ${repoUrl}`);
}

export { nid };
