"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./Composer";
import { GuestGate } from "./GuestGate";
import { PresencePanel } from "./PresencePanel";
import { ThreadList } from "./ThreadList";
import { TopBar } from "./TopBar";
import { Transcript } from "./Transcript";
import {
  claimGuest,
  fetchMessages,
  fetchModels,
  fetchThreads,
  fetchWorkspace,
} from "@/lib/client/api";
import type {
  AgentMode,
  BusyState,
  ClientMessage,
  GuestDTO,
  MessageDTO,
  ModelDTO,
  PresenceGuest,
  ServerMessage,
  ThreadDTO,
  WorkspaceDTO,
} from "@/lib/types";

export function WorkspaceApp({ workspaceId }: { workspaceId: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceDTO | null>(null);
  const [me, setMe] = useState<GuestDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [presence, setPresence] = useState<PresenceGuest[]>([]);
  const [models, setModels] = useState<ModelDTO[]>([]);
  const [busy, setBusy] = useState<BusyState | null>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<AgentMode>("agent");
  const [model, setModel] = useState("composer-2.5");
  const [liveText, setLiveText] = useState("");
  const [liveThinking, setLiveThinking] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [draftThread, setDraftThread] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const selectedRef = useRef<string | null>(null);
  const retryRef = useRef(0);
  const draftRef = useRef(false);
  const modelRef = useRef(model);
  const handlerRef = useRef<(msg: ServerMessage) => void>(() => {});

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    draftRef.current = draftThread;
  }, [draftThread]);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const onServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "hello_ok":
        setMe(msg.guest);
        setWorkspace(msg.workspace);
        break;
      case "presence_state":
        setPresence(msg.guests);
        break;
      case "models":
        setModels(msg.models);
        if (msg.models[0] && modelRef.current === "composer-2.5") {
          const preferred =
            msg.models.find((m) => m.id === "composer-2.5") ?? msg.models[0];
          setModel(preferred.id);
        }
        break;
      case "workspace_busy":
        setBusy(msg.busy);
        break;
      case "thread_upsert":
        setThreads((prev) => {
          const i = prev.findIndex((t) => t.id === msg.thread.id);
          if (i === -1) return [msg.thread, ...prev];
          const next = [...prev];
          next[i] = msg.thread;
          return next.sort((a, b) => b.updatedAt - a.updatedAt);
        });
        if (draftRef.current && !selectedRef.current) {
          selectedRef.current = msg.thread.id;
          setSelectedId(msg.thread.id);
          setDraftThread(false);
        }
        break;
      case "thread_removed":
        setThreads((prev) => prev.filter((t) => t.id !== msg.threadId));
        if (selectedRef.current === msg.threadId) {
          setSelectedId(null);
          setMessages([]);
        }
        break;
      case "stream_event":
        if (msg.threadId === selectedRef.current) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.message.id)) return prev;
            return [...prev, msg.message];
          });
          if (msg.message.type === "assistant") setLiveText("");
          if (msg.message.type === "thinking") setLiveThinking("");
        }
        break;
      case "stream_delta":
        if (msg.threadId !== selectedRef.current) break;
        if (msg.kind === "text") setLiveText((s) => s + msg.text);
        if (msg.kind === "thinking") setLiveThinking((s) => s + msg.text);
        break;
      case "run_status":
        break;
      case "error":
        flash(msg.helpUrl ? `${msg.message} — ${msg.helpUrl}` : msg.message);
        break;
    }
  }, [flash]);

  useEffect(() => {
    handlerRef.current = onServerMessage;
  }, [onServerMessage]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchWorkspace(workspaceId);
        setWorkspace(data.workspace);
        setMe(data.me);
        setBusy(data.busy);
        const [t, m] = await Promise.all([
          fetchThreads(workspaceId),
          fetchModels(),
        ]);
        setThreads(t.threads);
        setModels(m.models);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Workspace not found");
      }
    })();
  }, [workspaceId]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(
        `${proto}://${window.location.host}/ws?workspaceId=${encodeURIComponent(workspaceId)}`,
      );
      wsRef.current = socket;
      socket.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        socket.send(JSON.stringify({ type: "hello" } satisfies ClientMessage));
        if (selectedRef.current) {
          socket.send(
            JSON.stringify({
              type: "viewing",
              threadId: selectedRef.current,
            } satisfies ClientMessage),
          );
        }
      };
      socket.onmessage = (ev) => {
        try {
          handlerRef.current(JSON.parse(ev.data as string) as ServerMessage);
        } catch {
          // ignore
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        const delay = Math.min(8000, 600 * 2 ** retryRef.current);
        retryRef.current += 1;
        window.setTimeout(connect, delay);
      };
    }

    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [me, workspaceId]);

  useEffect(() => {
    send({ type: "viewing", threadId: selectedId });
  }, [selectedId, send]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setLiveText("");
      setLiveThinking("");
      return;
    }
    setLiveText("");
    setLiveThinking("");
    void fetchMessages(selectedId)
      .then((r) => setMessages(r.messages))
      .catch((err) => flash(err instanceof Error ? err.message : "Failed to load messages"));
  }, [flash, selectedId]);

  const selected = useMemo(
    () => threads.find((t) => t.id === selectedId) ?? null,
    [threads, selectedId],
  );

  const disabledReason = useMemo(() => {
    if (busy) {
      return `${busy.guestName}'s agent is running — wait or cancel it.`;
    }
    if (selected?.status === "archived") return "This thread is archived.";
    return null;
  }, [busy, selected]);

  async function onJoin(displayName: string) {
    const { guest } = await claimGuest(workspaceId, displayName);
    setMe(guest);
  }

  function onNew() {
    setDraftThread(true);
    setSelectedId(null);
    setMessages([]);
    setText("");
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "TEXTAREA" || tag === "INPUT") return;
        e.preventDefault();
        onNew();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (selectedId) {
      send({ type: "prompt", threadId: selectedId, text: trimmed, mode, model });
    } else {
      send({ type: "create_thread", text: trimmed, mode, model });
      setDraftThread(true);
    }
    setText("");
  }

  function onCancel() {
    const threadId = busy?.threadId ?? selectedId;
    if (!threadId) return;
    send({ type: "cancel", threadId });
  }

  if (loadError) {
    return (
      <main className="grid min-h-full place-items-center px-6">
        <div className="text-center">
          <p className="ticket">404</p>
          <h1 className="wordmark mt-2 text-5xl">No such room</h1>
          <p className="mt-3 text-sm text-mute">{loadError}</p>
          <a href="/" className="mt-6 inline-block text-sm text-tangerine">
            ← back to the door
          </a>
        </div>
      </main>
    );
  }

  if (!workspace) {
    return (
      <main className="grid min-h-full place-items-center">
        <p className="ticket">loading the room…</p>
      </main>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <TopBar workspace={workspace} busy={busy} connected={connected} />
      {!connected && me && (
        <p className="border-b border-tangerine/40 bg-tangerine/10 px-4 py-1.5 text-center font-mono text-[11px] uppercase tracking-wider">
          Reconnecting to the room…
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[272px] shrink-0 flex-col border-r border-rule bg-ink-2">
          <ThreadList
            threads={threads}
            selectedId={draftThread ? null : selectedId}
            presence={presence}
            showArchived={showArchived}
            onSelect={(id) => {
              setDraftThread(false);
              setSelectedId(id);
            }}
            onNew={onNew}
            onArchive={(id) => send({ type: "archive_thread", threadId: id })}
            onDelete={(id) => send({ type: "delete_thread", threadId: id })}
            onToggleArchived={() => setShowArchived((v) => !v)}
          />
          <PresencePanel guests={presence} selfId={me?.id ?? null} />
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <Transcript
            thread={draftThread ? null : selected}
            messages={messages}
            liveText={liveText}
            liveThinking={liveThinking}
            selfId={me?.id ?? null}
          />
          <Composer
            text={text}
            mode={mode}
            model={model}
            models={models}
            busy={busy}
            disabledReason={disabledReason}
            onText={setText}
            onMode={setMode}
            onModel={setModel}
            onSend={onSend}
            onCancel={onCancel}
          />
        </section>
      </div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-30 max-w-sm border border-tangerine bg-ink-2 px-3 py-2 text-sm shadow-[6px_6px_0_#ff4d1a]">
          {toast}
        </div>
      )}
      {!me && <GuestGate onJoin={onJoin} />}
    </div>
  );
}
