# CursorParty

The multiplayer workspace for engineers and agents.

v1 is a **shared Agent View** over a GitHub repo — not a cloud IDE. Engineers still write code in Cursor. CursorParty is the room where the team watches and drives Cursor cloud agents together.

## What it is

- One workspace = one GitHub repo + starting branch
- Sticky guest names and colors (no login)
- Live presence: who is online and which thread they are watching
- Shared streaming transcripts, persisted so late joiners can catch up
- One running agent at a time per workspace (Cursor also allows only one active run per agent)
- Follow-up, cancel, plan/agent mode, model picker, archive/delete
- Git branch / PR URL chip when the SDK returns it

## What it is not

- Not a collaborative code editor or file tree
- Not production auth, RBAC, or per-user API keys
- Not parallel running agents (that is the first upgrade after v1)
- Not a deploy target — `pnpm dev` on one machine is the product

## How it works

A custom Node HTTP server (`server.ts`) hosts Next.js, REST, and a WebSocket hub on one port.

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
- The GitHub repo must already be **connected** to that Cursor account / team
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

## Caveats

- Treat the invite URL like the API key. There is no login and no per-guest spend limit.
- Repo validation uses `Cursor.repositories.list`. Connect the GitHub repo on that Cursor account before creating a workspace.
- If the process restarts mid-run, the orchestrator rehydrates active SDK runs on boot.
- Clearing cookies creates a new guest identity; the old name stays in history.
- `pnpm next dev` alone is not enough — use `pnpm dev` so REST and WebSocket share the same server.
