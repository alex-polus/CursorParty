"use client";

import { useEffect, useRef } from "react";
import type { AgentMode, BusyState, ModelDTO } from "@/lib/types";

export function shouldSubmitComposerKey(
  key: string,
  shiftKey: boolean,
  isComposing: boolean,
) {
  return key === "Enter" && !shiftKey && !isComposing;
}

export function Composer({
  text,
  mode,
  model,
  models,
  busy,
  disabledReason,
  focusSignal,
  onText,
  onMode,
  onModel,
  onSend,
  onCancel,
  onRestore,
}: {
  text: string;
  mode: AgentMode;
  model: string;
  models: ModelDTO[];
  busy: BusyState | null;
  disabledReason: string | null;
  focusSignal: number;
  onText: (value: string) => void;
  onMode: (mode: AgentMode) => void;
  onModel: (model: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onRestore?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const blocked = Boolean(disabledReason);

  useEffect(() => {
    if (focusSignal === 0) return;
    ref.current?.focus();
  }, [focusSignal]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      shouldSubmitComposerKey(
        e.key,
        e.shiftKey,
        e.nativeEvent.isComposing,
      )
    ) {
      e.preventDefault();
      if (!blocked && text.trim()) onSend();
    }
  }

  return (
    <footer className="border-t border-rule bg-ink-2 px-4 py-3">
      {busy && (
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <p className="text-acid">
            <span className="pulse-dot mr-2 inline-block h-1.5 w-1.5 rounded-full bg-acid" />
            {busy.guestName}&apos;s agent is running
          </p>
          <button
            onClick={onCancel}
            className="border border-rule px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:border-tangerine hover:text-tangerine"
          >
            Cancel
          </button>
        </div>
      )}
      {disabledReason && !busy && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm text-mute">{disabledReason}</p>
          {onRestore && (
            <button
              type="button"
              onClick={onRestore}
              className="border border-rule px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:border-paper hover:text-paper"
            >
              Restore
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <div className="flex border border-rule">
          {(["agent", "plan"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onMode(m)}
              className={`px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${mode === m ? "bg-paper text-ink" : "text-mute hover:text-paper"
                }`}
            >
              {m}
            </button>
          ))}
        </div>
        <select
          value={model}
          onChange={(e) => onModel(e.target.value)}
          className="border border-rule bg-ink px-2 py-1 font-mono text-[11px] text-paper outline-none"
        >
          {(models.length ? models : [{ id: model, displayName: model }]).map(
            (m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ),
          )}
        </select>
        <span className="ml-auto hidden font-mono text-[10px] text-mute sm:inline">
          Enter to send · Shift Enter for newline
        </span>
      </div>
      <div className="flex gap-2">
        <textarea
          ref={ref}
          autoFocus
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          disabled={blocked}
          placeholder={
            blocked
              ? disabledReason ?? ""
              : "Ask the room’s agent…"
          }
          className="min-h-[72px] flex-1 resize-none border border-rule bg-ink px-3 py-2 text-sm leading-relaxed text-paper outline-none focus:border-tangerine disabled:opacity-50"
        />
        <button
          onClick={onSend}
          disabled={blocked || !text.trim()}
          className="self-stretch bg-tangerine px-4 text-sm font-semibold text-ink disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </footer>
  );
}
