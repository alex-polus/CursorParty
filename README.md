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

## Requirements

- **Node.js 22.13+** (the Cursor SDK will not load on older runtimes)
- A [Cursor API key](https://cursor.com/dashboard/api) (`CURSOR_API_KEY`)
- The GitHub repo must already be **connected** to that Cursor account / team
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

SQLite lives in `./data/` and is gitignored.
