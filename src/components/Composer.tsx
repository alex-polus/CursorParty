"use client";

import { useEffect, useRef } from "react";
import {
  composerParameters,
  modelParamValue,
} from "@/lib/client/model-options";
import type {
  AgentMode,
  BusyState,
  ModelDTO,
  ModelParamDTO,
} from "@/lib/types";

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
  modelParams,
  models,
  busy,
  disabledReason,
  focusSignal,
  onText,
  onMode,
  onModel,
  onModelParam,
  onSend,
  onCancel,
}: {
  text: string;
  mode: AgentMode;
  model: string;
  modelParams: ModelParamDTO[];
  models: ModelDTO[];
  busy: BusyState | null;
  disabledReason: string | null;
  focusSignal: number;
  onText: (value: string) => void;
  onMode: (mode: AgentMode) => void;
  onModel: (model: string) => void;
  onModelParam: (id: string, value: string) => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const blocked = Boolean(disabledReason);
  const selectedModel = models.find((item) => item.id === model);
  const parameters = composerParameters(selectedModel);

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
        <p className="mb-2 text-sm text-mute">{disabledReason}</p>
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
        {parameters.map((parameter) => {
          const value = modelParamValue(modelParams, parameter);
          if (parameter.id === "fast") {
            return (
              <button
                key={parameter.id}
                type="button"
                aria-pressed={value === "true"}
                title="Use this model's fast mode"
                onClick={() =>
                  onModelParam(parameter.id, value === "true" ? "false" : "true")
                }
                className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                  value === "true"
                    ? "border-acid bg-acid text-ink"
                    : "border-rule text-mute hover:text-paper"
                }`}
              >
                Fast
              </button>
            );
          }

          return (
            <label
              key={parameter.id}
              className="flex items-center gap-1 border border-rule bg-ink pl-2 font-mono text-[10px] uppercase tracking-[0.1em] text-mute"
            >
              {parameter.id === "effort" || parameter.id === "reasoning"
                ? "Thinking"
                : parameter.displayName}
              <select
                aria-label={parameter.displayName}
                value={value}
                onChange={(event) =>
                  onModelParam(parameter.id, event.target.value)
                }
                className="bg-ink px-1 py-1 text-[11px] normal-case tracking-normal text-paper outline-none"
              >
                {parameter.values.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.displayName}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
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
