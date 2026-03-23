/**
 * Shared logic for displaying opening hours: 12h time format and condensed
 * display (Daily, Weekdays / Weekends, or per-day).
 */

const DAYS_ORDER = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
] as const;
const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const WEEKEND_KEYS = ["saturday", "sunday"] as const;

export type DayHours = { open?: string; close?: string };
export type OpeningHoursRecord = Record<string, DayHours>;

/** Format 24h time (e.g. "06:00", "23:00") to 12h (e.g. "6:00 AM", "11:00 PM"). */
export function formatTime12h(t: string | null | undefined): string {
    if (!t || t === "—") return "—";
    const match = t.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return t;
    const h = parseInt(match[1], 10);
    const m = match[2];
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${period}`;
}

export const DAY_LABELS: Record<string, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday"
};

export type CondensedOpeningHours =
    | { type: "daily"; open: string; close: string }
    | {
          type: "weekdays_weekends";
          weekdays: { open: string; close: string };
          weekends: { open: string; close: string };
      }
    | {
          type: "weekdays_only";
          open: string;
          close: string;
      }
    | {
          type: "weekends_only";
          open: string;
          close: string;
      }
    | {
          type: "custom";
          entries: { day: string; label: string; open: string; close: string }[];
      };

function normalize(open: string | undefined, close: string | undefined): { open: string; close: string } {
    return { open: open ?? "—", close: close ?? "—" };
}

function hasHours(h: DayHours | undefined): boolean {
    return !!(h && (h.open || h.close) && (h.open !== "—" || h.close !== "—"));
}

/**
 * Condense opening_hours for display: Daily, Weekdays/Weekends, or per-day.
 * Only considers monday..sunday (ignores _preset etc).
 */
export function getCondensedOpeningHours(
    openingHours: OpeningHoursRecord | null | undefined
): CondensedOpeningHours | null {
    if (!openingHours) return null;

    const entries = DAYS_ORDER.map((day) => {
        const h = openingHours[day];
        const { open, close } = normalize(h?.open, h?.close);
        return { day, label: DAY_LABELS[day] ?? day, open, close };
    }).filter((e) => hasHours(openingHours[e.day]));

    if (entries.length === 0) return null;

    // All 7 days same → Daily
    const allSame =
        entries.length === 7 &&
        entries.every((e) => e.open === entries[0].open && e.close === entries[0].close);
    if (allSame) {
        return { type: "daily", open: entries[0].open, close: entries[0].close };
    }

    const wdHours = WEEKDAY_KEYS.map((d) => openingHours[d]).filter(hasHours);
    const weHours = WEEKEND_KEYS.map((d) => openingHours[d]).filter(hasHours);
    const wdSame =
        wdHours.length === 5 &&
        wdHours.every(
            (h) =>
                h?.open === wdHours[0]?.open &&
                h?.close === wdHours[0]?.close
        );
    const weSame =
        weHours.length === 2 &&
        weHours.every(
            (h) =>
                h?.open === weHours[0]?.open &&
                h?.close === weHours[0]?.close
        );

    // Only weekends set and same → Weekends
    if (weSame && wdHours.length === 0 && weHours[0]) {
        return {
            type: "weekends_only",
            open: weHours[0].open ?? "—",
            close: weHours[0].close ?? "—"
        };
    }
    // Only weekdays set and same → Weekdays
    if (wdSame && weHours.length === 0 && wdHours[0]) {
        return {
            type: "weekdays_only",
            open: wdHours[0].open ?? "—",
            close: wdHours[0].close ?? "—"
        };
    }
    // Both weekdays and weekends set, each group same → Weekdays / Weekends
    if (wdSame && weSame && wdHours[0] && weHours[0]) {
        return {
            type: "weekdays_weekends",
            weekdays: { open: wdHours[0].open ?? "—", close: wdHours[0].close ?? "—" },
            weekends: { open: weHours[0].open ?? "—", close: weHours[0].close ?? "—" }
        };
    }

    // Per-day list (only days that have hours)
    const withHours = DAYS_ORDER.map((day) => {
        const h = openingHours[day];
        const { open, close } = normalize(h?.open, h?.close);
        return { day, label: DAY_LABELS[day] ?? day, open, close };
    }).filter((e) => hasHours(openingHours[e.day]));

    return { type: "custom", entries: withHours };
}
