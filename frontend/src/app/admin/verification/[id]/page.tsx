"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
    Ban,
    Check,
    Clock,
    Download,
    ExternalLink,
    Info,
    Mail,
    MapPin,
    Phone,
    ViewIcon,
    ZoomIn
} from "lucide-react";
import type { AdminHotelRow } from "@/types/admin";
import { primaryHotelOwner } from "@/lib/admin-ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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

export default function AdminVerificationReviewPage() {
    const params = useParams();
    const router = useRouter();
    const id = typeof params.id === "string" ? params.id : "";

    const [hotel, setHotel] = useState<AdminHotelRow | null>(null);
    const [hotelLoading, setHotelLoading] = useState(true);
    const [permitUrl, setPermitUrl] = useState<string | null>(null);
    const [permitExpiry, setPermitExpiry] = useState("");
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<string | null>(null);

    const loadHotel = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token || !id) {
            setHotelLoading(false);
            return;
        }
        setHotelLoading(true);
        const res = await fetch(`${API_BASE}/api/admin/hotels/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            setHotel(null);
            setHotelLoading(false);
            return;
        }
        const data = (await res.json()) as AdminHotelRow;
        setHotel(data);
        setHotelLoading(false);
    }, [id]);

    useEffect(() => {
        loadHotel();
    }, [loadHotel]);

    useEffect(() => {
        if (!hotel?.business_permit_file) {
            setPermitUrl(null);
            return;
        }
        const token = localStorage.getItem("token");
        if (!token) return;

        async function sign() {
            const res = await fetch(`${API_BASE}/api/admin/hotels/${id}/permit-url`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                setPermitUrl(null);
                return;
            }
            const { url } = (await res.json()) as { url?: string };
            setPermitUrl(url ?? null);
        }
        sign();
    }, [hotel?.business_permit_file, id]);

    async function updateStatus(action: "verify" | "reject") {
        const token = localStorage.getItem("token");
        if (!token) {
            setError("Not signed in.");
            return;
        }
        setError(null);
        setActionLoading(action);

        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        let body: string | undefined;
        if (action === "verify") {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify({ permit_expires_at: permitExpiry.trim() || null });
        }

        try {
            const res = await fetch(`${API_BASE}/api/admin/hotels/${id}/${action}`, {
                method: "PATCH",
                headers,
                ...(body !== undefined ? { body } : {})
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError((data as { error?: string }).error ?? `Request failed (${res.status})`);
                return;
            }
            setConfirmOpen(false);
            setConfirmAction(null);
            router.push("/admin/verification");
            router.refresh();
        } finally {
            setActionLoading(null);
        }
    }

    if (hotelLoading) {
        return (
            <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground">
                Loading…
            </div>
        );
    }

    if (!hotel) {
        return (
            <div className="mx-auto max-w-6xl px-4 py-16">
                <p className="text-sm text-muted-foreground">Hotel not found.</p>
                <Link
                    href="/admin/verification"
                    className="mt-4 inline-block text-sm font-semibold underline"
                >
                    Back to queue
                </Link>
            </div>
        );
    }

    const owner = primaryHotelOwner(hotel);
    const isPending = hotel.verification_status === "pending";
    const isPdf = permitUrl?.toLowerCase().includes(".pdf") ?? false;
    const mapUrls = buildMapUrls(hotel);

    return (
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-24">
            <ConfirmDialog
                open={confirmOpen}
                onClose={() => {
                    setConfirmOpen(false);
                    setConfirmAction(null);
                }}
                title={
                    confirmAction === "verify" ? "Verify hotel?" : "Reject application?"
                }
                description={
                    confirmAction === "verify"
                        ? "This will verify the hotel and set the permit expiration date. This action cannot be undone."
                        : "This will reject the application. The hotel may need to re-submit documents for verification."
                }
                confirmLabel={confirmAction === "verify" ? "Verify hotel" : "Reject application"}
                cancelLabel="Cancel"
                variant={confirmAction === "reject" ? "destructive" : "default"}
                confirmLoading={actionLoading !== null && actionLoading === confirmAction}
                confirmLoadingLabel={
                    confirmAction === "verify" ? "Verifying…" : "Rejecting…"
                }
                onConfirm={() => {
                    if (confirmAction !== "verify" && confirmAction !== "reject") return;
                    void updateStatus(confirmAction);
                }}
            />
            <nav className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Link href="/admin/verification" className="hover:text-foreground">
                    Admin
                </Link>
                <span className="mx-2">/</span>
                <span>Verification console</span>
            </nav>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
                Review registration
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
                {isPending
                    ? `Pending verification for ${hotel.name}`
                    : `Record for ${hotel.name} (${hotel.verification_status})`}
            </p>

            {error && (
                <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="mt-10 grid gap-8 lg:grid-cols-5">
                <section className="space-y-4 lg:col-span-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Business permit / license
                        </h2>
                        <div className="flex gap-2">
                            {permitUrl && (
                                <>
                                    <a
                                        href={permitUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted"
                                        aria-label="Open in new tab"
                                    >
                                        <ViewIcon className="h-4 w-4" />
                                    </a>
                                    <a
                                        href={permitUrl}
                                        download
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted"
                                        aria-label="Download"
                                    >
                                        <Download className="h-4 w-4" />
                                    </a>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-border bg-[#2d5a5a] p-4 shadow-inner">
                        <div className="min-h-[280px] overflow-hidden rounded-lg bg-white">
                            {!hotel.business_permit_file ? (
                                <div className="flex min-h-[280px] items-center justify-center p-6 text-sm text-muted-foreground">
                                    No document on file.
                                </div>
                            ) : permitUrl && !isPdf ? (
                                // eslint-disable-next-line @next/next/no-img-element -- signed URL
                                <img
                                    src={permitUrl}
                                    alt="Business permit preview"
                                    className="mx-auto max-h-[480px] w-full object-contain"
                                />
                            ) : permitUrl && isPdf ? (
                                <iframe
                                    title="Business permit"
                                    src={permitUrl}
                                    className="h-[min(70vh,520px)] w-full"
                                />
                            ) : (
                                <div className="flex min-h-[280px] items-center justify-center p-6 text-sm text-muted-foreground">
                                    Could not load preview. Use open or download above.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-3 rounded-lg border border-sky-200/80 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                        <p>
                            Confirm the permit matches the legal business name and is current before
                            verifying. Set an expiration date so the hotel must re-submit when the
                            document lapses.
                        </p>
                    </div>
                </section>

                <aside className="space-y-6 lg:col-span-2">
                    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Hotel information
                        </h2>
                        <p className="mt-4 text-lg font-bold text-foreground">{hotel.name}</p>
                        <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                            {hotel.address}
                        </p>
                        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Owner contact
                        </p>
                        <p className="mt-1 text-sm font-medium text-foreground">
                            {owner?.full_name?.trim() || "—"}
                        </p>
                        <div className="flex flex-col">
                            <a
                                href={`mailto:${hotel.contact_email}`}
                                className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                            >
                                <Mail className="h-4 w-4" />
                                {hotel.contact_email}
                            </a>
                            {hotel.contact_phone && (
                                <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-foreground">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    {hotel.contact_phone}
                                </p>
                            )}
                        </div>
                        <div className="mt-5 grid gap-3 border-t border-border pt-4 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">Hotel ID</span>
                                <span className="font-medium text-foreground">{hotel.id}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">Verification status</span>
                                <span className="font-medium capitalize text-foreground">
                                    {hotel.verification_status}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">Submitted</span>
                                <span className="font-medium text-foreground">
                                    {formatDateLabel(hotel.created_at)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">Currency</span>
                                <span className="font-medium text-foreground">
                                    {hotel.currency ?? "—"}
                                </span>
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
                            <div className="mt-4 border-t border-border pt-4">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Hotel bio
                                </p>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                    {hotel.bio}
                                </p>
                            </div>
                        )}

                        <div className="mt-4 border-t border-border pt-4">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Exact location
                                </p>
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
                                    className="h-52 w-full rounded-lg border border-border"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                                    This hotel has no latitude/longitude saved yet. Opening map uses
                                    the hotel address.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Verification decision
                        </h2>

                        {isPending ? (
                            <div className="mt-4 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground">
                                        Permit valid until{" "}
                                        <span className="text-destructive">*</span>
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        Required before you can verify this hotel.
                                    </p>
                                    <input
                                        type="date"
                                        value={permitExpiry}
                                        onChange={(e) => setPermitExpiry(e.target.value)}
                                        className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setConfirmAction("verify");
                                        setConfirmOpen(true);
                                    }}
                                    disabled={
                                        actionLoading !== null ||
                                        !permitExpiry.trim() ||
                                        !hotel.business_permit_file
                                    }
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Check className="h-4 w-4" />
                                    {actionLoading === "verify" ? "Verifying…" : "Verify hotel"}
                                </button>

                                <div>
                                    <label className="text-xs font-medium text-muted-foreground">
                                        Rejection reason (optional reference)
                                    </label>
                                    <select
                                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                                        defaultValue=""
                                    >
                                        <option value="">Select reason…</option>
                                        <option value="incomplete">Incomplete documentation</option>
                                        <option value="unclear">Illegible or expired permit</option>
                                        <option value="mismatch">Business name mismatch</option>
                                    </select>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setConfirmAction("reject");
                                        setConfirmOpen(true);
                                    }}
                                    disabled={actionLoading !== null}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-destructive bg-transparent py-3 text-sm font-semibold text-destructive transition hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Ban className="h-4 w-4" />
                                    {actionLoading === "reject"
                                        ? "Rejecting…"
                                        : "Reject application"}
                                </button>

                                <Link
                                    href="/admin/verification"
                                    className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                                >
                                    <Clock className="h-3.5 w-3.5" />
                                    Skip for now
                                </Link>
                            </div>
                        ) : (
                            <p className="mt-4 text-sm text-muted-foreground">
                                This hotel is no longer pending. No verification actions are
                                available.
                            </p>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
