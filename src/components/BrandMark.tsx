export function BrandMark({
  className,
  title = "CursorParty",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 88 64"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      <path
        d="M26 7c-9.5 2.2-16 11-16 25s6.5 22.8 16 25"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="38.5" cy="23" r="6.4" fill="#2EA8FF" />
      <circle cx="54.5" cy="23" r="6.4" fill="#E83DFF" />
      <circle cx="38.5" cy="39" r="6.4" fill="#F5B400" />
      <circle cx="54.5" cy="39" r="6.4" fill="#2ECC8A" />
      <path
        d="M62 7c9.5 2.2 16 11 16 25s-6.5 22.8-16 25"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}
