# CursorParty

The multiplayer workspace for engineers and agents.

v1 is a **shared Agent View** over a GitHub repo — not a cloud IDE. Engineers still write code in Cursor. CursorParty is the room where the team watches and drives Cursor cloud agents together.

**Happy path:** open the app → create or open a workspace (repo + branch) → pick a name → see who’s online → start a thread → everyone watches the stream → follow up / cancel / archive → late joiners replay history.

## What’s implemented (v1)

This matches the v1 plan: a local-first, production-quality demo for 2–4 people on one machine.

### Product shape

- Multiplayer **Agent View**, not a shared IDE. No in-browser editor, file tree, or live code cursors.
- One workspace = **one GitHub repo + starting branch**. Each agent run clones that repo into an isolated Cursor cloud VM.
- **One running agent at a time** per workspace (plus Cursor’s own one-run-per-agent limit). Starting or following up while a run is in progress is blocked with a clear “wait or cancel” state.
- Anyone with the workspace URL is a full operator (start, follow up, cancel, delete). There is no login.

### Room and identity

- Create a workspace from a GitHub URL + branch, or join via `/w/[id]`.
- Optional env defaults seed a `default` workspace and prefill the home form.
- Sticky guests: HTTP-only cookie, display name, and a stable color. Refresh keeps the same identity.
- Live presence: who is online and which thread they are watching, with colored avatars on the thread list, prompts, and presence panel.

### Agents and transcripts

- Threads backed by `@cursor/sdk` **cloud** agents (`Agent.create` / `Agent.resume` / `send` / `stream` / `wait`).
- Live shared streaming over WebSocket: assistant text, thinking, tool-call start/complete, and status. Events are persisted to SQLite before broadcast, so a refresh or late join replays history.
- Follow-up on the same thread, cancel, plan vs agent mode, model picker (`Cursor.models.list()`), archive, and delete (with confirm).
- Git branch / PR URL chip when the SDK returns git metadata. No in-app diff viewer.
- Auto-titled threads from the first prompt.
- Collapsible tool-call cards (name + status; args/result parsed defensively).
- Workspace create checks `Cursor.repositories.list()` when an API key is set, and surfaces Cursor’s GitHub-connect help URL when the integration is missing.
- On server restart, in-flight cloud runs are reattached when a `cursorAgentId` / `cursorRunId` was persisted.

### UI

- Agent View layout: left thread list + presence, main transcript, bottom composer (mode, model, send), top bar (repo, branch, invite link, running indicator).
- Distinct CursorParty look (dark, dense, original) — inspired by Agent View, not a Cursor clone.
- Invite-link copy, reconnect banner, empty states, composer autofocus, ⌘N for a new thread.

### Not in v1 (deferred)

- Auth, accounts, RBAC, or per-user API keys
- Parallel running agents
- In-browser file tree, editor, or diffs
- Auto-create PR as a first-class action
- MCP / subagent configuration UI
- File-level live cursors, typing indicators, follow-mode
- Multi-repo or no-repo workspaces
- Production deploy, hosted Turso, billing dashboard

## Requirements

- **Node.js 22.13+** (the Cursor SDK will not load on older runtimes)
- A [Cursor API key](https://cursor.com/dashboard/api) (`CURSOR_API_KEY`)
- The GitHub repo must already be **connected** to that Cursor account / team (Cursor GitHub App)
- Anyone with the workspace URL can start agents and **spend that API key**

SDK-created cloud agents are hidden in Cursor’s default agent list. In the Cursor app or web Agents window, use **Filter → Source → SDK**.

## Run

```bash
cp .env.example .env
# edit .env — at minimum set CURSOR_API_KEY
# optionally set CURSOR_PARTY_REPO_URL and CURSOR_PARTY_STARTING_REF

pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Create a room, pick a name, send a prompt.

### Connect a GitHub repo

Cloud agents clone the repo in a Cursor VM; they do not use your local working tree.

1. Put a user or service-account key in `CURSOR_API_KEY`.
2. In the Cursor dashboard, connect GitHub and grant the Cursor GitHub App access to the repo.
3. Use the **https** GitHub URL (`https://github.com/org/repo`), not SSH or a local path.
4. `CURSOR_PARTY_REPO_URL` / `STARTING_REF` / `WORKSPACE_NAME` only prefill the form and seed `/w/default` on first boot. You can also paste the URL in the UI.

If a default workspace was already seeded with a placeholder URL, create a new room instead of relying on `/w/default`.

### Share with friends (same process)

Everyone must hit **this** Node process:

- Same LAN: `http://YOUR_LAN_IP:3000`
- Off-network: tunnel with ngrok, Cloudflare Tunnel, or similar, then share that URL

Copy **Invite link** from the workspace top bar.

## Environment

See `.env.example`.

| Variable | Purpose |
|---|---|
| `CURSOR_API_KEY` | User or service-account key. Required to run agents. |
| `CURSOR_PARTY_REPO_URL` | Optional default repo; also seeds a `default` workspace on boot |
| `CURSOR_PARTY_STARTING_REF` | Default branch (`main`) |
| `CURSOR_PARTY_WORKSPACE_NAME` | Default room name |
| `DATABASE_URL` | libsql/SQLite URL, default `file:./data/cursorparty.db` |
| `HOST` / `PORT` | Bind address, default `0.0.0.0:3000` |
| `LOG_LEVEL` | Structured server log threshold: `debug`, `info`, `warn`, or `error` |

Server logs are emitted as one-line JSON with a timestamp, component, event name,
and relevant workspace/thread/run/request IDs. HTTP responses include an
`X-Request-Id` header for correlation. Error logs retain stack traces, nested
causes, and common SDK/HTTP error metadata while fields that look like secrets,
tokens, authorization values, or cookies are redacted.

SQLite lives in `./data/` and is gitignored.

## Architecture (v1)

A single long-lived Node process (custom `server.ts`) serves Next.js, REST, WebSockets, and the Cursor SDK together. SQLite is the source of truth for workspaces, guests, threads, runs, and messages. Presence is in-memory on the WebSocket hub.

```
Browser  →  Next.js UI + REST (first paint)
         →  WebSocket room (presence, stream, controls)
Node     →  SQLite  +  @cursor/sdk cloud agents  →  GitHub repo
```
