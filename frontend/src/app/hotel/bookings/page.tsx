"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CreditCard, Filter, MessageSquare, Search, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { HotelPendingVerificationNotice } from "@/components/HotelPendingVerificationNotice";
import { BookingMessagesPanel } from "@/components/bookings/BookingMessagesPanel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatNumberCompact } from "@/lib/format";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Hotel = { verification_status: string };
type RoomInfo = { name: string };
type GuestInfo = { email: string | null; full_name: string | null };
type Booking = {
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  payment_status: string;
  payment_method?: string | null;
  total_amount: string;
  decline_reason?: string | null;
  hourly_hours?: number[] | null;
  rooms?: RoomInfo;
  guest?: GuestInfo;
  payment_receipt_url?: string | null;
  payment_rejection_note?: string | null;
  hotel_payment_method_id?: string | null;
  online_payment_details?: {
    source: "provider" | "legacy";
    label: string | null;
    account_name: string | null;
    account_number: string | null;
    qr_image_url?: string | null;
  } | null;
};

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  const supabaseToken = localStorage.getItem("supabase_access_token");
  return {
    Authorization: `Bearer ${token ?? ""}`,
    ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {}),
  };
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return "12:00 AM";
  if (hour === 12) return "12:00 PM";
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

function formatDateRange(checkInIso: string, checkOutIso: string) {
  const checkIn = new Date(checkInIso);
  const checkOut = new Date(checkOutIso);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${fmt.format(checkIn)} - ${fmt.format(checkOut)}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getDerivedStatusLabel(b: Booking): { label: string; tone: "warning" | "success" | "neutral" } {
  const status = (b.status ?? "").toLowerCase();
  if (status === "cancelled") return { label: "Cancelled", tone: "neutral" };
  if (status === "pending") return { label: "Awaiting Approval", tone: "warning" };
  if (status === "completed") return { label: "Completed", tone: "neutral" };
  if (status === "confirmed") {
    const now = startOfDay(new Date());
    const co = startOfDay(new Date(b.check_out));
    if (now.getTime() === co.getTime()) return { label: "Checking out", tone: "neutral" };
    if (now.getTime() > co.getTime()) return { label: "Checked Out", tone: "neutral" };
    return { label: "Confirmed", tone: "success" };
  }
  return { label: b.status || "—", tone: "neutral" };
}

function initials(nameOrEmail: string) {
  const parts = nameOrEmail.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? parts[1]?.[0] : (parts[0]?.[1] ?? "");
  return (first + second).toUpperCase();
}

function bookingMatchesSearch(b: Booking, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const st = (b.status ?? "").toLowerCase();
  const ps = (b.payment_status ?? "").toLowerCase();
  const guestName = (b.guest?.full_name ?? "").toLowerCase();
  const email = (b.guest?.email ?? "").toLowerCase();
  const room = (b.rooms?.name ?? "").toLowerCase();
  const derived = getDerivedStatusLabel(b).label.toLowerCase();
  const haystack = [
    guestName,
    email,
    room,
    b.id.toLowerCase(),
    String(b.total_amount),
    formatDateRange(b.check_in, b.check_out).toLowerCase(),
    b.check_in.slice(0, 10),
    b.check_out.slice(0, 10),
    st,
    ps,
    derived,
  ].join(" ");
  return tokens.every((t) => haystack.includes(t));
}

export default function HotelBookingsPage() {
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Booking | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  /** Reason entered in the decline booking modal. */
  const [declineReason, setDeclineReason] = useState("");
  /** Reject uploaded receipt so guest can upload new proof. */
  const [showRejectReceiptForm, setShowRejectReceiptForm] = useState(false);
  const [rejectReceiptNote, setRejectReceiptNote] = useState("");
  /** Bottom panel: payment verification vs guest messaging. */
  const [bottomPanel, setBottomPanel] = useState<null | "payment" | "messages">(null);

  type BookingConfirm =
    | null
    | { kind: "approve_booking"; id: string }
    | { kind: "decline_booking"; id: string }
    | { kind: "approve_payment" }
    | { kind: "reject_open" }
    | { kind: "reject_submit" };
  const [bookingConfirm, setBookingConfirm] = useState<BookingConfirm>(null);
  const [bookingsPage, setBookingsPage] = useState(1);
  const [bookingSearch, setBookingSearch] = useState("");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "confirmed" | "cancelled">("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "paid">("all");
  const filterPanelRef = useRef<HTMLDivElement>(null);

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const st = (b.status ?? "").toLowerCase();
      if (statusFilter !== "all" && st !== statusFilter) return false;
      const ps = (b.payment_status ?? "").toLowerCase();
      if (paymentFilter !== "all") {
        if (paymentFilter === "pending" && ps !== "pending") return false;
        if (paymentFilter === "paid" && ps !== "paid") return false;
      }
      return bookingMatchesSearch(b, bookingSearch);
    });
  }, [bookings, statusFilter, paymentFilter, bookingSearch]);

  const BOOKINGS_PER_PAGE = 10;
  const bookingsTotalPages = Math.max(1, Math.ceil(filteredBookings.length / BOOKINGS_PER_PAGE));
  const bookingsSafePage = Math.min(bookingsPage, bookingsTotalPages);
  const bookingsStartIdx = (bookingsSafePage - 1) * BOOKINGS_PER_PAGE;
  const bookingsEndIdx = Math.min(bookingsStartIdx + BOOKINGS_PER_PAGE, filteredBookings.length);
  const pagedBookings = filteredBookings.slice(bookingsStartIdx, bookingsEndIdx);

  const filtersActive = statusFilter !== "all" || paymentFilter !== "all";

  useEffect(() => {
    setBookingsPage(1);
  }, [bookingSearch, statusFilter, paymentFilter]);

  useEffect(() => {
    if (bookingsPage !== bookingsSafePage) setBookingsPage(bookingsSafePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBookings.length, bookingsTotalPages]);

  useEffect(() => {
    if (!filterPanelOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setFilterPanelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [filterPanelOpen]);

  const loadBookings = useCallback(async () => {
    const headers = getAuthHeaders();
    const hotelRes = await fetch(`${API_BASE}/api/me/hotel`, { headers });
    if (!hotelRes.ok) return;
    const h = await hotelRes.json();
    setHotel(h);
    if (h.verification_status === "verified") {
      const bookingsRes = await fetch(`${API_BASE}/api/hotel/bookings`, { headers });
      if (bookingsRes.ok) setBookings(await bookingsRes.json());
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    async function load() {
      await loadBookings();
      setLoading(false);
    }
    load();
  }, [loadBookings]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setBottomPanel(null);
      setShowRejectReceiptForm(false);
      setDeclineReason("");
      setRejectReceiptNote("");
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    fetch(`${API_BASE}/api/hotel/bookings/${selectedId}`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function runApproveBooking(bookingId: string): Promise<void> {
    setActionLoading("confirm");
    try {
      const res = await fetch(`${API_BASE}/api/hotel/bookings/${bookingId}/confirm`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to confirm");
        return;
      }
      setDetail((prev) =>
        prev && selectedId === bookingId ? ({ ...prev, ...(data as object) } as Booking) : prev
      );
      await loadBookings();
      toast.success("Booking confirmed.");
    } finally {
      setActionLoading(null);
    }
  }

  async function executeDeclineById(bookingId: string, reason: string): Promise<boolean> {
    setActionLoading("decline");
    try {
      const res = await fetch(`${API_BASE}/api/hotel/bookings/${bookingId}/decline`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to decline");
        return false;
      }
      setDetail((prev) =>
        prev && selectedId === bookingId ? ({ ...prev, ...(data as object) } as Booking) : prev
      );
      await loadBookings();
      toast.success("Booking declined.");
      return true;
    } finally {
      setActionLoading(null);
    }
  }

  const handleMarkPaid = async (): Promise<void> => {
    if (!selectedId || !detail) return;
    setActionLoading("mark-paid");
    try {
      const res = await fetch(`${API_BASE}/api/hotel/bookings/${selectedId}/mark-paid`, {
        method: "PATCH",
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to update payment");
        return;
      }
      setDetail({ ...detail, ...data });
      await loadBookings();
      toast.success("Marked as paid.");
    } finally {
      setActionLoading(null);
    }
  };

  const executeRejectReceipt = async (): Promise<void> => {
    if (!selectedId || !detail) return;
    const note = rejectReceiptNote.trim();
    if (!note) {
      toast.error("Please add a short note for the guest (what to fix on the new proof).");
      return;
    }
    setActionLoading("reject-receipt");
    try {
      const res = await fetch(`${API_BASE}/api/hotel/bookings/${selectedId}/reject-receipt`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to reject receipt");
        return;
      }
      const detailRes = await fetch(`${API_BASE}/api/hotel/bookings/${selectedId}`, {
        headers: getAuthHeaders(),
      });
      if (detailRes.ok) {
        setDetail(await detailRes.json());
      } else {
        setDetail({ ...detail, ...data, payment_receipt_url: null } as Booking);
      }
      setShowRejectReceiptForm(false);
      setRejectReceiptNote("");
      await loadBookings();
      toast.success("Receipt removed. The guest can upload a new proof.");
    } finally {
      setActionLoading(null);
    }
  };

  const isConfirmed = detail?.status === "confirmed";
  const isOnlinePayment = (detail?.payment_method ?? "").toLowerCase() === "online";
  /** Online bookings need an uploaded receipt before payment can be marked received. */
  const hasPaymentReceipt = Boolean(detail?.payment_receipt_url);
  const canMarkPaid =
    isConfirmed &&
    detail?.payment_status === "pending" &&
    (!isOnlinePayment || hasPaymentReceipt);
  const canRejectReceipt =
    isConfirmed && detail?.payment_status === "pending" && isOnlinePayment && hasPaymentReceipt;

  const confirmDialogProps =
    bookingConfirm === null
      ? null
      : bookingConfirm.kind === "approve_booking"
        ? {
            title: "Approve this booking?",
            description:
              "The guest will be notified that their reservation is confirmed. You can still verify payment afterward if needed.",
            confirmLabel: "Approve booking",
            variant: "default" as const,
          }
        : bookingConfirm.kind === "decline_booking"
          ? {
              title: "Decline booking",
              description:
                "The guest will be notified that this reservation was not accepted. A reason is required.",
              confirmLabel: "Decline booking",
              variant: "destructive" as const,
            }
          : bookingConfirm.kind === "approve_payment"
            ? {
                title: "Approve this payment?",
                description:
                  "Confirm that you received the funds and the proof of transfer is valid. This will mark the booking as paid.",
                confirmLabel: "Approve payment",
                variant: "default" as const,
              }
            : bookingConfirm.kind === "reject_open"
              ? {
                  title: "Reject payment proof?",
                  description:
                    "You will add a note for the guest. Their current receipt will be removed so they can upload a new one.",
                  confirmLabel: "Continue",
                  variant: "destructive" as const,
                }
              : {
                    title: "Reject receipt and notify guest?",
                    description:
                      "The uploaded receipt will be removed and the guest can submit new payment proof.",
                    confirmLabel: "Reject receipt",
                    variant: "destructive" as const,
                  };

  async function handleBookingConfirmAction() {
    if (!bookingConfirm) return;
    const k = bookingConfirm;
    if (k.kind === "decline_booking") {
      const reason = declineReason.trim();
      if (!reason) {
        toast.error("Please provide a reason for declining.");
        return;
      }
      const ok = await executeDeclineById(k.id, reason);
      if (ok) {
        setBookingConfirm(null);
        setDeclineReason("");
      }
      return;
    }
    if (k.kind === "reject_open") {
      setBookingConfirm(null);
      setShowRejectReceiptForm(true);
      setRejectReceiptNote("");
      return;
    }
    try {
      switch (k.kind) {
        case "approve_booking":
          await runApproveBooking(k.id);
          break;
        case "approve_payment":
          await handleMarkPaid();
          break;
        case "reject_submit":
          await executeRejectReceipt();
          break;
        default:
          break;
      }
    } finally {
      setBookingConfirm(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Recent Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and verify guest reservations and payments.
          </p>
        </div>
        <div className="flex w-full max-w-2xl flex-col gap-2 sm:ml-auto sm:w-auto sm:items-end">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
                placeholder="Search guest, room, dates, amount…"
                className="h-10 w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label="Search bookings"
              />
            </div>
            <div className="relative shrink-0" ref={filterPanelRef}>
              <button
                type="button"
                onClick={() => setFilterPanelOpen((o) => !o)}
                aria-expanded={filterPanelOpen}
                aria-haspopup="dialog"
                className={cn(
                  "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted sm:w-auto",
                  (filterPanelOpen || filtersActive) && "border-primary/50 bg-primary/5"
                )}
              >
                <Filter className="h-4 w-4 text-muted-foreground" />
                Filter
                {filtersActive ? (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    On
                  </span>
                ) : null}
              </button>
              {filterPanelOpen ? (
                <div
                  className="absolute right-0 top-full z-30 mt-2 w-[min(100vw-2rem,20rem)] rounded-xl border border-border bg-card p-4 shadow-lg"
                  role="dialog"
                  aria-label="Filter bookings"
                >
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="booking-filter-status" className="text-xs font-semibold text-muted-foreground">
                        Booking status
                      </label>
                      <select
                        id="booking-filter-status"
                        value={statusFilter}
                        onChange={(e) =>
                          setStatusFilter(e.target.value as "all" | "pending" | "confirmed" | "cancelled")
                        }
                        className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="all">All statuses</option>
                        <option value="pending">Awaiting approval</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="booking-filter-payment" className="text-xs font-semibold text-muted-foreground">
                        Payment status
                      </label>
                      <select
                        id="booking-filter-payment"
                        value={paymentFilter}
                        onChange={(e) => setPaymentFilter(e.target.value as "all" | "pending" | "paid")}
                        className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="all">All payments</option>
                        <option value="pending">Payment pending</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Filters apply to the list below. Search matches guest name, email, room, dates, amount, and
                      booking id.
                    </p>
                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setStatusFilter("all");
                          setPaymentFilter("all");
                        }}
                        disabled={!filtersActive}
                      >
                        Clear filters
                      </Button>
                      <Button type="button" size="sm" onClick={() => setFilterPanelOpen(false)}>
                        Done
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : hotel?.verification_status !== "verified" ? (
        <div className="mt-6">
          <HotelPendingVerificationNotice hotel={hotel} />
          <p className="mt-4 text-sm text-muted-foreground">
            Bookings will appear here once your hotel is verified.
          </p>
        </div>
      ) : bookings.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
          No bookings yet.
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-6 py-3">Guest Name</th>
                  <th className="px-6 py-3">Room Type</th>
                  <th className="px-6 py-3">Stay Dates</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground">
                      No bookings match your search or filters. Try clearing the search box or filters.
                    </td>
                  </tr>
                ) : null}
                {filteredBookings.length > 0 &&
                  pagedBookings.map((b) => {
                  const guestLabel = b.guest?.full_name || b.guest?.email || "Guest";
                  const guestMeta = b.guest?.email || `#${b.id.slice(0, 8)}`;
                  const { label, tone } = getDerivedStatusLabel(b);
                  const pill =
                    tone === "warning"
                      ? "bg-amber-100 text-amber-800"
                      : tone === "success"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-700";

                  return (
                    <tr key={b.id} className="hover:bg-muted/20">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                            {initials(String(guestLabel))}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{guestLabel}</p>
                            <p className="text-xs text-muted-foreground">{guestMeta}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{b.rooms?.name ?? "—"}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <p>{formatDateRange(b.check_in, b.check_out)}</p>
                        <p className="text-xs text-muted-foreground">
                          {Math.max(
                            1,
                            Math.round(
                              (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) /
                                (1000 * 60 * 60 * 24)
                            )
                          )}{" "}
                          Night(s)
                        </p>
                      </td>
                      <td className="px-6 py-4 font-medium text-foreground">
                        ₱{formatNumberCompact(b.total_amount)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${pill}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {b.status === "pending" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setBookingConfirm({ kind: "approve_booking", id: b.id })}
                                disabled={!!actionLoading}
                                title="Approve booking"
                                aria-label="Approve booking"
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                              >
                                <Check className="h-4 w-4" strokeWidth={2.5} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeclineReason("");
                                  setBookingConfirm({ kind: "decline_booking", id: b.id });
                                }}
                                disabled={!!actionLoading}
                                title="Decline booking"
                                aria-label="Decline booking"
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-destructive/50 bg-card text-destructive transition hover:bg-destructive/5 disabled:opacity-60"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </>
                          ) : b.status === "confirmed" ? (
                            <span
                              className="inline-flex h-9 items-center rounded-md bg-muted px-2 text-xs font-semibold text-muted-foreground"
                              title="Approved"
                            >
                              Approved
                            </span>
                          ) : b.status === "completed" ? (
                            <span
                              className="inline-flex h-9 items-center rounded-md bg-slate-100 px-2 text-xs font-semibold text-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                              title="Stay completed"
                            >
                              Completed
                            </span>
                          ) : (
                            <span className="inline-flex h-9 items-center rounded-md bg-muted px-2 text-xs font-semibold text-muted-foreground">
                              —
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(b.id);
                              setBottomPanel("payment");
                              setShowRejectReceiptForm(false);
                            }}
                            title="View payment"
                            aria-label="View payment"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-muted"
                          >
                            <CreditCard className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(b.id);
                              setBottomPanel("messages");
                              setShowRejectReceiptForm(false);
                            }}
                            title="Message guest"
                            aria-label="Message guest"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 px-6 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {filteredBookings.length === 0
                ? "No results"
                : `Showing ${bookingsStartIdx + 1}–${bookingsEndIdx} of ${filteredBookings.length} results`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBookingsPage((p) => Math.max(1, p - 1))}
                disabled={bookingsSafePage === 1 || filteredBookings.length === 0}
              >
                Previous
              </Button>
              {filteredBookings.length > 0 &&
                Array.from({ length: bookingsTotalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={p === bookingsSafePage ? "default" : "outline"}
                    onClick={() => setBookingsPage(p)}
                    className="min-w-9 px-2"
                  >
                    {p}
                  </Button>
                ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBookingsPage((p) => Math.min(bookingsTotalPages, p + 1))}
                disabled={bookingsSafePage === bookingsTotalPages || filteredBookings.length === 0}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {bottomPanel === "messages" && selectedId && (
        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Messages</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Chat with{" "}
                <span className="font-medium text-foreground">
                  {detail?.guest?.full_name ?? detail?.guest?.email ?? "the guest"}
                </span>{" "}
                about this booking. They will see replies on their trip page.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBottomPanel("payment")}
              className="shrink-0 text-sm font-medium text-primary hover:underline"
            >
              ← Payment verification
            </button>
          </div>
          <BookingMessagesPanel
            bookingId={selectedId}
            apiBase={API_BASE}
            getAuthHeaders={getAuthHeaders}
            selfRole="hotel"
          />
        </section>
      )}

      {bottomPanel === "payment" && selectedId && (
        <section className="mt-10">
          <h2 className="text-base font-semibold text-foreground">Guest Payment Receipt Verification</h2>

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              {detailLoading ? (
                <p className="text-sm text-muted-foreground">Loading receipt…</p>
              ) : !detail ? (
                <p className="text-sm text-muted-foreground">Select a booking to view payment.</p>
              ) : (() => {
                  const cash = (detail.payment_method ?? "").toLowerCase() === "cash";
                  const noReceipt = !detail.payment_receipt_url;
                  if (cash || noReceipt) {
                    return (
                      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6">
                        <p className="text-center text-sm font-medium text-muted-foreground">
                          No Receipt Available
                        </p>
                      </div>
                    );
                  }
                  return (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          {(detail.guest?.full_name ?? detail.guest?.email ?? "Guest") + "_Receipt.jpg"}
                        </p>
                        <a
                          href={detail.payment_receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Download Original
                        </a>
                      </div>
                      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={detail.payment_receipt_url}
                          alt="Payment receipt submitted by guest"
                          className="h-[420px] w-full object-contain bg-white"
                        />
                      </div>
                    </>
                  );
                })()}
            </div>

            <div className="space-y-4">
              {showRejectReceiptForm && canRejectReceipt ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-foreground">Reject payment proof</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The current receipt will be removed and the guest can upload a new image. Explain
                    what was wrong or what you need.
                  </p>
                  <textarea
                    value={rejectReceiptNote}
                    onChange={(e) => setRejectReceiptNote(e.target.value)}
                    placeholder="e.g. Amount or reference not visible — please send a clearer screenshot."
                    rows={4}
                    className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!rejectReceiptNote.trim()) {
                          toast.error(
                            "Please add a short note for the guest (what to fix on the new proof)."
                          );
                          return;
                        }
                        setBookingConfirm({ kind: "reject_submit" });
                      }}
                      disabled={!!actionLoading}
                      className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {actionLoading === "reject-receipt" ? "Submitting…" : "Reject & request new proof"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowRejectReceiptForm(false);
                        setRejectReceiptNote("");
                      }}
                      disabled={!!actionLoading}
                      className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
                        ✓
                      </span>
                      <h3 className="text-sm font-semibold text-foreground">Verification Checklist</h3>
                    </div>
                    <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <span className="text-emerald-600">●</span> Guest name matches{" "}
                        <span className="font-medium text-foreground">
                          “{detail?.guest?.full_name ?? "—"}”
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-emerald-600">●</span> Total amount matches{" "}
                        <span className="font-medium text-foreground">
                          ₱{detail ? formatNumberCompact(detail.total_amount) : "—"}
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-emerald-600">●</span> Date of transaction is valid
                      </li>
                      <li className="flex flex-col items-start gap-2 sm:flex-row sm:items-start">
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-emerald-600">●</span>
                          <span>Payment method:</span>
                        </span>
                        <span className="font-medium text-foreground sm:pl-0">
                          {(detail?.payment_method ?? "").toLowerCase() === "online"
                            ? "Online payment"
                            : (detail?.payment_method ?? "").toLowerCase() === "cash"
                              ? "Cash"
                              : detail?.payment_method
                                ? String(detail.payment_method)
                                : "—"}
                        </span>
                      </li>
                      {(detail?.payment_method ?? "").toLowerCase() === "online" && (
                        <li className="ml-6 list-none rounded-lg border border-border bg-muted/40 p-3 text-xs">
                          <p className="font-semibold text-foreground">Guest’s online payment details</p>
                          {detail.online_payment_details ? (
                            <dl className="mt-2 space-y-1.5 text-muted-foreground">
                              {detail.online_payment_details.source === "provider" && (
                                <p className="mb-2 text-[11px] text-foreground/80">
                                  The guest chose this provider when completing the booking.
                                </p>
                              )}
                              {detail.online_payment_details.label && (
                                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                                  <dt className="shrink-0 font-medium text-foreground">Provider</dt>
                                  <dd className="sm:text-right sm:font-normal">
                                    {detail.online_payment_details.label}
                                  </dd>
                                </div>
                              )}
                              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                                <dt className="shrink-0 font-medium text-foreground">Account name</dt>
                                <dd className="break-all sm:text-right">
                                  {detail.online_payment_details.account_name ?? "—"}
                                </dd>
                              </div>
                              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                                <dt className="shrink-0 font-medium text-foreground">Account number</dt>
                                <dd className="break-all sm:text-right">
                                  {detail.online_payment_details.account_number ?? "—"}
                                </dd>
                              </div>
                              {detail.online_payment_details.qr_image_url && (
                                <div className="mt-3 border-t border-border pt-3">
                                  <dt className="mb-2 font-medium text-foreground">QR code (guest view)</dt>
                                  <dd>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={detail.online_payment_details.qr_image_url}
                                      alt="Payment QR for selected provider"
                                      className="mx-auto aspect-square max-w-[160px] rounded-lg border border-border bg-white object-contain p-1"
                                    />
                                  </dd>
                                </div>
                              )}
                              {detail.online_payment_details.source === "legacy" && (
                                <p className="mt-2 text-[11px] italic text-muted-foreground">
                                  Legacy hotel default account (booking has no saved provider choice).
                                </p>
                              )}
                            </dl>
                          ) : (
                            <p className="mt-2 text-muted-foreground">
                              No provider details on file for this booking.
                            </p>
                          )}
                        </li>
                      )}
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => setBookingConfirm({ kind: "approve_payment" })}
                    disabled={!canMarkPaid || !!actionLoading}
                    title={
                      isOnlinePayment && !hasPaymentReceipt && isConfirmed && detail?.payment_status === "pending"
                        ? "Guest must upload a payment receipt before you can approve."
                        : undefined
                    }
                    className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                  >
                    {actionLoading === "mark-paid" ? "Approving…" : "Approve Payment"}
                  </button>
                  {isOnlinePayment &&
                    isConfirmed &&
                    detail?.payment_status === "pending" &&
                    !hasPaymentReceipt && (
                      <p className="text-center text-xs text-muted-foreground">
                        Approve Payment is available after the guest uploads a payment receipt.
                      </p>
                    )}

                  {canRejectReceipt && (
                    <button
                      type="button"
                      onClick={() => setBookingConfirm({ kind: "reject_open" })}
                      className="w-full py-2 text-sm font-semibold text-destructive hover:underline"
                    >
                      Reject &amp; Request New Proof
                    </button>
                  )}

                  <p className="text-center text-xs text-muted-foreground">
                    By approving this receipt, you confirm that the funds have been received in your
                    account and a valid proof of transfer has been provided.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {confirmDialogProps && (
        <ConfirmDialog
          open={bookingConfirm !== null}
          onClose={() => {
            if (actionLoading) return;
            setBookingConfirm(null);
            setDeclineReason("");
          }}
          title={confirmDialogProps.title}
          description={confirmDialogProps.description}
          confirmLabel={confirmDialogProps.confirmLabel}
          cancelLabel="Cancel"
          variant={confirmDialogProps.variant}
          confirmLoading={
            !!actionLoading &&
            ((bookingConfirm?.kind === "approve_booking" && actionLoading === "confirm") ||
              (bookingConfirm?.kind === "approve_payment" && actionLoading === "mark-paid") ||
              (bookingConfirm?.kind === "decline_booking" && actionLoading === "decline") ||
              (bookingConfirm?.kind === "reject_submit" && actionLoading === "reject-receipt"))
          }
          onConfirm={() => void handleBookingConfirmAction()}
          children={
            bookingConfirm?.kind === "decline_booking" ? (
              <div className="space-y-2">
                <label htmlFor="decline-booking-reason" className="text-sm font-medium text-foreground">
                  Reason for declining <span className="text-destructive">*</span>
                </label>
                <textarea
                  id="decline-booking-reason"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Reason for declining…"
                  rows={4}
                  disabled={!!actionLoading}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                />
              </div>
            ) : undefined
          }
        />
      )}
    </main>
  );
}
