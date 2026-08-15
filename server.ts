import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import next from "next";
import { WebSocketServer } from "ws";
import { ensureSchema } from "./src/lib/db/ensure";
import { seedDefaultWorkspace } from "./src/lib/db/seed";
import { listenHost, listenPort } from "./src/lib/env";
import { handleApi } from "./src/lib/http/api";
import { Orchestrator } from "./src/lib/sdk/orchestrator";
import { Hub } from "./src/lib/ws/hub";
import { createLogger } from "./src/lib/logging";

const log = createLogger("server");

process.on("uncaughtExceptionMonitor", (err, origin) => {
  log.error("process.uncaught_exception", err, { origin });
});

async function main() {
  const dev = process.env.NODE_ENV !== "production";
  const hostname = listenHost();
  const port = listenPort();

  log.info("server.starting", {
    environment: process.env.NODE_ENV ?? "development",
    hostname,
    port,
  });

  await ensureSchema();
  log.info("database.schema_ready");
  await seedDefaultWorkspace();

  const hub = new Hub();
  const orchestrator = new Orchestrator((workspaceId, message) => {
    hub.broadcast(workspaceId, message);
  });
  hub.setOrchestrator(orchestrator);
  await orchestrator.rehydrate();
  log.info("orchestrator.rehydrated");

  const server = createServer();
  const app = next({ dev, hostname, port, httpServer: server });
  const handle = app.getRequestHandler();
  await app.prepare();
  log.info("next.prepared");

  server.on("request", async (req, res) => {
    const requestId = randomUUID();
    req.headers["x-request-id"] = requestId;
    res.setHeader("X-Request-Id", requestId);
    try {
      const requestUrl = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );
      if (requestUrl.pathname.startsWith("/api/")) {
        await handleApi(req, res, orchestrator);
        return;
      }
      await handle(req, res);
    } catch (err) {
      log.error("http.request_failed", err, {
        requestId,
        method: req.method,
        path: req.url,
        statusCode: res.statusCode,
        headersSent: res.headersSent,
      });
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal server error");
      }
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  hub.attach(wss);
  server.on("upgrade", (req, socket, head) => {
    const requestUrl = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    if (requestUrl.pathname !== "/ws") return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  server.listen(port, hostname, () => {
    const display = hostname === "0.0.0.0" ? "localhost" : hostname;
    log.info("server.listening", {
      url: `http://${display}:${port}`,
      environment: process.env.NODE_ENV ?? "development",
    });
  });

  server.on("clientError", (err, socket) => {
    log.warn("http.client_error", {
      error: err,
      remoteAddress:
        "remoteAddress" in socket ? socket.remoteAddress : undefined,
    });
  });

  wss.on("error", (err) => {
    log.error("websocket.server_error", err);
  });
}

main().catch((err) => {
  log.error("server.startup_failed", err);
  process.exit(1);
});
