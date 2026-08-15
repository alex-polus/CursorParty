"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Avatar } from "./PresencePanel";
import type { MessageDTO, ThreadDTO } from "@/lib/types";

export function Transcript({
  thread,
  messages,
  liveText,
  liveThinking,
  selfId,
}: {
  thread: ThreadDTO | null;
  messages: MessageDTO[];
  liveText: string;
  liveThinking: string;
  selfId: string | null;
}) {
  if (!thread) {
    return (
      <div className="grid flex-1 place-items-center px-8 text-center">
        <div>
          <p className="ticket">empty stage</p>
          <h2 className="wordmark mt-2 text-4xl">Start a thread</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-mute">
            Everyone in this room will see the prompt, the stream, and the git
            branch the agent lands on.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">
      <header className="mb-6 border-b border-rule pb-4">
        <p className="ticket">{thread.mode} · {thread.model}</p>
        <h2 className="mt-1 font-display text-2xl italic leading-tight">
          {thread.title}
        </h2>
        <GitChip branch={thread.gitBranch} prUrl={thread.gitPrUrl} />
      </header>

      <ol className="grid gap-4">
        {messages.map((m) => (
          <li key={m.id}>
            <MessageRow message={m} selfId={selfId} />
          </li>
        ))}
        {liveThinking && (
          <li className="border-l-2 border-mute/40 pl-3 font-mono text-[12px] leading-relaxed text-mute">
            <p className="ticket mb-1">thinking</p>
            {liveThinking}
          </li>
        )}
        {liveText && (
          <li>
            <p className="ticket mb-1">agent</p>
            <div className="md-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{liveText}</ReactMarkdown>
            </div>
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
            <Avatar name={name} color={color} size={16} />
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
    return (
      <details className="border-l-2 border-mute/30 pl-3">
        <summary className="ticket cursor-pointer">thinking</summary>
        <p className="mt-1 whitespace-pre-wrap font-mono text-[12px] text-mute">
          {String(message.payload.text ?? "")}
        </p>
      </details>
    );
  }

  if (message.type === "tool_call") {
    return <ToolCallCard payload={message.payload} />;
  }

  if (message.type === "status") {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
        {String(message.payload.status ?? "status")}
        {message.payload.message ? ` · ${String(message.payload.message)}` : ""}
      </p>
    );
  }

  return (
    <div>
      <p className="ticket mb-1">agent</p>
      <div className="md-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {String(message.payload.text ?? "")}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function ToolCallCard({ payload }: { payload: Record<string, unknown> }) {
  const name = String(payload.name ?? "tool");
  const status = String(payload.status ?? "running");
  const args = payload.args;
  const result = payload.result;
  return (
    <details className="border border-rule bg-ink-2 px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-2 font-mono text-[12px]">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            status === "running"
              ? "bg-acid pulse-dot"
              : status === "error"
                ? "bg-tangerine"
                : "bg-sky"
          }`}
        />
        <span>{name}</span>
        <span className="text-mute">{status}</span>
      </summary>
      {(args !== undefined && args !== null) ||
      (result !== undefined && result !== null) ? (
        <pre className="mt-2 max-h-48 overflow-auto font-mono text-[11px] text-mute">
          {JSON.stringify(
            {
              ...(args !== undefined && args !== null ? { args } : {}),
              ...(result !== undefined && result !== null ? { result } : {}),
            },
            null,
            2,
          )}
        </pre>
      ) : null}
    </details>
  );
}
