"use client";

import { useRef, useState } from "react";

const MAX_PROFILE_PICTURE_BYTES = 1_000_000;

export function GuestGate({
  onJoin,
}: {
  onJoin: (name: string, profilePicture: string | null) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function pickProfilePicture(file: File | undefined) {
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpeg|webp|gif)$/)) {
      setError("Choose a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_PROFILE_PICTURE_BYTES) {
      setError("Profile picture must be under 1 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfilePicture(typeof reader.result === "string" ? reader.result : null);
      setError(null);
    };
    reader.onerror = () => setError("Could not read that image.");
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onJoin(name.trim(), profilePicture);
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
          No account. Add a name and, if you like, a picture. Your identity
          sticks on this machine.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden bg-tangerine font-mono text-sm font-semibold text-ink"
            aria-hidden
          >
            {profilePicture ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview data URLs cannot use the image optimizer.
              <img
                src={profilePicture}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              "+"
            )}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="border border-rule px-3 py-2 text-xs uppercase tracking-[0.12em] hover:border-acid"
            >
              {profilePicture ? "Change picture" : "Add picture"}
            </button>
            {profilePicture && (
              <button
                type="button"
                onClick={() => {
                  setProfilePicture(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="px-2 py-2 text-xs text-mute hover:text-paper"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => pickProfilePicture(e.target.files?.[0])}
          />
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          placeholder="Display name"
          className="mt-4 w-full border border-rule bg-ink px-3 py-2 text-lg text-paper outline-none focus:border-acid"
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
