"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import Image from "next/image";
import { formatCurrency } from "@/lib/format";
import { Input } from "../ui/input";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const SERVICE_FEE_RATE = 0.05; // 5% for display
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type HotelPaymentMethodOption = {
    id: string;
    label: string;
    qr_image_url?: string;
    account_name: string | null;
    account_number: string | null;
};

type HotelPaymentInfo = {
    id: string;
    name: string;
    address: string;
    payment_qr_image_url?: string | null;
    payment_account_name?: string | null;
    payment_account_number?: string | null;
    payment_methods?: HotelPaymentMethodOption[];
    currency?: string | null;
};

type RoomBookingSidebarProps = {
    roomId: string;
    roomName: string;
    basePriceNight: string;
    hotel: HotelPaymentInfo;
    offerHourly?: boolean;
    hourlyRate?: string | null;
    rating?: number | null;
    reviewCount?: number;
    maxGuests: number;
};

export function RoomBookingSidebar({
    roomId,
    roomName,
    basePriceNight,
    hotel,
    offerHourly,
    hourlyRate,
    rating,
    reviewCount = 0,
    maxGuests
}: RoomBookingSidebarProps) {
    const router = useRouter();
    const [showPayment, setShowPayment] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [checkIn, setCheckIn] = useState("");
    const [checkOut, setCheckOut] = useState("");
    const maxGuestsSafe = Number.isFinite(maxGuests) && maxGuests >= 1 ? Math.floor(maxGuests) : 1;
    const [guests, setGuests] = useState<number>(() => Math.min(1, maxGuestsSafe));
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

    useEffect(() => {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        setIsLoggedIn(Boolean(token));
    }, []);

    const paymentMethodIdsKey = useMemo(
        () => (hotel.payment_methods ?? []).map((m) => m.id).join(","),
        [hotel.payment_methods]
    );

    useEffect(() => {
        const methods = hotel.payment_methods ?? [];
        if (methods.length === 0) {
            setSelectedProviderId(null);
            return;
        }
        setSelectedProviderId((prev) => {
            if (prev && methods.some((m) => m.id === prev)) return prev;
            return methods[0]?.id ?? null;
        });
    }, [hotel.id, paymentMethodIdsKey]); // reads hotel.payment_methods; key tracks id list changes

    useEffect(() => {
        return () => {
            if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
        };
    }, [receiptPreviewUrl]);

    const nights = useMemo(() => {
        if (!checkIn || !checkOut) return 0;
        const a = new Date(checkIn);
        const b = new Date(checkOut);
        const diff = (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
        return Number.isFinite(diff) && diff > 0 ? Math.floor(diff) : 0;
    }, [checkIn, checkOut]);

    const pricePerNight = Number(basePriceNight) || 0;
    const subtotal = nights * pricePerNight;
    const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE);
    const total = subtotal + serviceFee;

    const methods = hotel.payment_methods ?? [];
    const hasMultipleMethods = methods.length > 1;
    const hasLegacySingle =
        !!hotel.payment_qr_image_url ||
        !!hotel.payment_account_name ||
        !!hotel.payment_account_number;
    const hasOnlinePayment = methods.length > 0 || hasLegacySingle;
    const selectedProvider =
        methods.length > 0 && selectedProviderId
            ? (methods.find((m) => m.id === selectedProviderId) ?? methods[0])
            : null;
    const legacyOrFirstProvider = selectedProvider ?? (methods.length > 0 ? methods[0] : null);
    const displayQrUrl = legacyOrFirstProvider?.qr_image_url ?? hotel.payment_qr_image_url ?? null;
    const displayAccountName =
        legacyOrFirstProvider?.account_name ?? hotel.payment_account_name ?? null;
    const displayAccountNumber =
        legacyOrFirstProvider?.account_number ?? hotel.payment_account_number ?? null;

    const reviewLabel = reviewCount === 1 ? "1 review" : `${reviewCount.toLocaleString()} reviews`;
    const ratingStr = rating != null ? Number(rating).toFixed(1) : null;

    const todayStr = useMemo(() => {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }, []);

    const addDaysToDateStr = (dateStr: string, days: number) => {
        const [y, m, d] = dateStr.split("-").map((x) => Number(x));
        if (!y || !m || !d) return dateStr;
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() + days);
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, "0");
        const dd = String(dt.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    };

    const minCheckOut = checkIn ? addDaysToDateStr(checkIn, 1) : addDaysToDateStr(todayStr, 1);

    async function handleConfirmBooking() {
        if (!isLoggedIn) {
            router.push("/login");
            return;
        }
        if (!checkIn || !checkOut || nights <= 0) {
            toast.error("Please select valid check-in and check-out dates.");
            return;
        }

        if (paymentMethod === "online") {
            if (!hasOnlinePayment) {
                toast.error("Online payment is not configured for this hotel.");
                return;
            }
            if (!receiptFile) {
                toast.error("Please upload your payment receipt.");
                return;
            }
            if (!/^image\//.test(receiptFile.type)) {
                toast.error("Receipt must be an image.");
                return;
            }
        }

        try {
            const token = localStorage.getItem("token");
            const supabaseToken = localStorage.getItem("supabase_access_token");
            if (!token) {
                toast.error("Please log in.");
                return;
            }

            const fd = new FormData();
            fd.append("room_id", roomId);
            fd.append("payment_method", paymentMethod);
            fd.append("check_in", checkIn);
            fd.append("check_out", checkOut);
            fd.append("booking_type", "nightly");
            if (paymentMethod === "online") {
                const providerId = legacyOrFirstProvider?.id;
                if (providerId) fd.append("hotel_payment_method_id", providerId);
                if (receiptFile) fd.append("receipt", receiptFile);
            }

            const res = await fetch(`${API_BASE}/api/bookings`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
                },
                body: fd
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "Booking failed.");
                return;
            }
            const bookingId = typeof data?.id === "string" ? data.id : "";
            const successUrl = bookingId
                ? `/bookings/success?bookingId=${encodeURIComponent(bookingId)}`
                : "/bookings/success";
            setShowPayment(false);
            setReceiptFile(null);
            if (receiptPreviewUrl) {
                URL.revokeObjectURL(receiptPreviewUrl);
                setReceiptPreviewUrl(null);
            }
            router.push(successUrl);
        } catch {
            toast.error("Something went wrong.");
        }
    }

    return (
        <>
            <aside className="shrink-0 lg:w-[380px]">
                <div className="sticky top-6 border border-border bg-card p-5 py-8 shadow-sm">
                    {/* Price & rating row */}
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-3xl font-bold text-foreground">
                            {formatCurrency(basePriceNight, hotel.currency)}
                            <span className="ml-1 text-base font-normal text-muted-foreground">
                                / night
                            </span>
                        </p>
                        {reviewCount > 0 && ratingStr != null && (
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600">
                                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                                {ratingStr}{" "}
                                <span className="text-muted-foreground">({reviewLabel})</span>
                            </span>
                        )}
                    </div>

                    {offerHourly && hourlyRate != null && (
                        <p className="mt-1 text-sm text-muted-foreground">
                            Hourly: {formatCurrency(hourlyRate, hotel.currency)}/hr
                        </p>
                    )}

                    {/* Check-in / Check-out */}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                        <div>
                            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Check-in
                            </label>
                            <Input
                                type="date"
                                value={checkIn}
                                min={todayStr}
                                onChange={(e) => {
                                    const nextIn = e.target.value;
                                    const clampedIn =
                                        nextIn && nextIn < todayStr ? todayStr : nextIn;
                                    setCheckIn(clampedIn);
                                    const nextMinOut = addDaysToDateStr(clampedIn, 1);
                                    if (checkOut && checkOut < nextMinOut) {
                                        setCheckOut(nextMinOut);
                                    }
                                }}
                                className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Check-out
                            </label>
                            <Input
                                type="date"
                                value={checkOut}
                                min={minCheckOut}
                                onChange={(e) => {
                                    const nextOut = e.target.value;
                                    const clampedOut =
                                        nextOut && nextOut < minCheckOut ? minCheckOut : nextOut;
                                    setCheckOut(clampedOut);
                                }}
                                className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                    </div>

                    {/* Guests */}
                    <div className="mt-4">
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Guests
                        </label>
                        <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={maxGuestsSafe}
                            step={1}
                            value={guests}
                            onChange={(e) => {
                                const v = Number(e.target.value);
                                if (!Number.isFinite(v)) {
                                    setGuests(1);
                                    return;
                                }
                                const next = Math.floor(v);
                                const clamped = Math.min(Math.max(next, 1), maxGuestsSafe);
                                setGuests(clamped);
                            }}
                            className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground"
                        />
                    </div>

                    {!showPayment && (
                        <>
                            {/* Book Now */}
                            <button
                                type="button"
                                onClick={() => {
                                    if (isLoggedIn) {
                                        if (!checkIn || !checkOut || nights <= 0) {
                                            toast.error(
                                                "Please select valid check-in and check-out dates."
                                            );
                                            return;
                                        }

                                        setShowPayment(true);
                                    } else {
                                        router.push("/login");
                                    }
                                }}
                                className="mt-4 w-full rounded-lg bg-foreground py-3 text-sm font-semibold text-white transition hover:opacity-90"
                            >
                                {isLoggedIn ? "Book Now" : "Login to book"}
                            </button>
                            <p className="mt-2 text-center text-xs text-muted-foreground">
                                You won&apos;t be charged yet
                            </p>
                        </>
                    )}

                    {/* Price breakdown */}
                    {nights > 0 && (
                        <div className="mt-5 space-y-2 border-t border-border pt-4">
                            {nights > 0 && (
                                <>
                                    <div className="flex justify-between text-sm text-foreground">
                                        <span>
                                            {formatCurrency(basePriceNight, hotel.currency)} ×{" "}
                                            {nights} night
                                            {nights !== 1 ? "s" : ""}
                                        </span>
                                        <span>{formatCurrency(subtotal, hotel.currency)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-foreground">
                                        <span>Service fee</span>
                                        <span>{formatCurrency(serviceFee, hotel.currency)}</span>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
                                <span>Total</span>
                                <span>
                                    {nights > 0
                                        ? formatCurrency(total, hotel.currency)
                                        : formatCurrency(0, hotel.currency)}
                                </span>
                            </div>
                        </div>
                    )}

                    {showPayment && nights > 0 && (
                        <div className="mt-4 space-y-3 border-t border-border pt-4">
                            <div>
                                <p className="text-sm font-semibold text-foreground">
                                    Payment method
                                </p>
                                <div className="mt-2 flex items-center gap-4">
                                    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                                        <input
                                            type="radio"
                                            name="payment_method"
                                            checked={paymentMethod === "cash"}
                                            onChange={() => setPaymentMethod("cash")}
                                        />
                                        Cash
                                    </label>
                                    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                                        <input
                                            type="radio"
                                            name="payment_method"
                                            checked={paymentMethod === "online"}
                                            onChange={() => setPaymentMethod("online")}
                                            disabled={!hasOnlinePayment}
                                        />
                                        Online payment (scan QR)
                                    </label>
                                </div>
                            </div>

                            {paymentMethod === "online" && hasOnlinePayment && (
                                <div>
                                    {hasMultipleMethods && (
                                        <div className="mb-3">
                                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                                                Choose payment provider
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {methods.map((m) => (
                                                    <label
                                                        key={m.id}
                                                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary"
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="payment_provider"
                                                            checked={
                                                                (selectedProviderId ??
                                                                    methods[0]?.id) === m.id
                                                            }
                                                            onChange={() =>
                                                                setSelectedProviderId(m.id)
                                                            }
                                                            className="text-primary"
                                                        />
                                                        <span>{m.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {displayQrUrl && (
                                        <div className="mb-3 flex flex-col items-center">
                                            <div className="relative aspect-square w-[200px] overflow-hidden rounded-lg border border-border bg-background">
                                                <Image
                                                    src={displayQrUrl}
                                                    alt="Payment QR code"
                                                    fill
                                                    className="object-contain"
                                                    unoptimized
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                        Upload payment receipt
                                    </label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="w-full text-sm text-foreground"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0] ?? null;
                                            if (receiptPreviewUrl) {
                                                URL.revokeObjectURL(receiptPreviewUrl);
                                                setReceiptPreviewUrl(null);
                                            }
                                            if (file && file.type.startsWith("image/")) {
                                                setReceiptFile(file);
                                                setReceiptPreviewUrl(URL.createObjectURL(file));
                                            } else {
                                                setReceiptFile(null);
                                            }
                                            e.target.value = "";
                                        }}
                                    />
                                    {receiptFile && receiptPreviewUrl && (
                                        <div className="mt-2">
                                            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                                                <img
                                                    src={receiptPreviewUrl}
                                                    alt="Receipt preview"
                                                    className="h-full w-full object-cover"
                                                />
                                            </div>
                                            <p
                                                className="mt-1 truncate text-xs text-muted-foreground"
                                                title={receiptFile.name}
                                            >
                                                {receiptFile.name}
                                            </p>
                                        </div>
                                    )}
                                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                                        <p>
                                            <span className="font-medium text-foreground">
                                                Account name:
                                            </span>{" "}
                                            {displayAccountName || "—"}
                                        </p>
                                        <p>
                                            <span className="font-medium text-foreground">
                                                Account number:
                                            </span>{" "}
                                            {displayAccountNumber || "—"}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={handleConfirmBooking}
                                className="w-full rounded-lg bg-foreground py-3 text-sm font-semibold text-white transition hover:opacity-90"
                            >
                                {isLoggedIn ? "Confirm booking" : "Login to book"}
                            </button>
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
