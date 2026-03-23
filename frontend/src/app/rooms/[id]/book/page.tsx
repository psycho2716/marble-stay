"use client";

import Link from "next/link";
import { useState } from "react";

export default function BookRoomPage({ params }: { params: { id: string } }) {
    const roomId = params.id;
    const [checkIn, setCheckIn] = useState("");
    const [checkOut, setCheckOut] = useState("");
    const [status, setStatus] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setStatus(null);

        try {
            const token =
                typeof window !== "undefined" ? window.localStorage.getItem("token") : null;

            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/bookings`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({
                        room_id: roomId,
                        check_in: checkIn,
                        check_out: checkOut
                    })
                }
            );

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setStatus(body.error ?? "Unable to book this room");
                return;
            }

            setStatus("Booking successful! Please wait for the hotel to confirm your booking.");
        } catch {
            setStatus("Unexpected error booking this room.");
        }
    }

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-5xl px-4 py-10">
                <Link
                    href={`/rooms/${roomId}`}
                    className="text-sm text-primary-600 hover:underline"
                >
                    ← Back to room
                </Link>
                <h1 className="mt-4 mb-6 text-2xl font-semibold tracking-tight">Book this room</h1>
                <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-600">Check-in</label>
                        <input
                            type="date"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-200"
                            value={checkIn}
                            onChange={(e) => setCheckIn(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-600">Check-out</label>
                        <input
                            type="date"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-200"
                            value={checkOut}
                            onChange={(e) => setCheckOut(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        className="rounded-full bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700"
                    >
                        Confirm booking
                    </button>
                    {status && (
                        <p className="text-sm text-slate-700" aria-live="polite">
                            {status}
                        </p>
                    )}
                </form>
            </div>
        </main>
    );
}
