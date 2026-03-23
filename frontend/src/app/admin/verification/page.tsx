"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import type { AdminHotelRow } from "@/types/admin";
import { formatJoinedDate } from "@/lib/admin-ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function AdminVerificationQueuePage() {
    const [hotels, setHotels] = useState<AdminHotelRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) return;

        async function load() {
            const res = await fetch(`${API_BASE}/api/admin/hotels`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = (await res.json()) as AdminHotelRow[];
                setHotels(Array.isArray(data) ? data : []);
            }
            setLoading(false);
        }
        load();
    }, []);

    const pending = hotels.filter((h) => h.verification_status === "pending");

    return (
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 pb-20">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Admin
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                Verification queue
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
                View and manage hotel verifications.
            </p>

            {loading ? (
                <p className="mt-16 text-center text-sm text-muted-foreground">Loading…</p>
            ) : pending.length === 0 ? (
                <div className="mx-auto mt-20 flex max-w-md flex-col items-center text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                        <ClipboardList className="h-9 w-9 text-muted-foreground" />
                    </div>
                    <h2 className="mt-8 text-lg font-semibold text-foreground">
                        Select a registration to review
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        There are no pending hotel applications right now. When hotels submit for
                        verification, they will appear here. You can still browse the full directory
                        anytime.
                    </p>
                    <Link
                        href="/admin/hotels"
                        className="mt-10 inline-flex rounded-lg bg-primary px-8 py-3 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90"
                    >
                        View all hotels
                    </Link>
                </div>
            ) : (
                <div className="mt-10 rounded-xl border border-border bg-card shadow-sm">
                    <div className="border-b border-border px-5 py-4">
                        <h2 className="text-sm font-semibold text-foreground">
                            Pending registrations ({pending.length})
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            Open a hotel to review documents and verify or reject.
                        </p>
                    </div>
                    <ul className="divide-y divide-border">
                        {pending.map((h) => (
                            <li
                                key={h.id}
                                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div>
                                    <p className="font-semibold text-foreground">{h.name}</p>
                                    <p className="mt-0.5 text-sm text-muted-foreground">{h.address}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Submitted {formatJoinedDate(h.created_at)}
                                    </p>
                                </div>
                                <Link
                                    href={`/admin/verification/${h.id}`}
                                    className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
                                >
                                    Review
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
