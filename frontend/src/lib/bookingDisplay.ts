/**
 * Guest-facing check-in / check-out display: combine each stay date with the hotel's policy times.
 */

const DEFAULT_CHECK_IN_H = 14;
const DEFAULT_CHECK_IN_M = 0;
const DEFAULT_CHECK_OUT_H = 11;
const DEFAULT_CHECK_OUT_M = 0;

/** Parse Postgres TIME / HTML time string "HH:MM" or "HH:MM:SS". */
export function parseHotelTimeString(
    time: string | null | undefined,
    fallbackH: number,
    fallbackM: number
): { h: number; m: number } {
    if (!time || typeof time !== "string") return { h: fallbackH, m: fallbackM };
    const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
    if (!m) return { h: fallbackH, m: fallbackM };
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return { h: fallbackH, m: fallbackM };
    return { h, m: min };
}

/**
 * Local calendar date from stored instant, with hotel policy time applied (nightly stays).
 */
export function nightlyCheckDisplayDate(
    bookingIso: string,
    hotelTime: string | null | undefined,
    kind: "check_in" | "check_out"
): Date {
    const base = new Date(bookingIso);
    const defH = kind === "check_in" ? DEFAULT_CHECK_IN_H : DEFAULT_CHECK_OUT_H;
    const defM = kind === "check_in" ? DEFAULT_CHECK_IN_M : DEFAULT_CHECK_OUT_M;
    const { h, m } = parseHotelTimeString(hotelTime, defH, defM);
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
}

export function formatLocalizedStayDateTime(d: Date): string {
    return d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

/** Hourly bookings: show date + span from first to last selected hour (last hour is start of final slot). */
export function formatHourlyStayWindow(checkInIso: string, hourlyHours: number[] | null | undefined): string {
    const base = new Date(checkInIso);
    const dateStr = base.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
    });
    if (!hourlyHours?.length) {
        return formatLocalizedStayDateTime(base);
    }
    const sorted = [...new Set(hourlyHours.map((n) => Math.floor(Number(n))))]
        .filter((n) => n >= 0 && n <= 23)
        .sort((a, b) => a - b);
    if (sorted.length === 0) {
        return formatLocalizedStayDateTime(base);
    }
    const startH = sorted[0];
    const endH = sorted[sorted.length - 1] + 1;
    const t = (hour: number) =>
        new Date(2000, 0, 1, hour, 0, 0, 0).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit"
        });
    return `${dateStr}, ${t(startH)} – ${t(endH)}`;
}
