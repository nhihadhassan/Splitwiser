import type { Person } from "../types";

export function Avatar({ person, size = 28 }: { person: Person | undefined; size?: number }) {
  const name = person?.name ?? "?";
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: person?.color ?? "#999",
      }}
      title={name}
    >
      {initials}
    </span>
  );
}
