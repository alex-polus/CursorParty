"use client";

import { initials } from "@/lib/colors";
import type { PresenceGuest } from "@/lib/types";

export function PresencePanel({
  guests,
  selfId,
}: {
  guests: PresenceGuest[];
  selfId: string | null;
}) {
  return (
    <section className="border-t border-rule px-3 py-3">
      <p className="ticket mb-2">in the room · {guests.length}</p>
      <ul className="grid gap-2">
        {guests.length === 0 && (
          <li className="text-xs text-mute">Waiting for a second chair.</li>
        )}
        {guests.map((g) => (
          <li key={g.id} className="flex items-center gap-2">
            <Avatar name={g.displayName} color={g.color} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {g.displayName}
                {g.id === selfId ? (
                  <span className="ml-1 text-[10px] uppercase tracking-wider text-mute">
                    you
                  </span>
                ) : null}
              </p>
              <p className="truncate font-mono text-[10px] text-mute">
                {g.viewingThreadId
                  ? `watching ${g.viewingThreadId.slice(0, 6)}`
                  : "in the lobby"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Avatar({
  name,
  color,
  size = 22,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      title={name}
      className="grid shrink-0 place-items-center font-mono text-[10px] font-medium text-ink"
      style={{
        width: size,
        height: size,
        background: color,
      }}
    >
      {initials(name)}
    </span>
  );
}
