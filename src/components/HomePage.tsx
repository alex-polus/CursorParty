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
    <main className="landing-sans relative min-h-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-28 top-[-10rem] h-[32rem] w-[32rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, #2ea8ff28, transparent 68%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-8rem] top-24 h-[22rem] w-[22rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, #e83dff1f, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-10rem] left-1/3 h-[26rem] w-[26rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, #f5b40018, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-4rem] bottom-[-8rem] h-[24rem] w-[24rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, #2ecc8a22, transparent 70%)" }}
      />

      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col px-6 py-8 lg:px-10 lg:py-10">
        <header className="enter flex items-center justify-between gap-4">
          <img
            src="/cursorparty-lockup.png"
            alt="CursorParty"
            width={500}
            height={500}
            className="-ml-6 h-36 w-36 bg-transparent object-contain sm:h-44 sm:w-44 lg:-ml-8 lg:h-52 lg:w-52"
          />
          <p className="ticket text-right">v1 · multiplayer agent view</p>
        </header>

        <div className="grid flex-1 items-center gap-14 py-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:gap-16 lg:py-6">
          <section className="max-w-2xl">
            <h1 className="landing-display text-[clamp(2.6rem,7.4vw,5.35rem)] leading-[0.88] text-paper">
              <span className="enter block" style={{ animationDelay: "40ms" }}>
                One room
                <span className="text-party-blue">.</span>
              </span>
              <span
                className="enter mt-[0.04em] block"
                style={{ animationDelay: "90ms" }}
              >
                Many engineers
                <span className="text-party-magenta">.</span>
              </span>
              <span
                className="enter mt-[0.04em] block text-tangerine"
                style={{ animationDelay: "200ms" }}
              >
                One agent
                <span className="text-party-gold">.</span>
              </span>
            </h1>

            <div
              aria-hidden
              className="enter mt-8 flex items-center gap-2.5"
              style={{ animationDelay: "260ms" }}
            >
              <span className="h-2 w-2 rounded-full bg-party-blue" />
              <span className="h-2 w-2 rounded-full bg-party-magenta" />
              <span className="h-2 w-2 rounded-full bg-party-gold" />
              <span className="h-2 w-2 rounded-full bg-party-teal" />
              <span className="ml-1 h-px min-w-16 flex-1 max-w-36 bg-gradient-to-r from-rule to-transparent" />
            </div>

            <p
              className="enter mt-6 max-w-lg text-[15px] leading-relaxed text-mute sm:text-base"
              style={{ animationDelay: "300ms" }}
            >
              CursorParty is a shared Agent View over a GitHub repo. Not an IDE —
              your editor stays yours. The transcript, the prompt, and who is in
              the room become multiplayer.
            </p>
            {!hasApiKey && (
              <p className="mt-5 max-w-lg border border-tangerine/40 bg-tangerine/10 px-3 py-2 text-sm text-paper">
                No <span className="font-mono text-xs">CURSOR_API_KEY</span> in
                env. You can still open a room; agents will not start until a key
                is set.
              </p>
            )}
          </section>

          <section
            className="enter min-w-0 overflow-hidden border border-rule bg-ink-2/85 p-6 shadow-[12px_16px_0_#000] backdrop-blur-[2px] sm:p-7"
            style={{ animationDelay: "100ms" }}
          >
            <p className="ticket">open a workspace</p>
            <form
              action="/api/workspaces"
              method="post"
              className="mt-5 grid gap-3.5"
              onSubmit={onCreate}
            >
              <label className="grid gap-1.5 text-xs uppercase tracking-[0.14em] text-mute">
                GitHub repo URL
                <input
                  name="repoUrl"
                  required
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/org/repo"
                  className="border border-rule bg-ink px-3 py-2.5 font-mono text-sm text-paper outline-none transition-colors focus:border-tangerine"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-xs uppercase tracking-[0.14em] text-mute">
                  Branch
                  <input
                    name="startingRef"
                    value={startingRef}
                    onChange={(e) => setStartingRef(e.target.value)}
                    className="border border-rule bg-ink px-3 py-2.5 font-mono text-sm text-paper outline-none transition-colors focus:border-tangerine"
                  />
                </label>
                <label className="grid gap-1.5 text-xs uppercase tracking-[0.14em] text-mute">
                  Room name
                  <input
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="optional"
                    className="border border-rule bg-ink px-3 py-2.5 text-sm text-paper outline-none transition-colors focus:border-tangerine"
                  />
                </label>
              </div>
              {error && (
                <p className="text-sm text-tangerine">{error}</p>
              )}
              <button
                type="submit"
                disabled={pending}
                className="mt-1 bg-tangerine px-4 py-3 text-sm font-semibold tracking-wide text-ink transition-[filter] hover:brightness-110 disabled:opacity-50"
              >
                {pending ? "Opening…" : "Start the party"}
              </button>
            </form>

            {recent.length > 0 && (
              <div className="mt-6 border-t border-rule pt-4">
                <p className="ticket mb-2">recent rooms</p>
                <ul className="grid min-w-0 gap-0.5">
                  {recent.map((ws) => {
                    const repo = `${ws.repoUrl.replace("https://github.com/", "")}@${ws.startingRef}`;
                    return (
                      <li key={ws.id} className="min-w-0">
                        <a
                          href={`/w/${ws.id}`}
                          title={repo}
                          className="flex min-w-0 items-baseline gap-3 overflow-hidden px-1 py-1.5 text-sm hover:text-acid"
                        >
                          <span className="min-w-0 max-w-[45%] shrink-0 truncate">
                            {ws.name}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-mute">
                            {repo}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>

        <section className="enter mt-4 border-t border-rule py-10 lg:mt-2 lg:py-14">
          <p className="ticket">powered by cursor</p>
          <h2 className="landing-display mt-5 max-w-4xl text-[clamp(1.85rem,3.8vw,3rem)] leading-[0.94] text-paper">
            Multiplayer engineering
            <span className="text-party-blue">,</span>
            <br />
            powered by{" "}
            <span className="text-tangerine">
              Cursor SDK
              <span className="text-party-gold">.</span>
            </span>
          </h2>
          <div className="mt-8 flex items-start gap-4">
            <div
              aria-hidden
              className="mt-2 hidden items-center gap-2 sm:flex"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-party-blue" />
              <span className="h-1.5 w-1.5 rounded-full bg-party-magenta" />
              <span className="h-1.5 w-1.5 rounded-full bg-party-gold" />
              <span className="h-1.5 w-1.5 rounded-full bg-party-teal" />
            </div>
            <p className="max-w-2xl text-[15px] leading-relaxed text-mute">
              CursorParty gives your team one shared cloud workspace where
              engineers and AI agents can build together in real time—sharing
              context, prompts, and progress as they work.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
