"use client";

import { Avatar } from "./PresencePanel";
import type { PresenceGuest, ThreadDTO, ThreadStatus } from "@/lib/types";

export function ThreadList({
  threads,
  selectedId,
  presence,
  showArchived,
  onSelect,
  onNew,
  onArchive,
  onDelete,
  onToggleArchived,
}: {
  threads: ThreadDTO[];
  selectedId: string | null;
  presence: PresenceGuest[];
  showArchived: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleArchived: () => void;
}) {
  const visible = threads.filter((t) =>
    showArchived ? t.status === "archived" : t.status !== "archived",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-3">
        <p className="ticket">threads</p>
        <button
          onClick={onNew}
          className="bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink hover:bg-acid"
        >
          New
        </button>
      </div>
      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {visible.length === 0 && (
          <li className="px-2 py-6 text-center text-xs leading-relaxed text-mute">
            {showArchived
              ? "Nothing archived yet."
              : "No threads. Hit New and send the first prompt."}
          </li>
        )}
        {visible.map((thread, i) => {
          const watchers = presence.filter(
            (g) => g.viewingThreadId === thread.id,
          );
          const active = thread.id === selectedId;
          return (
            <li key={thread.id} className="mb-1">
              <div
                className={`group flex gap-2 border px-2 py-2 ${
                  active
                    ? "border-tangerine bg-ink-3"
                    : "border-transparent hover:border-rule hover:bg-ink-3/60"
                }`}
              >
                <button
                  onClick={() => onSelect(thread.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <StatusDot status={thread.status} />
                    <span className="font-mono text-[10px] text-mute">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {watchers.slice(0, 3).map((g) => (
                      <Avatar key={g.id} name={g.displayName} color={g.color} size={14} />
                    ))}
                  </div>
                  <p className="mt-1 truncate text-[13px] leading-snug">
                    {thread.title}
                  </p>
                </button>
                <div className="hidden flex-col gap-1 group-hover:flex">
                  {thread.status !== "archived" && (
                    <button
                      onClick={() => onArchive(thread.id)}
                      className="text-[10px] uppercase tracking-wider text-mute hover:text-paper"
                    >
                      Arch
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          "Delete this thread and its Cursor agent? This cannot be undone.",
                        )
                      ) {
                        onDelete(thread.id);
                      }
                    }}
                    className="text-[10px] uppercase tracking-wider text-mute hover:text-tangerine"
                  >
                    Del
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        onClick={onToggleArchived}
        className="border-t border-rule px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-mute hover:text-paper"
      >
        {showArchived ? "← live threads" : "archived"}
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: ThreadStatus }) {
  const color =
    status === "running"
      ? "bg-acid pulse-dot"
      : status === "error"
        ? "bg-tangerine"
        : status === "cancelled"
          ? "bg-mute"
          : status === "archived"
            ? "bg-rule"
            : "bg-sky";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
}
