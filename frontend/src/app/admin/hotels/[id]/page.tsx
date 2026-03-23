"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, ExternalLink, Mail, MapPin, Phone, ZoomIn } from "lucide-react";
import type { AdminHotelRow } from "@/types/admin";
import { primaryHotelOwner, verificationStatusStyles } from "@/lib/admin-ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function formatDateLabel(value?: string | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function buildMapUrls(hotel: AdminHotelRow): { embed: string | null; external: string } {
    const lat = hotel.latitude;
    const lng = hotel.longitude;
    if (typeof lat === "number" && typeof lng === "number") {
        return {
            embed: `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`,
            external: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        };
    }
    return {
        embed: null,
        external: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotel.address)}`
    };
}

export default function AdminHotelDetailPage() {
    const params = useParams();
    const id = typeof params.id === "string" ? params.id : "";
    const [hotel, setHotel] = useState<AdminHotelRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [permitUrl, setPermitUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const token = window.localStorage.getItem("token");
        if (!token) return;

        async function load() {
            setLoading(true);
            const res = await fetch(`${API_BASE}/api/admin/hotels/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                setError("Hotel not found.");
                setHotel(null);
                setLoading(false);
                return;
            }
            const data = (await res.json()) as AdminHotelRow;
            setHotel(data);
            setError(null);
            setLoading(false);
        }
        load();
    }, [id]);

    useEffect(() => {
        if (!hotel?.business_permit_file || !id) {
            setPermitUrl(null);
            return;
        }
        const token = window.localStorage.getItem("token");
        if (!token) return;

        async function signPermitUrl() {
            const res = await fetch(`${API_BASE}/api/admin/hotels/${id}/permit-url`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                setPermitUrl(null);
                return;
            }
            const data = (await res.json()) as { url?: string };
            setPermitUrl(data.url ?? null);
        }

        void signPermitUrl();
    }, [hotel?.business_permit_file, id]);

    if (loading) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-muted-foreground">
                Loading…
            </div>
        );
    }

    if (!hotel || error) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-16">
                <p className="text-sm text-muted-foreground">{error ?? "Unable to load hotel."}</p>
                <Link
                    href="/admin/hotels"
                    className="mt-4 inline-flex text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                >
                    ← Back to directory
                </Link>
            </div>
        );
    }

    const owner = primaryHotelOwner(hotel);
    const status = verificationStatusStyles(hotel.verification_status);
    const mapUrls = buildMapUrls(hotel);
    const isPermitPdf = permitUrl?.toLowerCase().includes(".pdf") ?? false;

    return (
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-16">
            <Link
                href="/admin/hotels"
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to directory
            </Link>

            <header className="mt-8">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Admin · Hotel profile
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                    {hotel.name}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className={status.className}>{status.label}</span>
                </div>
            </header>

            <div className="mt-8 space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
                <div>
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Address
                    </h2>
                    <p className="mt-2 flex items-start gap-2 text-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        {hotel.address}
                    </p>
                </div>

                {hotel.description && (
                    <div>
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Description
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {hotel.description}
                        </p>
                    </div>
                )}

                <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Owner contact
                        </h2>
                        <p className="mt-2 text-sm font-medium text-foreground">
                            {owner?.full_name?.trim() || "—"}
                        </p>
                        <a
                            href={`mailto:${hotel.contact_email}`}
                            className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                        >
                            <Mail className="h-4 w-4" />
                            {hotel.contact_email}
                        </a>
                        {hotel.contact_phone && (
                            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="h-4 w-4" />
                                {hotel.contact_phone}
                            </p>
                        )}
                    </div>
                    <div>
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Submitted
                        </h2>
                        <p className="mt-2 text-sm text-foreground">
                            {formatDateLabel(hotel.created_at)}
                        </p>
                    </div>
                </div>

                <div className="grid gap-3 border-t border-border pt-6 text-sm">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Hotel ID</span>
                        <span className="font-medium text-foreground">{hotel.id}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Hotel phone</span>
                        <span className="font-medium text-foreground">
                            {hotel.contact_phone?.trim() ? hotel.contact_phone : "—"}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Currency</span>
                        <span className="font-medium text-foreground">{hotel.currency ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Coordinates</span>
                        <span className="font-medium text-foreground">
                            {typeof hotel.latitude === "number" &&
                            typeof hotel.longitude === "number"
                                ? `${hotel.latitude.toFixed(6)}, ${hotel.longitude.toFixed(6)}`
                                : "Not set"}
                        </span>
                    </div>
                </div>

                {hotel.bio && (
                    <div className="border-t border-border pt-6">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Hotel bio
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {hotel.bio}
                        </p>
                    </div>
                )}

                <div className="border-t border-border pt-6">
                    <div className="mb-2 flex items-center justify-between">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Submitted legal document
                        </h2>
                        {permitUrl ? (
                            <div className="flex items-center gap-2">
                                <a
                                    href={permitUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted"
                                    aria-label="Open legal document in new tab"
                                >
                                    <ZoomIn className="h-4 w-4" />
                                </a>
                                <a
                                    href={permitUrl}
                                    download
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted"
                                    aria-label="Download legal document"
                                >
                                    <Download className="h-4 w-4" />
                                </a>
                            </div>
                        ) : null}
                    </div>
                    <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                        {!hotel.business_permit_file ? (
                            <div className="p-4 text-sm text-muted-foreground">
                                No submitted legal document on file.
                            </div>
                        ) : permitUrl ? (
                            isPermitPdf ? (
                                <iframe
                                    title="Submitted legal document"
                                    src={permitUrl}
                                    className="h-[min(65vh,520px)] w-full bg-white"
                                />
                            ) : (
                                // eslint-disable-next-line @next/next/no-img-element -- signed URL
                                <img
                                    src={permitUrl}
                                    alt="Submitted legal document"
                                    className="mx-auto max-h-[520px] w-full object-contain bg-white"
                                />
                            )
                        ) : (
                            <div className="p-4 text-sm text-muted-foreground">
                                Could not load document preview.
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t border-border pt-6">
                    <div className="mb-2 flex items-center justify-between">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Exact location
                        </h2>
                        <a
                            href={mapUrls.external}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                            Open map
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </div>
                    {mapUrls.embed ? (
                        <iframe
                            title="Hotel location map"
                            src={mapUrls.embed}
                            className="h-64 w-full rounded-lg border border-border"
                            loading="lazy"
                        />
                    ) : (
                        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                            This hotel has no latitude/longitude saved yet. Opening map uses the
                            hotel address.
                        </div>
                    )}
                </div>

                {hotel.verification_status === "pending" && (
                    <div className="border-t border-border pt-6">
                        <Link
                            href={`/admin/verification/${hotel.id}`}
                            className="inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90"
                        >
                            Open verification
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
