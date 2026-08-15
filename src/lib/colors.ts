export const GUEST_COLORS = [
  "#FF4D1A",
  "#D8FF3E",
  "#5B8CFF",
  "#FF4D9A",
  "#2EE6A6",
  "#FFD166",
  "#C084FC",
  "#67E8F9",
  "#FB7185",
  "#A3E635",
] as const;

export function colorForIndex(index: number): string {
  return GUEST_COLORS[Math.abs(index) % GUEST_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
