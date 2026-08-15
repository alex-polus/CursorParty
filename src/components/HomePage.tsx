"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  createWorkspace,
  fetchDefaults,
  fetchWorkspaces,
} from "@/lib/client/api";
import type { WorkspaceDTO } from "@/lib/types";

export function HomePage() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [startingRef, setStartingRef] = useState("main");
  const [name, setName] = useState("");
  const [recent, setRecent] = useState<WorkspaceDTO[]>([]);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [defaults, list] = await Promise.all([
          fetchDefaults(),
          fetchWorkspaces(),
        ]);
        if (defaults.repoUrl) setRepoUrl(defaults.repoUrl);
        if (defaults.startingRef) setStartingRef(defaults.startingRef);
        if (defaults.name) setName(defaults.name);
        setHasApiKey(defaults.hasApiKey);
        setRecent(list.workspaces);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { workspace } = await createWorkspace({
        name: name || undefined,
        repoUrl,
        startingRef,
      });
      router.push(`/w/${workspace.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create workspace");
      setPending(false);
    }
  }

  return (
    <main className="relative min-h-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-[-8rem] h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, #ff4d1a33, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-6rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, #d8ff3e22, transparent 70%)" }}
      />

      <div className="mx-auto grid min-h-full max-w-6xl gap-16 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-10">
        <section className="enter">
          <p className="ticket">v1 · multiplayer agent view</p>
          <h1 className="wordmark mt-3 max-w-xl text-6xl leading-[0.92] text-paper sm:text-7xl">
            One room.
            <br />
            Many engineers.
            <span className="text-tangerine"> One agent.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-mute">
            CursorParty is a shared Agent View over a GitHub repo. Not an IDE —
            your editor stays yours. The transcript, the prompt, and who is in
            the room become multiplayer.
          </p>
          {!hasApiKey && (
            <p className="mt-4 max-w-md border border-tangerine/40 bg-tangerine/10 px-3 py-2 text-sm text-paper">
              No <span className="font-mono text-xs">CURSOR_API_KEY</span> in
              env. You can still open a room; agents will not start until a key
              is set.
            </p>
          )}
        </section>

        <section className="enter border border-rule bg-ink-2/80 p-6 shadow-[12px_16px_0_#000] [animation-delay:80ms]">
          <p className="ticket">open a workspace</p>
          <form
            action="/api/workspaces"
            method="post"
            className="mt-4 grid gap-3"
            onSubmit={onCreate}
          >
            <label className="grid gap-1 text-xs uppercase tracking-[0.14em] text-mute">
              GitHub repo URL
              <input
                name="repoUrl"
                required
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
                className="border border-rule bg-ink px-3 py-2 font-mono text-sm text-paper outline-none focus:border-tangerine"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs uppercase tracking-[0.14em] text-mute">
                Branch
                <input
                  name="startingRef"
                  value={startingRef}
                  onChange={(e) => setStartingRef(e.target.value)}
                  className="border border-rule bg-ink px-3 py-2 font-mono text-sm text-paper outline-none focus:border-tangerine"
                />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.14em] text-mute">
                Room name
                <input
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="optional"
                  className="border border-rule bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-tangerine"
                />
              </label>
            </div>
            {error && (
              <p className="text-sm text-tangerine">{error}</p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="mt-1 bg-tangerine px-4 py-2.5 text-sm font-semibold tracking-wide text-ink hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "Opening…" : "Start the party"}
            </button>
          </form>

          {recent.length > 0 && (
            <div className="mt-6 border-t border-rule pt-4">
              <p className="ticket mb-2">recent rooms</p>
              <ul className="grid gap-1">
                {recent.map((ws) => (
                  <li key={ws.id}>
                    <a
                      href={`/w/${ws.id}`}
                      className="flex items-baseline justify-between gap-3 px-1 py-1.5 text-sm hover:text-acid"
                    >
                      <span>{ws.name}</span>
                      <span className="truncate font-mono text-[11px] text-mute">
                        {ws.repoUrl.replace("https://github.com/", "")}@{ws.startingRef}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
