import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repoUrl: text("repo_url").notNull(),
  startingRef: text("starting_ref").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const guests = sqliteTable("guests", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  displayName: text("display_name").notNull(),
  color: text("color").notNull(),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  cursorAgentId: text("cursor_agent_id"),
  title: text("title").notNull(),
  status: text("status").notNull(),
  mode: text("mode").notNull(),
  model: text("model").notNull(),
  createdByGuestId: text("created_by_guest_id").notNull(),
  gitBranch: text("git_branch"),
  gitPrUrl: text("git_pr_url"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  cursorRunId: text("cursor_run_id"),
  status: text("status").notNull(),
  startedByGuestId: text("started_by_guest_id").notNull(),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  finishedAt: integer("finished_at"),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  runId: text("run_id"),
  guestId: text("guest_id"),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: integer("created_at").notNull(),
});
