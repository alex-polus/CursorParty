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
import {
  defaultModelParams,
  selectModelParam,
} from "@/lib/client/model-options";
import type {
  AgentMode,
  BusyState,
  ClientMessage,
  GuestDTO,
  MessageDTO,
  ModelDTO,
  ModelParamDTO,
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
  const [modelParams, setModelParams] = useState<ModelParamDTO[]>([]);
  const [liveText, setLiveText] = useState("");
  const [liveThinking, setLiveThinking] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [draftThread, setDraftThread] = useState(false);
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const selectedRef = useRef<string | null>(null);
  const retryRef = useRef(0);
  const awaitingCreateRef = useRef(false);
  const meRef = useRef<GuestDTO | null>(null);
  const modelRef = useRef(model);
  const messageRequestRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const handlerRef = useRef<(msg: ServerMessage) => void>(() => {});

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const onServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "hello_ok":
        meRef.current = msg.guest;
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
          setModelParams(defaultModelParams(preferred));
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
        if (
          awaitingCreateRef.current &&
          !selectedRef.current &&
          msg.thread.createdByGuestId === meRef.current?.id
        ) {
          selectedRef.current = msg.thread.id;
          awaitingCreateRef.current = false;
          setSelectedId(msg.thread.id);
          setDraftThread(false);
        }
        break;
      case "thread_removed":
        setThreads((prev) => prev.filter((t) => t.id !== msg.threadId));
        if (selectedRef.current === msg.threadId) {
          selectedRef.current = null;
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
        awaitingCreateRef.current = false;
        flash(msg.helpUrl ? `${msg.message} — ${msg.helpUrl}` : msg.message);
        break;
    }
  }, [flash]);

  useEffect(() => {
    handlerRef.current = onServerMessage;
  }, [onServerMessage]);

  const guestId = me?.id;

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchWorkspace(workspaceId);
        setWorkspace(data.workspace);
        meRef.current = data.me;
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
    if (!guestId) return;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(
        `${proto}://${window.location.host}/ws?workspaceId=${encodeURIComponent(workspaceId)}`,
      );
      wsRef.current = socket;
      socket.onopen = () => {
        const reconnected = retryRef.current > 0;
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
        if (reconnected) {
          void fetchThreads(workspaceId)
            .then((result) => setThreads(result.threads))
            .catch((err) =>
              flash(
                err instanceof Error
                  ? err.message
                  : "Failed to refresh threads",
              ),
            );

          const selectedAtReconnect = selectedRef.current;
          if (selectedAtReconnect) {
            void fetchMessages(selectedAtReconnect)
              .then((result) => {
                if (selectedRef.current !== selectedAtReconnect) return;
                setMessages((current) => {
                  const byId = new Map(
                    [...result.messages, ...current].map((message) => [
                      message.id,
                      message,
                    ]),
                  );
                  return [...byId.values()].sort(
                    (a, b) => a.createdAt - b.createdAt,
                  );
                });
              })
              .catch((err) =>
                flash(
                  err instanceof Error
                    ? err.message
                    : "Failed to refresh messages",
                ),
              );
          }
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
  }, [flash, guestId, workspaceId]);

  useEffect(() => {
    send({ type: "viewing", threadId: selectedId });
  }, [selectedId, send]);

  useEffect(() => {
    const requestId = ++messageRequestRef.current;
    if (!selectedId) {
      setMessages([]);
      setLiveText("");
      setLiveThinking("");
      return;
    }
    setMessages([]);
    setLiveText("");
    setLiveThinking("");
    void fetchMessages(selectedId)
      .then((r) => {
        if (
          messageRequestRef.current === requestId &&
          selectedRef.current === selectedId
        ) {
          setMessages((current) => {
            const byId = new Map(
              [...r.messages, ...current].map((message) => [
                message.id,
                message,
              ]),
            );
            return [...byId.values()].sort(
              (a, b) => a.createdAt - b.createdAt,
            );
          });
        }
      })
      .catch((err) => {
        if (messageRequestRef.current === requestId) {
          flash(err instanceof Error ? err.message : "Failed to load messages");
        }
      });
  }, [flash, selectedId]);

  const selected = useMemo(
    () => threads.find((t) => t.id === selectedId) ?? null,
    [threads, selectedId],
  );

  const disabledReason = useMemo(() => {
    if (!connected) return "Waiting for the room connection.";
    if (busy) {
      return `${busy.guestName}'s agent is running — wait or cancel it.`;
    }
    if (selected?.status === "archived") return "This thread is archived.";
    return null;
  }, [busy, connected, selected]);

  async function onJoin(displayName: string, profilePicture: string | null) {
    const { guest } = await claimGuest(
      workspaceId,
      displayName,
      profilePicture,
    );
    meRef.current = guest;
    setMe(guest);
  }

  function onNew() {
    awaitingCreateRef.current = false;
    selectedRef.current = null;
    setShowArchived(false);
    setDraftThread(true);
    setSelectedId(null);
    setMessages([]);
    setLiveText("");
    setLiveThinking("");
    setText("");
    setComposerFocusSignal((n) => n + 1);
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
      if (
        !send({
          type: "prompt",
          threadId: selectedId,
          text: trimmed,
          mode,
          model,
          modelParams,
        })
      ) {
        flash("The room is reconnecting. Your prompt was not sent.");
        return;
      }
    } else {
      awaitingCreateRef.current = true;
      if (
        !send({
          type: "create_thread",
          text: trimmed,
          mode,
          model,
          modelParams,
        })
      ) {
        awaitingCreateRef.current = false;
        flash("The room is reconnecting. Your prompt was not sent.");
        return;
      }
      setDraftThread(true);
    }
    setText("");
  }

  function onCancel() {
    const threadId = busy?.threadId ?? selectedId;
    if (!threadId) return;
    if (!send({ type: "cancel", threadId })) {
      flash("The room is reconnecting. The agent was not cancelled.");
    }
  }

  function onUnarchive(id: string) {
    if (!send({ type: "unarchive_thread", threadId: id })) {
      flash("The room is reconnecting. The thread was not restored.");
      return;
    }
    awaitingCreateRef.current = false;
    selectedRef.current = id;
    setDraftThread(false);
    setSelectedId(id);
    setShowArchived(false);
    setThreads((prev) =>
      prev.map((t) =>
        t.id === id && t.status === "archived" ? { ...t, status: "idle" } : t,
      ),
    );
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
            drafting={draftThread}
            onSelect={(id) => {
              awaitingCreateRef.current = false;
              selectedRef.current = id;
              setDraftThread(false);
              setSelectedId(id);
            }}
            onNew={onNew}
            onArchive={(id) => {
              if (!send({ type: "archive_thread", threadId: id })) {
                flash("The room is reconnecting. The thread was not archived.");
              }
            }}
            onUnarchive={onUnarchive}
            onDelete={(id) => {
              if (!send({ type: "delete_thread", threadId: id })) {
                flash("The room is reconnecting. The thread was not deleted.");
              }
            }}
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
            drafting={draftThread}
          />
          <Composer
            text={text}
            mode={mode}
            model={model}
            modelParams={modelParams}
            models={models}
            busy={busy}
            disabledReason={disabledReason}
            focusSignal={composerFocusSignal}
            onText={setText}
            onMode={setMode}
            onModel={(nextModel) => {
              setModel(nextModel);
              setModelParams(
                defaultModelParams(models.find((item) => item.id === nextModel)),
              );
            }}
            onModelParam={(id, value) =>
              setModelParams((params) =>
                selectModelParam(
                  models.find((item) => item.id === model),
                  params,
                  id,
                  value,
                ),
              )
            }
            onSend={onSend}
            onCancel={onCancel}
            onRestore={
              selected?.status === "archived"
                ? () => onUnarchive(selected.id)
                : undefined
            }
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
