"use client";

import { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Avatar } from "./PresencePanel";
import {
  groupTranscriptRows,
  structureTranscript,
} from "@/lib/client/transcript";
import type { MessageDTO, ThreadDTO } from "@/lib/types";

export function Transcript({
  thread,
  messages,
  liveText,
  liveThinking,
  selfId,
  drafting,
}: {
  thread: ThreadDTO | null;
  messages: MessageDTO[];
  liveText: string;
  liveThinking: string;
  selfId: string | null;
  drafting: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const structured = useMemo(
    () => structureTranscript(messages, liveText, liveThinking),
    [liveText, liveThinking, messages],
  );
  const rows = useMemo(
    () => groupTranscriptRows(structured.messages),
    [structured.messages],
  );

  useEffect(() => {
    pinnedToBottomRef.current = true;
  }, [thread?.id]);

  useEffect(() => {
    if (!pinnedToBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [liveText, liveThinking, messages, thread?.id]);

  if (!thread) {
    return (
      <div className="grid flex-1 place-items-center px-8 text-center">
        <div>
          <p className="ticket">{drafting ? "new thread" : "empty stage"}</p>
          <h2 className="wordmark mt-2 text-4xl">
            {drafting ? "Write the first prompt" : "Start a thread"}
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-mute">
            {drafting
              ? "Type below and send. The thread is created with that first prompt, and everyone in the room will see the stream."
              : "Hit New, then send a prompt. Everyone in this room will see the stream and the git branch the agent lands on."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        pinnedToBottomRef.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      }}
      className="scroll-thin flex-1 overflow-y-auto px-5 py-5"
    >
      <header className="mb-6 border-b border-rule pb-4">
        <p className="ticket">{thread.mode} · {thread.model}</p>
        <h2 className="mt-1 font-display text-2xl italic leading-tight">
          {thread.title}
        </h2>
        <GitChip branch={thread.gitBranch} prUrl={thread.gitPrUrl} />
      </header>

      <ol className="grid gap-4">
        {rows.map((row) => (
          <li key={row.key}>
            {row.kind === "tools" ? (
              <ToolActivity messages={row.messages} />
            ) : (
              <MessageRow message={row.message} selfId={selfId} />
            )}
          </li>
        ))}
        {structured.remainingLiveThinking && (
          <li>
            <ThinkingMessage
              text={structured.remainingLiveThinking}
              streaming
            />
          </li>
        )}
        {structured.remainingLiveText && (
          <li>
            <AssistantMessage
              text={structured.remainingLiveText}
              streaming
            />
          </li>
        )}
      </ol>
    </div>
  );
}

function GitChip({
  branch,
  prUrl,
}: {
  branch: string | null;
  prUrl: string | null;
}) {
  if (!branch && !prUrl) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-2 font-mono text-[11px]">
      {branch && (
        <span className="border border-rule px-2 py-0.5 text-acid">{branch}</span>
      )}
      {prUrl && (
        <a
          href={prUrl}
          target="_blank"
          rel="noreferrer"
          className="border border-rule px-2 py-0.5 text-sky hover:border-sky"
        >
          Pull request ↗
        </a>
      )}
    </p>
  );
}

function MessageRow({
  message,
  selfId,
}: {
  message: MessageDTO;
  selfId: string | null;
}) {
  if (message.type === "user") {
    const name = message.guest?.displayName ?? "Guest";
    const color = message.guest?.color ?? "#8a8478";
    const mine = message.guestId === selfId;
    return (
      <div className="flex gap-3">
        <span
          className="mt-1 w-0.5 shrink-0"
          style={{ background: color }}
        />
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Avatar
              name={name}
              color={color}
              profilePicture={message.guest?.profilePicture}
              size={16}
            />
            <span className="text-xs" style={{ color }}>
              {name}
              {mine ? " · you" : ""}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
            {String(message.payload.text ?? "")}
          </p>
        </div>
      </div>
    );
  }

  if (message.type === "thinking") {
    return <ThinkingMessage text={String(message.payload.text ?? "")} />;
  }

  if (message.type === "tool_call") {
    return <ToolActivity messages={[message]} />;
  }

  if (message.type === "status") {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
        {String(message.payload.status ?? "status")}
        {message.payload.message ? ` · ${String(message.payload.message)}` : ""}
      </p>
    );
  }

  return <AssistantMessage text={String(message.payload.text ?? "")} />;
}

function AssistantMessage({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  return (
    <article className="max-w-4xl border-l-2 border-sky bg-ink-2/60 px-4 py-3">
      <header className="mb-2 flex items-center gap-2">
        <span className="ticket text-sky">agent response</span>
        {streaming && (
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-acid" />
        )}
      </header>
      <div className="md-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </article>
  );
}

function ThinkingMessage({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  return (
    <details
      open={streaming || undefined}
      className="max-w-4xl border-l-2 border-mute/40 bg-ink-2/30 px-4 py-2.5"
    >
      <summary className="ticket flex cursor-pointer list-none items-center gap-2 select-none">
        <span>thinking trace</span>
        {streaming && (
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-mute" />
        )}
        <span className="ml-auto text-[9px] text-mute">details</span>
      </summary>
      <p className="mt-2 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-mute">
        {text}
      </p>
    </details>
  );
}

function ToolActivity({ messages }: { messages: MessageDTO[] }) {
  const running = messages.filter(
    (message) => String(message.payload.status) === "running",
  ).length;
  const errors = messages.filter(
    (message) => String(message.payload.status) === "error",
  ).length;
  const status = errors
    ? `${errors} failed`
    : running
      ? `${running} running`
      : "completed";

  return (
    <details className="max-w-4xl border border-rule bg-ink-2/45">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-mono text-[11px] select-none">
        <StatusDot status={errors ? "error" : running ? "running" : "completed"} />
        <span className="text-paper">tool activity</span>
        <span className="text-mute">
          {messages.length} {messages.length === 1 ? "call" : "calls"}
        </span>
        <span className="ml-auto text-mute">{status} · details</span>
      </summary>
      <ul className="border-t border-rule px-3 py-1.5">
        {messages.map((message) => (
          <li key={message.id} className="border-b border-rule/60 last:border-0">
            <ToolCallRow payload={message.payload} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function ToolCallRow({ payload }: { payload: Record<string, unknown> }) {
  const name = String(payload.name ?? "tool");
  const status = String(payload.status ?? "running");
  const args = payload.args;
  const result = payload.result;
  const hasDetails =
    (args !== undefined && args !== null) ||
    (result !== undefined && result !== null);
  const content = (
    <>
      <StatusDot status={status} />
      <span className="min-w-0 truncate text-paper">{name}</span>
      <span className="text-mute">{status}</span>
      {hasDetails && <span className="ml-auto text-mute">view</span>}
    </>
  );

  if (!hasDetails) {
    return <div className="flex items-center gap-2 py-1.5 font-mono text-[11px]">{content}</div>;
  }

  return (
    <details>
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 font-mono text-[11px] select-none">
        {content}
      </summary>
      <pre className="mb-2 max-h-48 overflow-auto bg-ink px-2 py-2 font-mono text-[11px] text-mute">
        {JSON.stringify(
          {
            ...(args !== undefined && args !== null ? { args } : {}),
            ...(result !== undefined && result !== null ? { result } : {}),
          },
          null,
          2,
        )}
      </pre>
    </details>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
        status === "running"
          ? "bg-acid pulse-dot"
          : status === "error"
            ? "bg-tangerine"
            : "bg-sky"
      }`}
    />
  );
}
