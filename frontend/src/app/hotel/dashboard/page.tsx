"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart, CalendarDays, Download, Info, ShieldCheck, Star } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Hotel = {
    id: string;
    name: string;
    address: string;
    verification_status: string;
    business_permit_file?: string | null;
    permit_expires_at?: string | null;
};

type Room = {
    id: string;
    name: string;
    room_type: string;
    base_price_night: string;
};

type Booking = {
    id: string;
    guest_name?: string | null;
    room_name?: string | null;
    check_in: string;
    check_out: string;
    status: string;
    total_amount: string;
};

function formatCurrency(amount: number) {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        maximumFractionDigits: 0
    }).format(amount);
}

function formatCompactDate(d: Date) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isSameDay(a: Date, b: Date) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function parseNumberLike(value: string | number | null | undefined): number {
    if (typeof value === "number") return value;
    if (value === null || value === undefined || value === "") return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

/** Revenue only counts stays that have finished and are stored as `completed`. */
function isBookingCompleted(b: Booking): boolean {
    return (b.status ?? "").toLowerCase() === "completed";
}

/** Attribute revenue to the calendar month of check-out (when the stay ended). */
function dateInCalendarMonth(iso: string, ref: Date): boolean {
    const d = new Date(iso);
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function sumCompletedRevenueForMonth(bookings: Booking[], refMonth: Date): number {
    return bookings
        .filter((b) => isBookingCompleted(b) && dateInCalendarMonth(b.check_out, refMonth))
        .reduce((sum, b) => sum + parseNumberLike(b.total_amount), 0);
}

function formatDeltaText(params: { current: number; previous: number; suffix: string }): string {
    const { current, previous, suffix } = params;

    if (!Number.isFinite(current) || !Number.isFinite(previous)) return `— ${suffix}`;

    if (previous === 0) {
        return current === 0 ? `0% ${suffix}` : `No prior data ${suffix}`;
    }

    const delta = ((current - previous) / Math.abs(previous)) * 100;
    const rounded = Math.round(delta);
    const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
    return `${sign}${Math.abs(rounded)}% ${suffix}`;
}

export default function HotelDashboardPage() {
    const [hotel, setHotel] = useState<Hotel | null>(null);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [permitFile, setPermitFile] = useState<File | null>(null);
    const [permitUploading, setPermitUploading] = useState(false);
    const [permitMessage, setPermitMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const [permitFormKey, setPermitFormKey] = useState(0);

    useEffect(() => {
        const token = window.localStorage.getItem("token");
        const supabaseToken = window.localStorage.getItem("supabase_access_token");
        if (!token) return;

        async function load() {
            const headers: HeadersInit = {
                Authorization: `Bearer ${token}`,
                ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
            };

            const hotelRes = await fetch(`${API_BASE}/api/me/hotel`, { headers });
            if (hotelRes.ok) {
                const h = await hotelRes.json();
                setHotel(h);
                if (h.verification_status === "verified") {
                    const [roomsRes, bookingsRes] = await Promise.all([
                        fetch(`${API_BASE}/api/hotel/rooms`, { headers }),
                        fetch(`${API_BASE}/api/hotel/bookings`, { headers })
                    ]);
                    if (roomsRes.ok) setRooms(await roomsRes.json());
                    if (bookingsRes.ok) setBookings(await bookingsRes.json());
                }
            }
            setLoading(false);
        }

        load();
    }, []);

    const isPermitExpired =
        !!hotel?.permit_expires_at && new Date(hotel.permit_expires_at) <= new Date();
    const isVerified = hotel?.verification_status === "verified" && !isPermitExpired;

    const status = hotel?.verification_status ?? "pending";
    const hasSubmittedDocument = !!hotel?.business_permit_file;
    const showVerificationCard =
        status === "pending" || status === "rejected" || (status === "verified" && isPermitExpired);
    const showVerificationForm =
        status === "rejected" ||
        (status === "verified" && isPermitExpired) ||
        (status === "pending" && !hasSubmittedDocument);
    const isPendingSubmitted = status === "pending" && hasSubmittedDocument;

    async function refreshHotel() {
        const token = window.localStorage.getItem("token");
        const supabaseToken = window.localStorage.getItem("supabase_access_token");
        if (!token) return;
        const headers: HeadersInit = {
            Authorization: `Bearer ${token}`,
            ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
        };
        const hotelRes = await fetch(`${API_BASE}/api/me/hotel`, { headers });
        if (hotelRes.ok) {
            setHotel(await hotelRes.json());
        }
    }

    async function handlePermitSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!permitFile) return;
        setPermitMessage(null);
        setPermitUploading(true);
        const token = window.localStorage.getItem("token");
        const supabaseToken = window.localStorage.getItem("supabase_access_token");
        if (!token) {
            setPermitMessage({ type: "error", text: "Not signed in." });
            setPermitUploading(false);
            return;
        }
        try {
            const formData = new FormData();
            formData.set("business_permit", permitFile);
            const res = await fetch(`${API_BASE}/api/hotel/permit`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
                },
                body: formData
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setPermitMessage({ type: "error", text: data.error ?? "Upload failed." });
                setPermitUploading(false);
                return;
            }
            setPermitMessage({ type: "success", text: data.message ?? "Document submitted." });
            setPermitFile(null);
            setPermitFormKey((k) => k + 1);
            await refreshHotel();
        } catch {
            setPermitMessage({ type: "error", text: "Something went wrong." });
        }
        setPermitUploading(false);
    }

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayBookings = bookings.filter((b) => isSameDay(new Date(b.check_in), today)).length;
    const yesterdayBookings = bookings.filter((b) =>
        isSameDay(new Date(b.check_in), yesterday)
    ).length;

    const monthRevenue = sumCompletedRevenueForMonth(bookings, today);

    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthRevenue = sumCompletedRevenueForMonth(bookings, lastMonth);

    const pendingReviews = 0;
    const lastWeekPendingReviews = 0;

    return (
        <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8">
            {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !hotel ? (
                <p className="text-sm text-muted-foreground">
                    No hotel linked or you are not signed in as a hotel.
                </p>
            ) : (
                <>
                    {showVerificationCard && (
                        <section className="rounded-xl border border-border bg-card p-6">
                            <div className="flex items-start gap-4">
                                <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                                    <ShieldCheck className="h-5 w-5 text-foreground" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-base font-semibold text-foreground">
                                        {status === "rejected"
                                            ? "Verification declined"
                                            : status === "verified" && isPermitExpired
                                              ? "Permit expired"
                                              : isPendingSubmitted
                                                ? "Verification in Progress"
                                                : "Verification Required"}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {status === "rejected"
                                            ? "Your verification was declined. Please submit an updated business/barangay permit below."
                                            : status === "verified" && isPermitExpired
                                              ? "Your business permit has expired. Please upload a current permit to remain compliant."
                                              : isPendingSubmitted
                                                ? "Your rooms are hidden from search until our team approves your documents. This usually takes 24–48 hours."
                                                : "Your hotel must be verified by an administrator before you can manage your accommodations and rooms, and before your hotel appears in listings for guests."}
                                    </p>

                                    {isPendingSubmitted ? (
                                        <div className="mt-4 flex flex-wrap gap-3">
                                            <Link
                                                href="/hotel/profile"
                                                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                                            >
                                                View Status
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const el =
                                                        document.getElementById(
                                                            "verification-upload"
                                                        );
                                                    el?.scrollIntoView({
                                                        behavior: "smooth",
                                                        block: "start"
                                                    });
                                                }}
                                                className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                                            >
                                                Upload Documents
                                            </button>
                                        </div>
                                    ) : null}

                                    {showVerificationForm && (
                                        <div
                                            id="verification-upload"
                                            className="mt-6 rounded-xl bg-background p-6"
                                        >
                                            <div className="mx-auto w-full max-w-3xl">
                                                <h3 className="text-sm font-semibold text-foreground">
                                                    Submit legal document (business/barangay permit)
                                                </h3>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    Upload your business permit or barangay permit
                                                    (PDF or image). This document is required for
                                                    verification.
                                                </p>
                                                <form
                                                    onSubmit={handlePermitSubmit}
                                                    className="mt-4 space-y-4"
                                                >
                                                    <div>
                                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                                            File (PDF or image)
                                                        </label>
                                                        <input
                                                            key={permitFormKey}
                                                            type="file"
                                                            accept=".pdf,image/*"
                                                            onChange={(e) => {
                                                                setPermitFile(
                                                                    e.target.files?.[0] ?? null
                                                                );
                                                                setPermitMessage(null);
                                                            }}
                                                            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
                                                        />
                                                    </div>
                                                    {permitMessage && (
                                                        <p
                                                            className={`text-sm ${
                                                                permitMessage.type === "success"
                                                                    ? "text-emerald-600"
                                                                    : "text-destructive"
                                                            }`}
                                                        >
                                                            {permitMessage.text}
                                                        </p>
                                                    )}
                                                    <button
                                                        type="submit"
                                                        disabled={!permitFile || permitUploading}
                                                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                                                    >
                                                        {permitUploading
                                                            ? "Uploading…"
                                                            : "Submit Document"}
                                                    </button>
                                                </form>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    <div
                        className={[
                            "flex flex-col gap-6",
                            !isVerified ? "opacity-50 pointer-events-none select-none" : ""
                        ].join(" ")}
                    >
                        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div className="rounded-xl border border-border bg-card p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Today’s Bookings
                                        </p>
                                        <p className="mt-2 text-3xl font-semibold text-foreground">
                                            {isVerified ? todayBookings : 0}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {isVerified
                                                ? formatDeltaText({
                                                      current: todayBookings,
                                                      previous: yesterdayBookings,
                                                      suffix: "from yesterday"
                                                  })
                                                : "Pending verification"}
                                        </p>
                                    </div>
                                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-border bg-card p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Monthly Revenue
                                        </p>
                                        <p className="mt-2 text-3xl font-semibold text-foreground">
                                            {isVerified
                                                ? formatCurrency(monthRevenue)
                                                : formatCurrency(0)}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {isVerified
                                                ? formatDeltaText({
                                                      current: monthRevenue,
                                                      previous: lastMonthRevenue,
                                                      suffix: "from last month"
                                                  })
                                                : "Pending verification"}
                                        </p>
                                        {isVerified ? (
                                            <button
                                                type="button"
                                                aria-label="Monthly revenue calculation details"
                                                title="Completed stays only, by check-out month (confirmed, paid, past check-out)."
                                                className="mt-2 inline-flex items-center justify-center rounded-md"
                                            >
                                                <Info className="h-4 w-4 text-muted-foreground" />
                                            </button>
                                        ) : null}
                                    </div>
                                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                                        <BarChart className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-border bg-card p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Pending Reviews
                                        </p>
                                        <p className="mt-2 text-3xl font-semibold text-foreground">
                                            {isVerified ? pendingReviews : 0}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {isVerified
                                                ? formatDeltaText({
                                                      current: pendingReviews,
                                                      previous: lastWeekPendingReviews,
                                                      suffix: "this week"
                                                  })
                                                : "Pending verification"}
                                        </p>
                                    </div>
                                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                                        <Star className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="rounded-xl border border-border bg-card">
                            <div className="flex items-center justify-between px-6 py-5">
                                <h2 className="text-lg font-semibold text-foreground">
                                    Recent Bookings
                                </h2>
                                <Link
                                    href="/hotel/bookings"
                                    className="text-sm font-medium text-muted-foreground hover:text-foreground"
                                >
                                    View All
                                </Link>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="border-t border-border bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        <tr>
                                            <th className="px-6 py-3">Guest</th>
                                            <th className="px-6 py-3">Room Type</th>
                                            <th className="px-6 py-3">Check-in</th>
                                            <th className="px-6 py-3">Status</th>
                                            <th className="px-6 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {(isVerified ? bookings.slice(0, 3) : []).map((b) => {
                                            const statusLower = (b.status ?? "").toLowerCase();
                                            const pill =
                                                statusLower === "completed"
                                                    ? "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                                                    : statusLower === "confirmed"
                                                      ? "bg-emerald-100 text-emerald-700"
                                                      : statusLower === "pending"
                                                        ? "bg-amber-100 text-amber-700"
                                                        : "bg-sky-100 text-sky-700";
                                            const statusLabel =
                                                statusLower === "completed"
                                                    ? "Completed"
                                                    : statusLower === "confirmed"
                                                      ? "Confirmed"
                                                      : statusLower === "pending"
                                                        ? "Pending"
                                                        : statusLower
                                                          ? statusLower.charAt(0).toUpperCase() +
                                                            statusLower.slice(1)
                                                          : "Pending";
                                            return (
                                                <tr key={b.id}>
                                                    <td className="px-6 py-4 font-medium text-foreground">
                                                        {b.guest_name ?? "Guest"}
                                                    </td>
                                                    <td className="px-6 py-4 text-muted-foreground">
                                                        {b.room_name ?? "Room"}
                                                    </td>
                                                    <td className="px-6 py-4 text-muted-foreground">
                                                        {formatCompactDate(new Date(b.check_in))}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span
                                                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${pill}`}
                                                        >
                                                            {statusLabel}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <Link
                                                            href={`/hotel/bookings`}
                                                            className="text-sm font-semibold text-foreground hover:underline"
                                                        >
                                                            Details
                                                        </Link>
                                                    </td>
                                                </tr>
                                            );
                                        })}

                                        {!isVerified && (
                                            <tr>
                                                <td
                                                    className="px-6 py-10 text-center text-sm text-muted-foreground"
                                                    colSpan={5}
                                                >
                                                    No data available until hotel is verified.
                                                </td>
                                            </tr>
                                        )}
                                        {isVerified && bookings.length === 0 && (
                                            <tr>
                                                <td
                                                    className="px-6 py-10 text-center text-sm text-muted-foreground"
                                                    colSpan={5}
                                                >
                                                    No bookings yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                </>
            )}
        </main>
    );
}
