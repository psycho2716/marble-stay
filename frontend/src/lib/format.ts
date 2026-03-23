const compactNumberFmt = new Intl.NumberFormat("en-PH");

export function formatNumberCompact(value: string | number | null | undefined): string {
  if (value == null || value === "") return "0";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0";
  return compactNumberFmt.format(Math.round(n));
}

/** Currency code -> symbol for display. Default PHP. */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  PHP: "₱",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  KRW: "₩",
  SGD: "S$",
  AUD: "A$",
};

export const CURRENCY_OPTIONS = [
  { code: "PHP", label: "Philippine Peso (₱)", symbol: "₱" },
  { code: "USD", label: "US Dollar ($)", symbol: "$" },
  { code: "EUR", label: "Euro (€)", symbol: "€" },
  { code: "GBP", label: "British Pound (£)", symbol: "£" },
  { code: "JPY", label: "Japanese Yen (¥)", symbol: "¥" },
  { code: "KRW", label: "South Korean Won (₩)", symbol: "₩" },
  { code: "SGD", label: "Singapore Dollar (S$)", symbol: "S$" },
  { code: "AUD", label: "Australian Dollar (A$)", symbol: "A$" },
];

/** Format a price with the hotel's currency symbol. Falls back to PHP. */
export function formatCurrency(
  value: string | number | null | undefined,
  currencyCode: string | null | undefined
): string {
  const code = (currencyCode ?? "PHP").toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] ?? code;
  const formatted = formatNumberCompact(value);
  return `${symbol}${formatted}`;
}

