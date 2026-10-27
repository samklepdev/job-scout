export function formatSalary(min: number | null, max: number | null): string | null {
  const k = (n: number) => `$${Math.round(n / 1000)}k`;
  if (min && max && min !== max) return `${k(min)}–${k(max)}`;
  if (min || max) return k((min ?? max)!);
  return null;
}

export function timeAgo(date: Date | null, now = new Date()): string {
  if (!date) return "";
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export const SOURCE_LABELS: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  remotive: "Remotive",
  remoteok: "RemoteOK",
  hn: "HN Who's Hiring",
};
