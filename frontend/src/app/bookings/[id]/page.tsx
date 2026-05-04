"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    AlertTriangle,
    ArrowLeft,
    Bath,
    BedDouble,
    Calendar,
    CheckCircle2,
    Clock,
    CreditCard,
    MapPin,
    MessageSquare,
    Star,
    Upload,
    Users
} from "lucide-react";
import { BookingMessagesPanel } from "@/components/bookings/BookingMessagesPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    formatHourlyStayWindow,
    formatLocalizedStayDateTime,
    nightlyCheckDisplayDate
} from "@/lib/bookingDisplay";
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

type GuestBookingDetail = {
    id: string;
    check_in: string;
    check_out: string;
    status: string;
    booking_type?: string;
    hourly_hours?: number[] | null;
    payment_status?: string;
    payment_method?: string | null;
    payment_receipt_path?: string | null;
    payment_rejection_note?: string | null;
    total_amount: string;
    rooms?: {
        id?: string;
        name?: string | null;
        description?: string | null;
        room_type?: string | null;
        capacity?: number | null;
        amenities?: unknown;
        media_urls?: RoomMediaItem[] | null;
        bathroom_count?: number | null;
        bathroom_shared?: boolean | null;
        offer_hourly?: boolean | null;
        hourly_rate?: string | null;
        hotels?: {
            id?: string;
            name?: string;
            address?: string;
            check_in_time?: string | null;
            check_out_time?: string | null;
        } | null;
    } | null;
    can_review?: boolean;
    existing_review?: { rating: number; comment: string | null; created_at: string } | null;
    review_block_reason?: string | null;
};

type RoomMediaItem = { type: string; url: string };

function parseRoomAmenities(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function statusPill(
    label: string,
    variant: "neutral" | "success" | "warning" | "danger" | "info" | "complete"
) {
    const map = {
        neutral:
            "bg-muted text-muted-foreground ring-1 ring-border dark:bg-muted/80 dark:ring-border",
        complete:
            "bg-slate-100 text-slate-800 ring-1 ring-slate-200/90 dark:bg-slate-800/55 dark:text-slate-100 dark:ring-slate-600/80",
        success:
            "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80 dark:bg-emerald-950/45 dark:text-emerald-100 dark:ring-emerald-900/50",
        warning:
            "bg-amber-100 text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900/40",
        danger: "bg-red-100 text-red-900 ring-1 ring-red-200/80 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900/50",
        info: "bg-sky-100 text-sky-900 ring-1 ring-sky-200/80 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900/50"
    };
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide",
                map[variant]
            )}
        >
            {label}
        </span>
    );
}

function bookingStatusVariant(
    status: string
): "neutral" | "success" | "warning" | "danger" | "info" | "complete" {
    const s = status.toLowerCase();
    if (s === "cancelled") return "danger";
    if (s === "pending") return "warning";
    if (s === "confirmed") return "success";
    if (s === "completed") return "complete";
    return "neutral";
}

function paymentStatusVariant(ps: string): "neutral" | "success" | "warning" | "danger" {
    const s = ps.toLowerCase();
    if (s === "paid") return "success";
    if (s === "pending") return "warning";
    if (s === "cancelled") return "danger";
    if (s === "refunded") return "neutral";
    return "neutral";
}

/** Pills in trip header — matches guest “view booking” reference copy. */
function guestBookingStatusPillLabel(status: string): string {
    const s = (status ?? "").toLowerCase();
    if (s === "pending") return "BOOKING PENDING";
    if (s === "confirmed") return "BOOKING CONFIRMED";
    if (s === "completed") return "BOOKING: COMPLETED";
    if (s === "cancelled") return "BOOKING CANCELLED";
    return `BOOKING ${(status || "—").toUpperCase()}`;
}

function guestPaymentStatusPillLabel(paymentStatus: string): string {
    const s = (paymentStatus ?? "").toLowerCase();
    if (s === "paid") return "PAYMENT PAID";
    if (s === "pending") return "PAYMENT PENDING";
    if (s === "cancelled") return "PAYMENT CANCELLED";
    return `PAYMENT ${(paymentStatus || "—").toUpperCase()}`;
}

function guestPaymentMethodCaption(method: string | null | undefined): string | null {
    if (!method?.trim()) return null;
    const x = method.toLowerCase();
    if (x === "cash") return "Cash Payment";
    if (x === "online" || x === "gcash") return "Online Payment";
    return `${method} payment`;
}

/** Guest may POST a new receipt when online, confirmed, pending payment, and not awaiting first verification. */
function canUploadNewReceipt(b: GuestBookingDetail): boolean {
    const online = (b.payment_method ?? "").toLowerCase() === "online";
    const pendingPay = (b.payment_status ?? "").toLowerCase() === "pending";
    const confirmed = (b.status ?? "").toLowerCase() === "confirmed";
    if (!online || !pendingPay || !confirmed) return false;
    const hasPath = !!(b.payment_receipt_path && String(b.payment_receipt_path).trim());
    const hasRejection = !!(b.payment_rejection_note && String(b.payment_rejection_note).trim());
    if (hasPath && !hasRejection) return false;
    return true;
}

function awaitingReceiptVerification(b: GuestBookingDetail): boolean {
    const online = (b.payment_method ?? "").toLowerCase() === "online";
    const pendingPay = (b.payment_status ?? "").toLowerCase() === "pending";
    const confirmed = (b.status ?? "").toLowerCase() === "confirmed";
    const hasPath = !!(b.payment_receipt_path && String(b.payment_receipt_path).trim());
    const hasRejection = !!(b.payment_rejection_note && String(b.payment_rejection_note).trim());
    return online && pendingPay && confirmed && hasPath && !hasRejection;
}

export default function GuestBookingDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = typeof params?.id === "string" ? params.id : "";
    const [scrollToRate, setScrollToRate] = useState(false);

    const [booking, setBooking] = useState<GuestBookingDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);

    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
    const [receiptUploading, setReceiptUploading] = useState(false);
    const receiptInputRef = useRef<HTMLInputElement>(null);

    const [reviewRating, setReviewRating] = useState(5);
    const [reviewComment, setReviewComment] = useState("");
    const [reviewSubmitting, setReviewSubmitting] = useState(false);

    const rateSectionRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        if (!id) {
            setLoadFailed(true);
            toast.error("Invalid booking link.");
            return;
        }
        const token = localStorage.getItem("token");
        if (!token) {
            router.replace("/login");
            return;
        }
        const res = await fetch(`${API_BASE}/api/bookings/${id}`, { headers: getAuthHeaders() });
        if (!res.ok) {
            const msg = res.status === 404 ? "Booking not found." : "Could not load this booking.";
            toast.error(msg);
            setBooking(null);
            setLoadFailed(true);
            return;
        }
        setBooking(await res.json());
        setLoadFailed(false);
    }, [id, router]);

    useEffect(() => {
        load().finally(() => setLoading(false));
    }, [load]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const q = new URLSearchParams(window.location.search).get("rate");
        if (q === "1") setScrollToRate(true);
    }, []);

    useEffect(() => {
        if (!scrollToRate || loading || !booking || !rateSectionRef.current) return;
        rateSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [scrollToRate, loading, booking]);

    useEffect(() => {
        return () => {
            if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
        };
    }, [receiptPreviewUrl]);

    async function handleReceiptSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!receiptFile || !id) {
            toast.error("Choose an image of your payment receipt.");
            return;
        }
        const supabaseToken = localStorage.getItem("supabase_access_token");
        if (!supabaseToken) {
            toast.error("Please sign in again (session required to upload).");
            return;
        }
        setReceiptUploading(true);
        try {
            const fd = new FormData();
            fd.append("receipt", receiptFile);
            const res = await fetch(`${API_BASE}/api/bookings/${id}/payment-receipt`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: fd
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error((data as { error?: string }).error ?? "Upload failed.");
                return;
            }
            toast.success("Receipt submitted. The hotel will verify your payment.");
            setReceiptFile(null);
            if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
            setReceiptPreviewUrl(null);
            if (receiptInputRef.current) receiptInputRef.current.value = "";
            await load();
        } finally {
            setReceiptUploading(false);
        }
    }

    async function handleReviewSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!id) return;
        setReviewSubmitting(true);
        try {
            const res = await fetch(`${API_BASE}/api/bookings/${id}/review`, {
                method: "POST",
                headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    rating: reviewRating,
                    comment: reviewComment.trim() || null
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error((data as { error?: string }).error ?? "Could not submit review.");
                return;
            }
            toast.success("Thanks for your feedback!");
            setReviewComment("");
            await load();
        } finally {
            setReviewSubmitting(false);
        }
    }

    if (loading) {
        return (
            <div className="min-h-[50vh] bg-background">
                <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
                    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_400px]">
                        <div className="h-80 animate-pulse rounded-2xl bg-muted" />
                        <div className="space-y-6">
                            <div className="h-56 animate-pulse rounded-2xl bg-muted/90" />
                            <div className="h-64 animate-pulse rounded-2xl bg-muted/80" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (loadFailed || !booking) {
        return (
            <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
                <p className="text-muted-foreground">
                    We couldn&apos;t load this booking. Check the notification above or try again.
                </p>
                <Link
                    href="/bookings"
                    className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
                >
                    ← Back to my bookings
                </Link>
            </div>
        );
    }

    const hotelName = booking.rooms?.hotels?.name ?? "Hotel";
    const roomName = booking.rooms?.name ?? "Room";
    const address = booking.rooms?.hotels?.address;
    const hotelPolicy = booking.rooms?.hotels;
    const roomDetail = booking.rooms;
    const roomMedia = (roomDetail?.media_urls ?? []).filter((m) => m?.url?.trim());
    const roomAmenities = parseRoomAmenities(roomDetail?.amenities);
    const showRoomDetailsSection = Boolean(
        roomMedia.length > 0 ||
        (roomDetail?.description && roomDetail.description.trim()) ||
        (roomDetail?.room_type && String(roomDetail.room_type).trim()) ||
        (typeof roomDetail?.capacity === "number" && roomDetail.capacity >= 1) ||
        roomAmenities.length > 0 ||
        typeof roomDetail?.bathroom_count === "number" ||
        typeof roomDetail?.bathroom_shared === "boolean"
    );
    const isHourlyStay = (booking.booking_type ?? "").toLowerCase() === "hourly";
    const checkInDisplay = isHourlyStay
        ? formatHourlyStayWindow(booking.check_in, booking.hourly_hours ?? null)
        : formatLocalizedStayDateTime(
              nightlyCheckDisplayDate(
                  booking.check_in,
                  hotelPolicy?.check_in_time ?? null,
                  "check_in"
              )
          );
    const checkOutDisplayNightly = !isHourlyStay
        ? formatLocalizedStayDateTime(
              nightlyCheckDisplayDate(
                  booking.check_out,
                  hotelPolicy?.check_out_time ?? null,
                  "check_out"
              )
          )
        : "";
    const showUpload = canUploadNewReceipt(booking);
    const showAwaiting = awaitingReceiptVerification(booking);
    const rejectionNote = booking.payment_rejection_note?.trim();
    const paid = (booking.payment_status ?? "").toLowerCase() === "paid";

    const showPaymentSection =
        (booking.payment_method ?? "").toLowerCase() === "online" &&
        (booking.payment_status ?? "").toLowerCase() === "pending" &&
        (booking.status ?? "").toLowerCase() === "confirmed";

    const paymentCaption = guestPaymentMethodCaption(booking.payment_method);

    return (
        <div className="min-h-screen bg-muted/30 pb-16 pt-6 sm:pt-10">
            <div className="mx-auto max-w-4xl px-4 sm:px-6">
                <Link
                    href="/bookings"
                    className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition hover:text-primary"
                >
                    <ArrowLeft className="h-4 w-4" />
                    My bookings
                </Link>

                <div
                    className={cn(
                        "mt-6 w-full min-w-0",
                        showPaymentSection
                            ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start"
                            : "flex flex-col gap-6"
                    )}
                >
                    {/* Trip details + room + dates + total + rate (single card) */}
                    <article className="w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                        <div className="border-b border-border bg-card px-5 py-5 sm:px-8 sm:py-6">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0 space-y-1">
                                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                                        Trip Details
                                    </p>
                                    <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                                        {hotelName}
                                    </h1>
                                    {address ? (
                                        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                                            <MapPin
                                                className="mt-0.5 h-4 w-4 shrink-0"
                                                aria-hidden
                                            />
                                            <span>{address}</span>
                                        </p>
                                    ) : null}
                                </div>
                                <div className="flex flex-wrap justify-end gap-2">
                                    {statusPill(
                                        guestBookingStatusPillLabel(booking.status),
                                        bookingStatusVariant(booking.status)
                                    )}
                                    {booking.payment_status ? (
                                        statusPill(
                                            guestPaymentStatusPillLabel(booking.payment_status),
                                            paymentStatusVariant(booking.payment_status)
                                        )
                                    ) : null}
                                </div>
                            </div>
                            <p className="mt-3 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">{roomName}</span>
                                <span>
                                    {" "}
                                    - Ref #{booking.id.split("-")[0]}
                                </span>
                            </p>
                        </div>

                        {showRoomDetailsSection ? (
                            <div className="border-b border-border bg-card px-5 py-5 sm:px-8 sm:py-6">
                                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Your Room
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Details and photos for{" "}
                                    <span className="font-medium text-foreground">{roomName}</span>.
                                </p>

                                {roomMedia.length > 0 ? (
                                    <div
                                        className={cn(
                                            "mt-4 flex gap-2 overflow-x-auto pb-2",
                                            "[scrollbar-width:thin]",
                                            "[scrollbar-color:hsl(var(--muted-foreground)/0.35)_transparent]"
                                        )}
                                    >
                                        {roomMedia.map((item, idx) =>
                                            item.type === "video" ? (
                                                <video
                                                    key={`${item.url}-${idx}`}
                                                    src={item.url}
                                                    controls
                                                    className="h-28 w-40 shrink-0 rounded-lg border border-border bg-black object-cover sm:h-32 sm:w-44"
                                                    preload="metadata"
                                                />
                                            ) : (
                                                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs
                                                <img
                                                    key={`${item.url}-${idx}`}
                                                    src={item.url}
                                                    alt=""
                                                    className="h-28 w-40 shrink-0 rounded-lg border border-border object-cover sm:h-32 sm:w-44"
                                                />
                                            )
                                        )}
                                    </div>
                                ) : null}

                                <div className="mt-4 flex flex-wrap gap-2">
                                    {roomDetail?.room_type ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                                            <BedDouble className="h-3.5 w-3.5" aria-hidden />
                                            {roomDetail.room_type}
                                        </span>
                                    ) : null}
                                    {typeof roomDetail?.capacity === "number" &&
                                    roomDetail.capacity >= 1 ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                                            <Users className="h-3.5 w-3.5" aria-hidden />
                                            Up to {roomDetail.capacity} guest
                                            {roomDetail.capacity === 1 ? "" : "s"}
                                        </span>
                                    ) : null}
                                    {typeof roomDetail?.bathroom_count === "number" &&
                                    roomDetail.bathroom_count >= 1 ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                                            <Bath className="h-3.5 w-3.5 text-muted-foreground" />
                                            {roomDetail.bathroom_count} bathroom
                                            {roomDetail.bathroom_count === 1 ? "" : "s"}
                                        </span>
                                    ) : null}
                                    {typeof roomDetail?.bathroom_shared === "boolean" ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                                            {roomDetail.bathroom_shared
                                                ? "Shared bathroom"
                                                : "Private bathroom"}
                                        </span>
                                    ) : null}
                                </div>

                                {roomDetail?.description?.trim() ? (
                                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                                        {roomDetail.description.trim()}
                                    </p>
                                ) : null}

                                {roomAmenities.length > 0 ? (
                                    <div className="mt-4">
                                        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                                            Amenities
                                        </p>
                                        <ul className="mt-2 flex flex-wrap gap-2">
                                            {roomAmenities.map((a) => (
                                                <li
                                                    key={a}
                                                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                                                >
                                                    {a}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        <div className="grid gap-px bg-border sm:grid-cols-2">
                            {isHourlyStay ? (
                                <div className="flex gap-3 bg-card p-5 sm:col-span-2 sm:p-6">
                                    <Clock
                                        className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                                        aria-hidden
                                    />
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Your stay (hourly)
                                        </p>
                                        <p className="mt-1 text-sm font-medium text-foreground">
                                            {checkInDisplay}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex gap-3 bg-card p-5 sm:p-6">
                                        <Calendar
                                            className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                                            aria-hidden
                                        />
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                Check-in
                                            </p>
                                            <p className="mt-1 text-sm font-medium text-foreground">
                                                {checkInDisplay}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 bg-card p-5 sm:p-6">
                                        <Clock
                                            className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                                            aria-hidden
                                        />
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                Check-out
                                            </p>
                                            <p className="mt-1 text-sm font-medium text-foreground">
                                                {checkOutDisplayNightly}
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}
                            <div className="flex gap-3 bg-card p-5 sm:p-6 sm:col-span-2">
                                <CreditCard
                                    className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                                    aria-hidden
                                />
                                <div className="flex flex-1 flex-wrap items-end justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Total
                                        </p>
                                        <p className="mt-1 text-xl font-bold text-foreground">
                                            ₱{formatNumberCompact(booking.total_amount)}
                                        </p>
                                        {paymentCaption ? (
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {paymentCaption}
                                            </p>
                                        ) : null}
                                    </div>
                                    {paid ? (
                                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                                            <CheckCircle2 className="h-5 w-5" aria-hidden />
                                            Payment received
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        {/* Rate your stay — same card, separated by border */}
                        <div
                            ref={rateSectionRef}
                            id="rate-stay"
                            className="scroll-mt-24 border-t border-border bg-card px-5 py-5 sm:px-8 sm:py-6"
                        >
                            <div className="flex items-center gap-2">
                                <Star className="h-5 w-5 text-amber-500" aria-hidden />
                                <h2 className="text-base font-semibold text-foreground">
                                    Rate your stay
                                </h2>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Share feedback after check-out to help other travelers and the
                                property.
                            </p>

                            {booking.existing_review ? (
                                <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
                                    <p className="text-sm font-semibold text-foreground">
                                        You rated this stay{" "}
                                        <span className="text-amber-600">
                                            {booking.existing_review.rating} / 5
                                        </span>
                                    </p>
                                    {booking.existing_review.comment ? (
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            {booking.existing_review.comment}
                                        </p>
                                    ) : null}
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        {new Date(
                                            booking.existing_review.created_at
                                        ).toLocaleDateString(undefined, { dateStyle: "medium" })}
                                    </p>
                                </div>
                            ) : booking.can_review ? (
                                <form className="mt-4 space-y-4" onSubmit={handleReviewSubmit}>
                                    <div>
                                        <label className="text-sm font-medium text-foreground">
                                            Rating
                                        </label>
                                        <div className="mt-2 flex flex-wrap justify-start gap-1 sm:gap-2">
                                            {[1, 2, 3, 4, 5].map((n) => (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    onClick={() => setReviewRating(n)}
                                                    disabled={reviewSubmitting}
                                                    className={cn(
                                                        "rounded-lg p-1.5 transition hover:bg-amber-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 disabled:opacity-50",
                                                        n <= reviewRating
                                                            ? "text-amber-500"
                                                            : "text-amber-400"
                                                    )}
                                                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                                                >
                                                    <Star
                                                        className={cn(
                                                            "h-8 w-8 sm:h-9 sm:w-9",
                                                            n <= reviewRating
                                                                ? "fill-amber-400 text-amber-500"
                                                                : "fill-transparent text-amber-400"
                                                        )}
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="review-comment"
                                            className="text-sm font-medium text-foreground"
                                        >
                                            Comments (optional)
                                        </label>
                                        <textarea
                                            id="review-comment"
                                            value={reviewComment}
                                            onChange={(e) => setReviewComment(e.target.value)}
                                            rows={4}
                                            maxLength={2000}
                                            placeholder="What stood out about your stay?"
                                            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        />
                                    </div>
                                    <Button type="submit" disabled={reviewSubmitting}>
                                        {reviewSubmitting ? "Submitting…" : "Submit review"}
                                    </Button>
                                </form>
                            ) : (
                                <p className="mt-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                                    {booking.review_block_reason ??
                                        ((booking.status ?? "").toLowerCase() === "pending"
                                            ? "You can rate this stay after your booking is confirmed."
                                            : "You can rate this stay after your check-out date.")}
                                </p>
                            )}
                        </div>
                    </article>

                    {/* Right column (row 1): payment proof only when online pending */}
                    {showPaymentSection ? (
                        <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
                            <h2 className="text-lg font-bold text-foreground">Payment proof</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                For online payments, the hotel verifies your transfer using the
                                receipt you provide.
                            </p>

                            {rejectionNote ? (
                                <div
                                    className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-900/40 dark:bg-amber-950/30"
                                    role="alert"
                                >
                                    <div className="flex gap-3">
                                        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
                                        <div>
                                            <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                                                The hotel needs a new receipt
                                            </p>
                                            <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-100/90">
                                                {rejectionNote}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {showAwaiting ? (
                                <div className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
                                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">
                                            Awaiting hotel verification
                                        </p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Your receipt is on file. The hotel will mark your
                                            payment as received after they review it.
                                        </p>
                                    </div>
                                </div>
                            ) : null}

                            {showUpload ? (
                                <form className="mt-6 space-y-4" onSubmit={handleReceiptSubmit}>
                                    <div>
                                        <label
                                            htmlFor="receipt-reupload"
                                            className="text-sm font-semibold text-foreground"
                                        >
                                            {rejectionNote
                                                ? "Upload a new receipt"
                                                : "Upload payment receipt"}
                                        </label>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Clear photo or screenshot (JPEG, PNG, or WebP). Max size
                                            depends on your connection; keep images under a few MB.
                                        </p>
                                        <div className="mt-3 flex flex-col gap-3">
                                            <input
                                                ref={receiptInputRef}
                                                id="receipt-reupload"
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const f = e.target.files?.[0];
                                                    if (receiptPreviewUrl)
                                                        URL.revokeObjectURL(receiptPreviewUrl);
                                                    setReceiptPreviewUrl(null);
                                                    if (!f) {
                                                        setReceiptFile(null);
                                                        return;
                                                    }
                                                    if (!/^image\//.test(f.type)) {
                                                        toast.error("Please choose an image file.");
                                                        e.target.value = "";
                                                        setReceiptFile(null);
                                                        return;
                                                    }
                                                    setReceiptFile(f);
                                                    setReceiptPreviewUrl(URL.createObjectURL(f));
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full"
                                                onClick={() => receiptInputRef.current?.click()}
                                            >
                                                <Upload className="h-4 w-4" />
                                                Choose image
                                            </Button>
                                            {receiptPreviewUrl && receiptFile ? (
                                                <div className="overflow-hidden rounded-lg border border-border bg-background">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={receiptPreviewUrl}
                                                        alt="Receipt preview"
                                                        className="max-h-48 w-full object-contain"
                                                    />
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                    <Button
                                        type="submit"
                                        disabled={!receiptFile || receiptUploading}
                                        className="w-full"
                                    >
                                        {receiptUploading
                                            ? "Uploading…"
                                            : "Submit for verification"}
                                    </Button>
                                </form>
                            ) : null}
                        </section>
                    ) : null}

                    {/* Below trip + rate card (full width on lg when grid) */}
                    <section
                        className={cn(
                            "w-full min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6",
                            showPaymentSection && "lg:col-span-2"
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <MessageSquare
                                className="h-5 w-5 text-muted-foreground"
                                aria-hidden
                            />
                            <h2 className="text-base font-semibold text-foreground">Messages</h2>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Chat with{" "}
                            <span className="font-medium text-foreground">{hotelName}</span> about
                            this reservation.
                        </p>
                        <div className="mt-4">
                            <BookingMessagesPanel
                                bookingId={booking.id}
                                apiBase={API_BASE}
                                getAuthHeaders={getAuthHeaders}
                                selfRole="guest"
                            />
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
