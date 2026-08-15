"use client";

import { useState } from "react";
import { BrandMark } from "./BrandMark";
import type { BusyState, WorkspaceDTO } from "@/lib/types";

export function TopBar({
  workspace,
  busy,
  connected,
}: {
  workspace: WorkspaceDTO;
  busy: BusyState | null;
  connected: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const repo = workspace.repoUrl.replace(/^https?:\/\/github\.com\//, "");

  async function copyInvite() {
    const invite = window.location.href;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(invite);
    } catch {
      const input = document.createElement("textarea");
      input.value = invite;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <header className="flex items-center gap-4 border-b border-rule px-4 py-2.5">
      <a
        href="/"
        className="flex shrink-0 items-center gap-2 text-paper"
        aria-label="CursorParty home"
      >
        <BrandMark className="h-8 w-10 text-paper" />
        <span className="wordmark text-xl leading-none">CursorParty</span>
      </a>
      <span className="hidden h-4 w-px bg-rule sm:block" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{workspace.name}</p>
        <p className="truncate font-mono text-[11px] text-mute">
          {repo}
          <span className="text-acid"> @{workspace.startingRef}</span>
        </p>
      </div>
      <p className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] sm:flex">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connected ? "bg-acid" : "bg-tangerine pulse-dot"
          }`}
        />
        {connected ? "live" : "reconnecting"}
      </p>
      {busy && (
        <p className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-acid md:block">
          running
        </p>
      )}
      <button
        onClick={copyInvite}
        className="border border-rule px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] hover:border-acid hover:text-acid"
      >
        {copied ? "Copied" : "Invite link"}
      </button>
    </header>
  );
}
