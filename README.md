<p align="center">
  <img src="logo.png" alt="CursorParty logo" width="200" />
</p>

# CursorParty

The multiplayer workspace for engineers and agents.

v1 is a **shared Agent View** over a GitHub repo — not a cloud IDE. Engineers still write code in Cursor. CursorParty is the room where the team watches and drives Cursor cloud agents together.

**Happy path:** open the app → create or open a workspace (repo + branch) → pick a name → see who’s online → start a thread → everyone watches the stream → follow up / cancel / archive → late joiners replay history.

> ⚠️ **Security:** there is no login. **Anyone with a workspace URL can start agents and spend your `CURSOR_API_KEY`.** Treat invite links like the API key itself. Only share within a trusted group and revoke the key if a link leaks.

## Preview

<!-- Add screenshots / GIFs of the Agent View, thread streaming, and presence here. -->
<p align="center">
  <em>Screenshots and demo GIFs coming soon.</em>
</p>

## Quickstart

```bash
pnpm install
cp .env.example .env         # set CURSOR_API_KEY at minimum
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), create a room, pick a name, send a prompt with `⌘/Ctrl+Enter`. See [Run](#run) for production, GitHub setup, and sharing on a LAN or tunnel.

## Use cases

- **War room / incident response** — pile into a workspace during an outage; one dev drives the agent while the rest watch the stream, chime in, or cancel and redirect.
- **Shared skill / team knowledge** — a prompt + agent run becomes a replayable session the whole team learns from; late joiners scroll back through the full transcript.
- **Pair with an agent** — two devs co-drive a single run, taking turns on follow-ups instead of forking into separate transcripts.
- **Onboarding** — new hires watch senior devs prompt agents on the real repo, then replay past threads to learn the codebase and the team’s prompting style.
- **Technical interviews** — interviewer and candidate share a room; discuss approach as the candidate drives the agent through a task, with a full transcript for later review.

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

### What's next

Near-term direction, in rough priority order. Nothing here is committed — this is where the product is heading, not a shipping schedule.

- **Guest auth + per-user API keys** so an invite link stops equaling full spend on the host's key.
- **One-click "open PR"** from a finished run, using the git metadata the SDK already returns.
- **Parallel agents per workspace** so a room isn't blocked on a single run.
- **MCP / subagent configuration UI** for teams that want to customize what the cloud agent can call.
- **Hosted deploy** (managed CursorParty rooms with proper auth and quotas) once the local demo hardens.

## How it works

A single long-lived Node process (`server.ts`) hosts Next.js, REST, and a WebSocket hub on one port. SQLite is the source of truth for workspaces, guests, threads, runs, and messages. Presence is in-memory on the WebSocket hub.

```
Browser  →  Next.js UI + REST (first paint)
         →  WebSocket room (presence, stream, controls)
Node     →  SQLite  +  @cursor/sdk cloud agents  →  GitHub repo
```

1. Someone creates a workspace pointed at a GitHub repo already connected to Cursor.
2. Guests pick a display name. Identity is an HttpOnly `cp_guest` cookie — name and color stick on that browser.
3. Prompts go over WebSocket (`/ws?workspaceId=…`). The orchestrator creates or resumes a Cursor cloud agent via `@cursor/sdk`, streams events into SQLite, and fans them out to everyone in the room.
4. A workspace mutex blocks a second run while one agent is already going. Anyone can cancel.

Cloud agents clone the repo into an isolated VM. CursorParty never edits local files.

SDK-created agents are hidden in Cursor’s default agent list. In the Cursor app or web Agents window, use **Filter → Source → SDK**.

## Stack

| Layer | Choice |
|---|---|
| UI | Next.js 16, React 19, Tailwind CSS 4 |
| Server | Node custom HTTP + `ws` |
| Agents | [Cursor SDK](https://cursor.com/docs/sdk/typescript) cloud runtime |
| Data | SQLite via libsql + Drizzle |

Schema is created on boot (`src/lib/db/ensure.ts`). SQLite lives in `./data/` and is gitignored.

## Requirements

- **Node.js 22.13+** (the Cursor SDK will not load on older runtimes)
- **pnpm**
- A [Cursor API key](https://cursor.com/dashboard/api) (`CURSOR_API_KEY`)
- The GitHub repo must already be **connected** to that Cursor account / team (Cursor GitHub App)
- Anyone with the workspace URL can start agents and **spend that API key**

## Run

```bash
cp .env.example .env
# edit .env — at minimum set CURSOR_API_KEY
# optionally set CURSOR_PARTY_REPO_URL and CURSOR_PARTY_STARTING_REF

pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Create a room, pick a name, send a prompt (`⌘/Ctrl+Enter`).

If `CURSOR_PARTY_REPO_URL` is set, boot seeds a workspace with id `default`.

### Production (same machine)

```bash
pnpm build
pnpm start
```

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

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Watch-reload the custom server |
| `pnpm build` / `pnpm start` | Production Next.js build, then serve |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | Drizzle kit generate |
| `pnpm db:migrate` | Apply Drizzle migrations (boot already `CREATE TABLE IF NOT EXISTS`) |

## Layout

```
server.ts              HTTP + WebSocket entry
src/app/               Next.js pages (home, /w/[id])
src/components/        Agent View UI
src/lib/http/api.ts    REST (workspaces, guests, threads, health)
src/lib/ws/hub.ts      Presence + client commands
src/lib/sdk/orchestrator.ts  Cursor Agent.create / send / stream / cancel
src/lib/db/            SQLite schema, queries, seed
```

REST is for bootstrap (create room, claim guest, replay history). Live control is WebSocket: `create_thread`, `prompt`, `cancel`, `archive_thread`, `delete_thread`, `viewing`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `@cursor/sdk` fails to load on boot | Node < 22.13. Upgrade the runtime. |
| Workspace create rejects the repo URL | The Cursor GitHub App is not connected to that repo on your account. Connect it in the Cursor dashboard, then retry. |
| REST works but the transcript never streams | You started with `pnpm next dev`. Use `pnpm dev` so the custom `server.ts` runs REST and WebSocket on the same port. |
| Can't find the running agent in Cursor | SDK-created agents are hidden by default. In the Agents window, apply **Filter → Source → SDK**. |
| `/w/default` points at the wrong repo | It was seeded on an earlier boot from `CURSOR_PARTY_REPO_URL`. Create a fresh workspace from the home page instead. |
| Guest lost their name / color | Cookies were cleared. A new guest identity is created; the old name stays in history. |

## Caveats

- Repo validation uses `Cursor.repositories.list`. Connect the GitHub repo on that Cursor account before creating a workspace.
- If the process restarts mid-run, the orchestrator rehydrates active SDK runs on boot.
- No per-guest spend limit — every operator draws from the same `CURSOR_API_KEY`.
