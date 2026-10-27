const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Convert job-board HTML (possibly entity-escaped, as Greenhouse returns it) to readable plain text. */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return "";
  let html = input;
  // Greenhouse returns HTML that is itself entity-escaped ("&lt;p&gt;").
  if (/&lt;\/?[a-z]/i.test(html) && !/<\/?[a-z]/i.test(html)) html = decodeEntities(html);

  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|ul|ol|h[1-6]|section|tr)>/gi, "\n")
    .replace(/<(p|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ENGINEERING_TITLE =
  /\b(software|engineer(ing)?|developer|dev|programmer|front[- ]?end|back[- ]?end|full[- ]?stack|sre|devops|platform|web|mobile|ios|android|architect)\b/i;

/** Coarse filter applied at ingest so company boards don't flood the DB with non-engineering roles. */
export function isEngineeringRole(title: string): boolean {
  return ENGINEERING_TITLE.test(title);
}

export function detectRemote(...fields: (string | null | undefined)[]): boolean {
  return fields.some((f) => !!f && /\b(remote|anywhere|distributed|work from home|wfh)\b/i.test(f));
}

function parseAmount(raw: string): number | null {
  const s = raw.replace(/[$,\s]/g, "").toLowerCase();
  const isK = s.endsWith("k");
  const n = parseFloat(isK ? s.slice(0, -1) : s);
  if (!Number.isFinite(n)) return null;
  return Math.round(isK ? n * 1000 : n);
}

const AMOUNT = String.raw`\$\s?\d{2,3}(?:,\d{3})+|\$\s?\d{2,3}(?:\.\d+)?\s?[kK]`;
const RANGE = new RegExp(
  String.raw`(${AMOUNT})\s*(?:-|–|—|to)\s*\$?\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?\s?[kK])`,
);
const SINGLE = new RegExp(`(${AMOUNT})`);

/** Pull an annual USD salary range out of free text. Ignores hourly-looking figures. */
export function parseSalary(text: string | null | undefined): { min: number | null; max: number | null } {
  if (!text) return { min: null, max: null };
  const range = text.match(RANGE);
  if (range) {
    const min = parseAmount(range[1]);
    const max = parseAmount(range[2]);
    if (min && max && min >= 20000 && max >= min && max < 2_000_000) return { min, max };
  }
  const single = text.match(SINGLE);
  if (single) {
    const v = parseAmount(single[1]);
    if (v && v >= 20000 && v < 2_000_000) return { min: v, max: v };
  }
  return { min: null, max: null };
}

export function dedupeKey(company: string, title: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${norm(company)}|${norm(title)}`;
}

export function toDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
