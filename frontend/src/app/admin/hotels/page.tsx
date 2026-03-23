"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Building2, Filter, MapPin } from "lucide-react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import type { AdminHotelRow } from "@/types/admin";
import { primaryHotelOwner, verificationStatusStyles } from "@/lib/admin-ui";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const PAGE_SIZE = 8;

type StatusFilter = "all" | "verified" | "pending" | "rejected";

export default function AdminHotelsPage() {
    const [hotels, setHotels] = useState<AdminHotelRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [page, setPage] = useState(1);

    useEffect(() => {
        const token = window.localStorage.getItem("token");
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

    const filtered = useMemo(() => {
        if (statusFilter === "all") return hotels;
        return hotels.filter((h) => h.verification_status === statusFilter);
    }, [hotels, statusFilter]);

    useEffect(() => {
        setPage(1);
    }, [statusFilter, hotels.length]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    return (
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-16">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    Global Hotel Directory
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Manage and monitor verified hotel partners across the globe.
                </p>
            </header>

            <div className="rounded-xl border border-border bg-card shadow-sm">
                <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-muted-foreground" aria-hidden />
                        <label htmlFor="hotel-status-filter" className="sr-only">
                            Filter by status
                        </label>
                        <select
                            id="hotel-status-filter"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                            className={cn(
                                "h-10 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition",
                                "focus-visible:ring-2 focus-visible:ring-ring/30"
                            )}
                        >
                            <option value="all">All statuses</option>
                            <option value="verified">Verified</option>
                            <option value="pending">Pending</option>
                            <option value="rejected">Declined</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="px-5 py-16 text-center text-sm text-muted-foreground">
                        Loading hotels…
                    </div>
                ) : slice.length === 0 ? (
                    <div className="px-5 py-16 text-center text-sm text-muted-foreground">
                        No hotels match this filter.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    <th className="px-5 py-3">Hotel name</th>
                                    <th className="px-5 py-3">Owner</th>
                                    <th className="px-5 py-3">Location</th>
                                    <th className="px-5 py-3">Status</th>
                                    <th className="px-5 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {slice.map((h) => {
                                    const owner = primaryHotelOwner(h);
                                    const ownerLabel =
                                        owner?.full_name?.trim() ||
                                        owner?.email?.trim() ||
                                        "—";
                                    const status = verificationStatusStyles(h.verification_status);
                                    return (
                                        <tr
                                            key={h.id}
                                            className="border-b border-border/80 last:border-0 hover:bg-muted/30"
                                        >
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                                        <Building2 className="h-4 w-4" />
                                                    </span>
                                                    <span className="font-semibold text-foreground">
                                                        {h.name}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-muted-foreground">
                                                {ownerLabel}
                                            </td>
                                            <td className="max-w-[220px] px-5 py-4">
                                                <div className="flex items-start gap-1.5 text-muted-foreground">
                                                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                    <span className="line-clamp-2">{h.address}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={status.className}>{status.label}</span>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <Link
                                                    href={
                                                        h.verification_status === "pending"
                                                            ? `/admin/verification/${h.id}`
                                                            : `/admin/hotels/${h.id}`
                                                    }
                                                    className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                                                >
                                                    View profile
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && filtered.length > 0 && (
                    <div className="px-5 pb-5">
                        <AdminPagination
                            page={safePage}
                            pageSize={PAGE_SIZE}
                            total={filtered.length}
                            onPageChange={setPage}
                            singularLabel="hotel"
                            pluralLabel="hotels"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
