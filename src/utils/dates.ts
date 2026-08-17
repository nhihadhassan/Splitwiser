const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthDay(date: string): { month: string; day: string } {
  const [, m, d] = date.split("-");
  return { month: MONTHS[Number(m) - 1] ?? "?", day: String(Number(d)) };
}

export function monthLabel(date: string): string {
  const [y, m] = date.split("-");
  const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", {
    month: "long",
  });
  return `${monthName} ${y}`;
}

export function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
