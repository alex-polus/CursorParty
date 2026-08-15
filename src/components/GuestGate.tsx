"use client";

import { useState } from "react";

export function GuestGate({
  onJoin,
}: {
  onJoin: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onJoin(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/80 px-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="enter w-full max-w-md border border-rule bg-ink-2 p-6 shadow-[10px_12px_0_#ff4d1a]"
      >
        <p className="ticket">take a color</p>
        <h2 className="wordmark mt-2 text-4xl">Who’s walking in?</h2>
        <p className="mt-2 text-sm text-mute">
          No account. A name is enough. Your color sticks on this machine.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          placeholder="Display name"
          className="mt-5 w-full border border-rule bg-ink px-3 py-2 text-lg text-paper outline-none focus:border-acid"
        />
        {error && <p className="mt-2 text-sm text-tangerine">{error}</p>}
        <button
          disabled={pending || !name.trim()}
          className="mt-4 w-full bg-acid px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
        >
          {pending ? "Joining…" : "Join the room"}
        </button>
      </form>
    </div>
  );
}
