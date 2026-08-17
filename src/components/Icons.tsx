import type { ExpenseCategory, GroupType } from "../types";

type IconProps = { size?: number; strokeWidth?: number };

function Svg({ children, size = 20, strokeWidth = 1.8 }: IconProps & { children: React.ReactNode }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

export function BrandMark({ size = 32 }: { size?: number }) {
  return <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true"><svg viewBox="0 0 40 40" width={size} height={size} fill="none"><path d="M7 9C9 5 14 3 20 4h13l-7 8H16c-2 0-3 1-3 3 0 2 2 3 5 3h6l-5 6h-5C8 24 4 21 4 16c0-3 1-5 3-7Z" fill="#E7BF67" /><path d="M33 31c-2 4-7 6-13 5H7l7-8h10c2 0 3-1 3-3 0-2-2-3-5-3h-5l5-6h5c5 0 9 3 9 8 0 3-1 5-3 7Z" fill="#8BE0B6" /></svg></span>;
}

export function CategoryIcon({ category, size = 22 }: { category: ExpenseCategory; size?: number }) {
  const icons: Record<ExpenseCategory, React.ReactNode> = {
    flights: <><path d="M3 14.5 21 8l-1.5-2-7 2-4-5-2 .7 3 5.7-4.5 2L2 10l-1 1.5 4 3Z" /><path d="m10 12-1 7 2-.7 3.5-7.8" /></>,
    lodging: <><path d="M4 4v16M4 13h16v7M7 10h4a3 3 0 0 1 3 3H7zM14 9h3a3 3 0 0 1 3 3v1h-6z" /></>,
    "car-rental": <><path d="M5 17h14l-1-7a2 2 0 0 0-2-1H8a2 2 0 0 0-2 1l-1 7Z" /><path d="m7 9 1.5-4h7L17 9M5 17v3M19 17v3M7.5 14h.01M16.5 14h.01" /></>,
    transit: <><rect x="6" y="3" width="12" height="15" rx="3" /><path d="M8.5 7h7M8.5 12h7M9 18l-2 3M15 18l2 3M9 15h.01M15 15h.01" /></>,
    food: <><path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M16 3v18M16 3c2.2 1.6 3.5 4.1 3.5 6.7H16" /></>,
    drinks: <><path d="M7 3h10l-1 7a4 4 0 0 1-8 0L7 3Z" /><path d="M12 14v7M8 21h8" /></>,
    sightseeing: <><path d="M3 9h18L12 3 3 9ZM5 9v9M9 9v9M15 9v9M19 9v9M3 18h18M2 21h20" /></>,
    activities: <><path d="M5 6h14v12H5z" /><path d="M5 9h14M5 15h14M8 6v12M16 6v12" /></>,
    shopping: <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
    gas: <><path d="M5 3h9v18H5zM7 6h5v5H7z" /><path d="M14 8h2l2 2v7a1.5 1.5 0 0 0 3 0v-6l-2-2" /></>,
    groceries: <><path d="M4 8h16l-1 12H5L4 8Z" /><path d="M8 8a4 4 0 0 1 8 0M9 13h.01M12 13h.01M15 13h.01" /></>,
    other: <><path d="M7 3.5h7l3 3v14H7z" /><path d="M14 3.5v4h4M9.5 12h5M9.5 16h5" /></>,
    general: <><path d="M7 3.5h7l3 3v14H7z" /><path d="M14 3.5v4h4M9.5 12h5M9.5 16h5" /></>,
    rent: <><path d="m3 11 9-7 9 7" /><path d="M5.5 10v10h13V10M9 20v-6h6v6" /></>,
    utilities: <><path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z" /></>,
    transport: <><path d="M5 17h14l-1-8a2 2 0 0 0-2-1H8a2 2 0 0 0-2 1l-1 8Z" /><path d="M5 17v3M19 17v3M7 12h10M7 17h.01M17 17h.01" /></>,
    travel: <><path d="m3 12 18-7-7 18-2-7-9-4Z" /><path d="m12 16 3-3" /></>,
    entertainment: <><path d="m4 5 16-2-1 17-16 2z" /><path d="m8 8 7 4-7 4z" /></>,
    medical: <><path d="M9 3h6v5h5v6h-5v5H9v-5H4V8h5V3Z" /></>,
  };
  return <span className="semantic-icon"><Svg size={size}>{icons[category]}</Svg></span>;
}

export function PaymentIcon({ size = 20 }: { size?: number }) {
  return (
    <span className="semantic-icon">
      <Svg size={size}>
        <path d="M5 8h13M15 5l3 3-3 3M19 16H6M9 13l-3 3 3 3" />
      </Svg>
    </span>
  );
}

export function GroupIcon({ type, size = 20 }: { type: GroupType; size?: number }) {
  const icons: Record<GroupType, React.ReactNode> = {
    trip: <><path d="m3 12 18-7-7 18-2-7-9-4Z" /><path d="m12 16 3-3" /></>,
    home: <><path d="m3 11 9-7 9 7" /><path d="M5.5 10v10h13V10M9 20v-6h6v6" /></>,
    couple: <path d="M20.8 8.8c0 5.2-8.8 10-8.8 10s-8.8-4.8-8.8-10A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 8.8 1.7Z" />,
    other: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  };
  return <span className="semantic-icon group-semantic-icon"><Svg size={size}>{icons[type]}</Svg></span>;
}

export function GroupBadge({ type, name: _name, size = 44 }: { type: GroupType; name: string; size?: number }) {
  return <GroupIcon type={type} size={size * 0.5} />;
}

export function NavIcon({ type }: { type: "overview" | "groups" | "activity" | "expenses" | "settlements" | "reconciliation" }) {
  const icons = {
    overview: <><circle cx="12" cy="12" r="8" /><path d="m12 8 1.5 3.5L17 13l-3.5 1.5L12 18l-1.5-3.5L7 13l3.5-1.5L12 8Z" /></>,
    groups: <><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3.5 19c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5M15 15c2.7-.3 4.5 1 5.5 4" /></>,
    activity: <><path d="M4 13h3l2-6 4 11 2-5h5" /></>,
    expenses: <><path d="M7 3.5h7l3 3v14H7z" /><path d="M14 3.5v4h4M10 12h4M10 16h4" /></>,
    settlements: <><path d="M5 8h13M15 5l3 3-3 3M19 16H6M9 13l-3 3 3 3" /></>,
    reconciliation: <><path d="M5 12.5 9 16l10-10" /><path d="M4 5h5M4 19h5M15 19h5" /></>,
  };
  return <span className="nav-mark"><Svg size={18}>{icons[type]}</Svg></span>;
}
