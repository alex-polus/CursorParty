import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer } from "ws";
import { ensureSchema } from "./src/lib/db/ensure";
import { seedDefaultWorkspace } from "./src/lib/db/seed";
import { listenHost, listenPort } from "./src/lib/env";
import { handleApi } from "./src/lib/http/api";
import { Orchestrator } from "./src/lib/sdk/orchestrator";
import { Hub } from "./src/lib/ws/hub";

async function main() {
  const dev = process.env.NODE_ENV !== "production";
  const hostname = listenHost();
  const port = listenPort();

  await ensureSchema();
  await seedDefaultWorkspace();

  const hub = new Hub();
  const orchestrator = new Orchestrator((workspaceId, message) => {
    hub.broadcast(workspaceId, message);
  });
  hub.setOrchestrator(orchestrator);
  await orchestrator.rehydrate();

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => {
    void (async () => {
      try {
        if (await handleApi(req, res, orchestrator)) return;
        const parsedUrl = parse(req.url ?? "/", true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error("[cursorparty] request", err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end("Internal server error");
        }
      }
    })();
  });

  const wss = new WebSocketServer({ server, path: "/ws" });
  hub.attach(wss);

  server.listen(port, hostname, () => {
    const display = hostname === "0.0.0.0" ? "localhost" : hostname;
    console.log(`[cursorparty] http://${display}:${port}`);
  });
}

main().catch((err) => {
  console.error("[cursorparty] fatal", err);
  process.exit(1);
});
