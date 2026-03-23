"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Hours in a day (0–23) displayed as 12-hour times from 12:00 AM to 11:00 PM
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export type HotelPaymentInfo = {
    payment_qr_image_url?: string | null;
    payment_account_name?: string | null;
    payment_account_number?: string | null;
};

type BookingModalProps = {
    roomId: string;
    roomName: string;
    basePriceNight: string;
    hotel: HotelPaymentInfo;
    onClose: () => void;
    onSuccess?: () => void;
    offerHourly?: boolean;
    hourlyRate?: string;
    initialCheckIn?: string;
    initialCheckOut?: string;
};

export function BookingModal({
    roomId,
    roomName,
    basePriceNight,
    hotel,
    onClose,
    onSuccess,
    offerHourly,
    hourlyRate,
    initialCheckIn,
    initialCheckOut
}: BookingModalProps) {
    const router = useRouter();
    const [bookingType, setBookingType] = useState<"nightly" | "hourly">("nightly");
    const [checkIn, setCheckIn] = useState(initialCheckIn ?? "");
    const [checkOut, setCheckOut] = useState(initialCheckOut ?? "");
    const [hourlyDate, setHourlyDate] = useState("");
    const [selectedHours, setSelectedHours] = useState<number[]>([]);
    const [availableHours, setAvailableHours] = useState<number[] | null>(null);
    const [loadingHourlySlots, setLoadingHourlySlots] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
        null
    );
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const nights = useMemo(() => {
        if (!checkIn || !checkOut) return 0;
        const a = new Date(checkIn);
        const b = new Date(checkOut);
        const diff = (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
        return Number.isFinite(diff) && diff > 0 ? Math.floor(diff) : 0;
    }, [checkIn, checkOut]);

    const nightlyTotal = useMemo(
        () => nights * Number(basePriceNight || 0),
        [nights, basePriceNight]
    );
    const hourlyTotal = useMemo(
        () => selectedHours.length * Number(hourlyRate || 0),
        [selectedHours.length, hourlyRate]
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        const token = window.localStorage.getItem("token");
        setIsLoggedIn(Boolean(token));
    }, []);

    useEffect(() => {
        if (initialCheckIn != null) setCheckIn(initialCheckIn);
        if (initialCheckOut != null) setCheckOut(initialCheckOut);
    }, [initialCheckIn, initialCheckOut]);

    useEffect(() => {
        if (bookingType !== "hourly" || !hourlyDate) {
            setAvailableHours(null);
            setSelectedHours([]);
            return;
        }
        let cancelled = false;
        setLoadingHourlySlots(true);
        setAvailableHours(null);
        setSelectedHours([]);
        fetch(`${API_BASE}/api/rooms/${roomId}/hourly-slots?date=${encodeURIComponent(hourlyDate)}`)
            .then((res) => res.json())
            .then((data: { hours?: number[] }) => {
                if (!cancelled && Array.isArray(data.hours)) {
                    setAvailableHours(data.hours);
                } else if (!cancelled) {
                    setAvailableHours([]);
                }
            })
            .catch(() => {
                if (!cancelled) setAvailableHours([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingHourlySlots(false);
            });
        return () => {
            cancelled = true;
        };
    }, [bookingType, roomId, hourlyDate]);

    const canConfirmPayment =
        paymentMethod === "cash" || (paymentMethod === "online" && receiptFile != null);
    const canConfirmDates =
        bookingType === "nightly" ? nights > 0 : hourlyDate !== "" && selectedHours.length > 0;
    const canConfirm = canConfirmPayment && canConfirmDates;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);
        if (!isLoggedIn) {
            router.push("/login");
            return;
        }
        if (paymentMethod === "online" && !receiptFile) {
            setMessage({ type: "error", text: "Please upload your payment receipt to continue." });
            return;
        }
        if (bookingType === "nightly" && nights <= 0) {
            setMessage({
                type: "error",
                text: "Please select valid check-in and check-out dates."
            });
            return;
        }
        if (bookingType === "hourly" && (!hourlyDate || selectedHours.length === 0)) {
            setMessage({ type: "error", text: "Please select a date and at least one hour." });
            return;
        }
        setSubmitting(true);
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const supabaseToken =
            typeof window !== "undefined" ? localStorage.getItem("supabase_access_token") : null;
        if (!token) {
            setMessage({ type: "error", text: "Please log in to book." });
            setSubmitting(false);
            return;
        }
        try {
            const formData = new FormData();
            formData.append("room_id", roomId);
            formData.append("payment_method", paymentMethod);
            if (bookingType === "nightly") {
                formData.append("check_in", checkIn);
                formData.append("check_out", checkOut);
                formData.append("booking_type", "nightly");
            } else {
                formData.append("check_in", hourlyDate);
                formData.append("check_out", hourlyDate);
                formData.append("booking_type", "hourly");
                formData.append("hours", JSON.stringify(selectedHours));
            }
            if (paymentMethod === "online" && receiptFile) {
                formData.append("receipt", receiptFile);
            }
            const res = await fetch(`${API_BASE}/api/bookings`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
                },
                body: formData
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMessage({ type: "error", text: data.error ?? "Booking failed." });
                setSubmitting(false);
                return;
            }
            setMessage({
                type: "success",
                text: "Room booked successfully. Please wait for the hotel to confirm your booking."
            });
            onSuccess?.();
            setTimeout(() => onClose(), 1500);
        } catch {
            setMessage({ type: "error", text: "Something went wrong." });
        }
        setSubmitting(false);
    }

    const hasOnlinePayment =
        hotel.payment_qr_image_url || hotel.payment_account_name || hotel.payment_account_number;

    const handleDownloadQr = useCallback(async () => {
        const url = hotel.payment_qr_image_url;
        if (!url) return;
        try {
            const res = await fetch(url, { mode: "cors" });
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = "payment-qr.png";
            a.click();
            URL.revokeObjectURL(blobUrl);
        } catch {
            window.open(url, "_blank", "noopener");
        }
    }, [hotel.payment_qr_image_url]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" aria-hidden onClick={onClose} />
            <div
                className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                    <h2 className="text-lg font-semibold text-slate-900">Book: {roomName}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Close"
                    >
                        <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4 p-4">
                    {offerHourly && hourlyRate != null && (
                        <div>
                            <span className="mb-2 block text-sm font-medium text-slate-700">
                                Booking type
                            </span>
                            <div className="flex gap-4">
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="radio"
                                        name="booking_type"
                                        checked={bookingType === "nightly"}
                                        onChange={() => setBookingType("nightly")}
                                        className="text-primary-600"
                                    />
                                    <span className="text-sm">Nightly</span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="radio"
                                        name="booking_type"
                                        checked={bookingType === "hourly"}
                                        onChange={() => setBookingType("hourly")}
                                        className="text-primary-600"
                                    />
                                    <span className="text-sm">Hourly</span>
                                </label>
                            </div>
                        </div>
                    )}

                    {bookingType === "nightly" ? (
                        <>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Check-in
                                </label>
                                <input
                                    type="date"
                                    required={bookingType === "nightly"}
                                    value={checkIn}
                                    onChange={(e) => setCheckIn(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Check-out
                                </label>
                                <input
                                    type="date"
                                    required={bookingType === "nightly"}
                                    value={checkOut}
                                    onChange={(e) => setCheckOut(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                />
                            </div>
                            <p className="text-sm text-slate-600">₱{basePriceNight} /night</p>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Date
                                </label>
                                <input
                                    type="date"
                                    required={bookingType === "hourly"}
                                    value={hourlyDate}
                                    onChange={(e) => setHourlyDate(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700">
                                    Select hours
                                </label>
                                {!hourlyDate ? (
                                    <p className="text-sm text-slate-500">
                                        Select a date to see available hours.
                                    </p>
                                ) : loadingHourlySlots ? (
                                    <p className="text-sm text-slate-500">
                                        Loading available hours…
                                    </p>
                                ) : availableHours !== null && availableHours.length === 0 ? (
                                    <div>
                                        <p className="text-sm font-medium text-slate-600">
                                            Fully booked
                                        </p>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            All hours for this date are already reserved. Try another date.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {HOUR_OPTIONS.map((h) => {
                                            const isAvailable =
                                                availableHours != null &&
                                                availableHours.includes(h);
                                            return (
                                                <label
                                                    key={h}
                                                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                                                        !isAvailable
                                                            ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                                                            : selectedHours.includes(h)
                                                              ? "cursor-pointer border-primary-500 bg-primary-50 text-primary-700"
                                                              : "cursor-pointer border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only"
                                                        disabled={!isAvailable}
                                                        checked={selectedHours.includes(h)}
                                                        onChange={() => {
                                                            if (!isAvailable) return;
                                                            setSelectedHours((prev) =>
                                                                prev.includes(h)
                                                                    ? prev.filter((x) => x !== h)
                                                                    : [...prev, h].sort(
                                                                          (a, b) => a - b
                                                                      )
                                                            );
                                                        }}
                                                    />
                                                    {(() => {
                                                        const displayHour = h % 12 || 12;
                                                        const period = h < 12 ? "AM" : "PM";
                                                        return `${displayHour}:00 ${period}`;
                                                    })()}
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <p className="text-sm text-slate-600">₱{hourlyRate} /hr</p>
                        </>
                    )}

                    {/* Payment summary */}
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-medium text-slate-700">Payment summary</p>
                        {bookingType === "nightly" ? (
                            <>
                                {nights > 0 ? (
                                    <p className="mt-1 text-sm text-slate-600">
                                        {nights} night{nights !== 1 ? "s" : ""} × ₱{basePriceNight}{" "}
                                        ={" "}
                                        <span className="font-semibold text-slate-900">
                                            ₱{nightlyTotal.toLocaleString()}
                                        </span>
                                    </p>
                                ) : (
                                    <p className="mt-1 text-sm text-slate-500">
                                        Select check-in and check-out dates to see total.
                                    </p>
                                )}
                            </>
                        ) : (
                            <>
                                {selectedHours.length > 0 ? (
                                    <p className="mt-1 text-sm text-slate-600">
                                        {selectedHours.length} hour
                                        {selectedHours.length !== 1 ? "s" : ""} × ₱{hourlyRate}/hr ={" "}
                                        <span className="font-semibold text-slate-900">
                                            ₱{hourlyTotal.toLocaleString()}
                                        </span>
                                    </p>
                                ) : (
                                    <p className="mt-1 text-sm text-slate-500">
                                        Select a date and hours to see total.
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    <div>
                        <span className="mb-2 block text-sm font-medium text-slate-700">
                            Payment method
                        </span>
                        <div className="flex gap-4">
                            <label className="flex cursor-pointer items-center gap-2">
                                <input
                                    type="radio"
                                    name="payment"
                                    checked={paymentMethod === "cash"}
                                    onChange={() => {
                                        setPaymentMethod("cash");
                                        setReceiptFile(null);
                                    }}
                                    className="text-primary-600"
                                />
                                <span className="text-sm">Cash</span>
                            </label>
                            {hasOnlinePayment && (
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="radio"
                                        name="payment"
                                        checked={paymentMethod === "online"}
                                        onChange={() => setPaymentMethod("online")}
                                        className="text-primary-600"
                                    />
                                    <span className="text-sm">Online payment (scan QR)</span>
                                </label>
                            )}
                        </div>
                    </div>

                    {paymentMethod === "online" && hasOnlinePayment && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <p className="mb-3 text-center text-sm font-medium text-slate-700">
                                Scan to pay
                            </p>
                            <div className="flex flex-col items-center text-center">
                                {hotel.payment_qr_image_url && (
                                    <div className="flex flex-col items-center">
                                        <div className="relative aspect-square w-[200px] overflow-hidden rounded-lg border border-slate-200 bg-white">
                                            <Image
                                                src={hotel.payment_qr_image_url}
                                                alt="Payment QR code"
                                                fill
                                                className="object-contain"
                                                unoptimized
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleDownloadQr}
                                            className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                        >
                                            <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                                aria-hidden
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                                />
                                            </svg>
                                            Download QR
                                        </button>
                                    </div>
                                )}
                                <div className="mt-3 space-y-1 text-sm text-slate-700">
                                    <p>
                                        <span className="font-medium text-slate-500">
                                            Account name:
                                        </span>{" "}
                                        {hotel.payment_account_name || "—"}
                                    </p>
                                    <p>
                                        <span className="font-medium text-slate-500">
                                            Account number:
                                        </span>{" "}
                                        {hotel.payment_account_number || "—"}
                                    </p>
                                </div>
                                <div className="mt-4 w-full">
                                    <label className="mb-1.5 block text-center text-sm font-medium text-slate-700">
                                        Upload payment receipt{" "}
                                        <span className="text-red-500">*</span>
                                    </label>
                                    <div className="flex flex-col items-center gap-2">
                                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                                            <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                                aria-hidden
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 16m4-4v4"
                                                />
                                            </svg>
                                            {receiptFile ? receiptFile.name : "Choose image…"}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) =>
                                                    setReceiptFile(e.target.files?.[0] ?? null)
                                                }
                                            />
                                        </label>
                                        {receiptFile && (
                                            <button
                                                type="button"
                                                onClick={() => setReceiptFile(null)}
                                                className="text-xs text-slate-500 hover:text-slate-700"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {message && (
                        <p
                            className={`text-sm ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}
                        >
                            {message.text}
                            {message.type === "error" &&
                                message.text === "Please log in to book." && (
                                    <>
                                        {" "}
                                        <Link href="/login" className="font-medium underline">
                                            Log in
                                        </Link>
                                    </>
                                )}
                        </p>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                        {isLoggedIn ? (
                            <button
                                type="submit"
                                disabled={submitting || !canConfirm}
                                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                            >
                                {submitting ? "Booking…" : "Confirm booking"}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => router.push("/login")}
                                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                            >
                                Login to book
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
