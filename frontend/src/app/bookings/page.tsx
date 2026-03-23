"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, FileText, Star } from "lucide-react";
import { BookingsPagination } from "@/components/bookings/BookingsPagination";
import { RateStayDialog } from "@/components/bookings/RateStayDialog";
import { cn } from "@/lib/utils";
import { formatNumberCompact } from "@/lib/format";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("token");
    const supabaseToken = localStorage.getItem("supabase_access_token");
    return {
        Authorization: `Bearer ${token ?? ""}`,
        ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
    };
}

type HotelNested = {
    id?: string;
    name?: string | null;
    address?: string | null;
    images?: string[] | null;
    profile_image?: string | null;
};
type RoomNested = {
    hotel_id?: string | null;
    name?: string | null;
    hotels?: HotelNested | HotelNested[] | null;
};
type GuestBookingRow = {
    id: string;
    check_in: string;
    check_out: string;
    status: string;
    payment_status?: string;
    payment_method?: string | null;
    total_amount: string;
    rooms?: RoomNested | RoomNested[] | null;
    hotel_cover_url?: string | null;
    /** From API: guest already submitted a review for this booking */
    has_review?: boolean;
    /** From API: may open rate dialog (not blocked by monthly hotel limit) */
    can_rate_stay?: boolean;
    /** When rate is blocked by monthly limit for this property */
    rate_stay_block_reason?: string | null;
};

const PAGE_SIZE = 10;

type BookingsListResponse = {
    bookings?: GuestBookingRow[];
    total?: number;
};

function roomAndHotel(b: GuestBookingRow): { roomName: string | null; hotel: HotelNested | null } {
    const r = Array.isArray(b.rooms) ? b.rooms[0] : b.rooms;
    const h = r?.hotels;
    const hotel = (Array.isArray(h) ? h[0] : h) ?? null;
    return { roomName: r?.name ?? null, hotel };
}

function hotelDisplayName(b: GuestBookingRow): string {
    const { hotel } = roomAndHotel(b);
    return hotel?.name?.trim() || "Hotel";
}

function refLabel(id: string): string {
    const compact = id.replace(/-/g, "").slice(0, 8).toUpperCase();
    return `MST-${compact}`;
}

function formatStayRange(checkIn: string, checkOut: string): string {
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    const a = new Date(checkIn).toLocaleDateString("en-US", opts);
    const b = new Date(checkOut).toLocaleDateString("en-US", opts);
    return `${a} - ${b}`;
}

function statusBadge(b: GuestBookingRow): { label: string; className: string } {
    const st = (b.status ?? "").toLowerCase();
    const ps = (b.payment_status ?? "").toLowerCase();
    if (st === "cancelled" || ps === "cancelled") {
        return {
            label: "CANCELLED",
            className:
                "bg-red-100 text-red-900 ring-1 ring-red-200/80 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900/50"
        };
    }
    if (st === "pending") {
        return {
            label: "PENDING",
            className: "bg-amber-100 text-amber-900 ring-1 ring-amber-200/80"
        };
    }
    /** Finished stay — show before PAID so list badge reads "Completed" (gray), not payment state. */
    if (st === "completed") {
        return {
            label: "COMPLETED",
            className:
                "bg-slate-100 text-slate-800 ring-1 ring-slate-200/90 dark:bg-slate-800/55 dark:text-slate-100 dark:ring-slate-600/80"
        };
    }
    if (ps === "paid") {
        return {
            label: "PAID",
            className: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80"
        };
    }
    if (st === "confirmed") {
        return {
            label: "CONFIRMED",
            className:
                "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80 dark:bg-emerald-950/45 dark:text-emerald-100 dark:ring-emerald-900/50"
        };
    }
    return {
        label: (b.status || "—").toUpperCase(),
        className: "bg-muted text-muted-foreground ring-1 ring-border"
    };
}

function canRateStay(b: GuestBookingRow): boolean {
    if (b.has_review === true) return false;
    if (typeof b.can_rate_stay === "boolean") return b.can_rate_stay;
    const st = (b.status ?? "").toLowerCase();
    if (st === "pending" || st === "cancelled") return false;
    if (!["confirmed", "completed"].includes(st)) return false;
    return new Date(b.check_out) <= new Date();
}

export default function GuestBookingsPage() {
    const router = useRouter();
    const [bookings, setBookings] = useState<GuestBookingRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [pageLoading, setPageLoading] = useState(false);
    /** Booking row for open "Rate your stay" dialog (null = closed). */
    const [rateTarget, setRateTarget] = useState<GuestBookingRow | null>(null);
    const isFirstLoadRef = useRef(true);
    const skipNextPageEffectRef = useRef(false);

    const loadBookings = useCallback(
        async (targetPage: number) => {
            const token = localStorage.getItem("token");
            if (!token) {
                router.replace("/login");
                return;
            }
            const showFullPageLoad = isFirstLoadRef.current;
            if (showFullPageLoad) setLoading(true);
            else setPageLoading(true);
            try {
                async function fetchPage(p: number) {
                    const res = await fetch(
                        `${API_BASE}/api/bookings?page=${p}&limit=${PAGE_SIZE}`,
                        { headers: getAuthHeaders() }
                    );
                    if (!res.ok) return null;
                    return (await res.json()) as BookingsListResponse | GuestBookingRow[];
                }

                let body = await fetchPage(targetPage);
                if (!body) {
                    toast.error("Could not load your bookings.");
                    setBookings([]);
                    setTotal(0);
                    return;
                }

                const totalFromResponse = (b: BookingsListResponse | GuestBookingRow[]) => {
                    if (Array.isArray(b)) return b.length;
                    if (typeof b.total === "number") return b.total;
                    return Array.isArray(b.bookings) ? b.bookings.length : 0;
                };

                let t = totalFromResponse(body);
                const maxPage = Math.max(1, Math.ceil(t / PAGE_SIZE));
                if (t > 0 && targetPage > maxPage) {
                    const fixed = await fetchPage(maxPage);
                    if (!fixed) {
                        toast.error("Could not load your bookings.");
                        setBookings([]);
                        setTotal(0);
                        return;
                    }
                    body = fixed;
                    t = totalFromResponse(body);
                    skipNextPageEffectRef.current = true;
                    setPage(maxPage);
                }

                const list = Array.isArray(body)
                    ? body
                    : Array.isArray(body.bookings)
                      ? body.bookings
                      : [];
                setBookings(list);
                setTotal(t);
            } finally {
                if (showFullPageLoad) {
                    setLoading(false);
                    isFirstLoadRef.current = false;
                } else {
                    setPageLoading(false);
                }
            }
        },
        [router]
    );

    useEffect(() => {
        if (skipNextPageEffectRef.current) {
            skipNextPageEffectRef.current = false;
            return;
        }
        void loadBookings(page);
    }, [page, loadBookings]);

    if (loading) {
        return (
            <div className="min-h-[60vh] bg-background">
                <div className="mx-auto max-w-6xl px-4 py-12">
                    <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
                    <div className="mt-2 h-4 w-72 animate-pulse rounded-md bg-muted/80" />
                    <div className="mt-10 space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="flex gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
                            >
                                <div className="h-28 w-36 shrink-0 animate-pulse rounded-lg bg-muted sm:h-32 sm:w-44" />
                                <div className="flex-1 space-y-2 py-1">
                                    <div className="h-4 w-3/4 max-w-xs animate-pulse rounded bg-muted" />
                                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted/80" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pb-16 pt-8">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
                <header className="mb-10">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        My Bookings
                    </h1>
                    <p className="mt-2 max-w-2xl text-base text-muted-foreground">
                        Manage your upcoming and past stays.
                    </p>
                </header>

                {total === 0 ? (
                    <div className="rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                        <p className="text-muted-foreground">
                            You don&apos;t have any bookings yet.
                        </p>
                        <Link
                            href="/hotels"
                            className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                        >
                            Browse properties
                        </Link>
                    </div>
                ) : (
                    <div className={cn("relative", pageLoading && "pointer-events-none opacity-60")}>
                        <ul className="flex flex-col gap-5">
                            {bookings.map((b) => {
                                const badge = statusBadge(b);
                                const hotelName = hotelDisplayName(b);
                                const { roomName } = roomAndHotel(b);
                                const cover = b.hotel_cover_url;
                                const hasReview = b.has_review === true;
                                const rateOk = canRateStay(b);
                                const rateBlockHint =
                                    b.rate_stay_block_reason?.trim() ||
                                    (!rateOk && !hasReview
                                        ? "You can rate after check-out when your stay is confirmed or completed."
                                        : undefined);

                                return (
                                    <li key={b.id}>
                                        <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-border/80 sm:flex-row sm:gap-5 sm:p-5">
                                            <div className="relative mx-auto h-40 w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:mx-0 sm:h-36 sm:w-44 md:h-40 md:w-52">
                                                {cover ? (
                                                    // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs
                                                    <img
                                                        src={cover}
                                                        alt=""
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-muted to-muted/60 px-2 text-center">
                                                        <span className="text-2xl font-bold text-muted-foreground/50">
                                                            {hotelName.slice(0, 1)}
                                                        </span>
                                                        {roomName ? (
                                                            <span className="line-clamp-2 text-[10px] font-medium text-muted-foreground">
                                                                {roomName}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex min-w-0 flex-1 flex-col">
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <span
                                                        className={cn(
                                                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                                            badge.className
                                                        )}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                    <span className="text-xs font-medium text-muted-foreground">
                                                        Ref: #{refLabel(b.id)}
                                                    </span>
                                                </div>

                                                <h2 className="mt-2 text-xl font-bold leading-tight text-foreground sm:text-2xl">
                                                    {hotelName}
                                                </h2>
                                                {roomName ? (
                                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                                        {roomName}
                                                    </p>
                                                ) : null}

                                                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Calendar
                                                        className="h-4 w-4 shrink-0 text-muted-foreground/80"
                                                        aria-hidden
                                                    />
                                                    <span>
                                                        {formatStayRange(b.check_in, b.check_out)}
                                                    </span>
                                                    <span className="text-border">·</span>
                                                    <span className="font-medium text-foreground">
                                                        ₱{formatNumberCompact(b.total_amount)}
                                                    </span>
                                                </p>

                                                <div className="mt-5 flex flex-wrap gap-2">
                                                    <Link
                                                        href={`/bookings/${b.id}`}
                                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
                                                    >
                                                        <FileText className="h-4 w-4" aria-hidden />
                                                        View details
                                                    </Link>
                                                    {hasReview ? (
                                                        <span
                                                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-muted/50 px-4 text-sm font-semibold text-muted-foreground"
                                                            title="You already submitted a review for this stay."
                                                        >
                                                            <Star
                                                                className="h-4 w-4 fill-amber-400 text-amber-500"
                                                                aria-hidden
                                                            />
                                                            Rated
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={!rateOk}
                                                            title={!rateOk ? rateBlockHint : undefined}
                                                            onClick={() => rateOk && setRateTarget(b)}
                                                            className={cn(
                                                                "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition",
                                                                rateOk
                                                                    ? "border-border bg-card text-foreground hover:bg-muted"
                                                                    : "cursor-not-allowed border-transparent bg-muted/80 text-muted-foreground opacity-70"
                                                            )}
                                                        >
                                                            <Star
                                                                className={cn(
                                                                    "h-4 w-4",
                                                                    rateOk
                                                                        ? "text-amber-500"
                                                                        : "text-muted-foreground"
                                                                )}
                                                                aria-hidden
                                                            />
                                                            Rate stay
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </article>
                                    </li>
                                );
                            })}
                        </ul>
                        <BookingsPagination
                            total={total}
                            page={page}
                            pageSize={PAGE_SIZE}
                            onPageChange={setPage}
                            disabled={pageLoading}
                        />
                    </div>
                )}
            </div>

            <RateStayDialog
                open={rateTarget !== null}
                onClose={() => setRateTarget(null)}
                bookingId={rateTarget?.id ?? null}
                hotelName={rateTarget ? hotelDisplayName(rateTarget) : ""}
                apiBase={API_BASE}
                getAuthHeaders={getAuthHeaders}
                onSuccess={() => void loadBookings(page)}
            />
        </div>
    );
}
