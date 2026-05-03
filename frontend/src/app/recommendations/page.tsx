"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Loader2 } from "lucide-react";
import { HotelCard } from "@/components/landing/HotelCard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("token");
    const supabaseToken = localStorage.getItem("supabase_access_token");
    return {
        Authorization: `Bearer ${token ?? ""}`,
        ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
    };
}

type PersonalizedHotel = {
    id: string;
    name: string;
    address: string | null;
    images?: string[] | null;
    profile_image_url?: string | null;
    average_rating: number;
    review_count: number;
    min_price_night?: number | null;
};

export default function ForYouRecommendationsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [hotels, setHotels] = useState<PersonalizedHotel[]>([]);

    const load = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) {
            router.replace("/login");
            return;
        }

        const meRes = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
        if (!meRes.ok) {
            router.replace("/login");
            return;
        }
        const me = (await meRes.json()) as { role?: string };
        if (me.role !== "guest") {
            router.replace("/");
            return;
        }

        const res = await fetch(`${API_BASE}/api/recommendations/personalized`, {
            headers: getAuthHeaders()
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setLoadError(
                (data as { error?: string }).error ?? "Could not load personalized recommendations."
            );
            setHotels([]);
            setLoading(false);
            return;
        }

        const body = data as { hotels?: PersonalizedHotel[] };
        setLoadError(null);
        setHotels(Array.isArray(body.hotels) ? body.hotels : []);
        setLoading(false);
    }, [router]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading) {
        return (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 bg-background px-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading your picks…</p>
            </div>
        );
    }

    return (
        <div className="bg-background px-4 py-10 pb-16">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="flex items-center gap-2 mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            <Heart className="h-7 w-7 text-primary" />
                            Personalized stays
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Based on your saved preferences.
                        </p>
                    </div>
                    <Link
                        href="/profile?tab=preferences"
                        className="text-sm font-medium text-primary underline"
                    >
                        Edit preferences
                    </Link>
                </div>

                {loadError ? (
                    <div className="mb-8 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {loadError}
                    </div>
                ) : null}

                {hotels.length === 0 && !loadError ? (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-12 text-center">
                        <p className="text-muted-foreground">
                            No verified hotels to show yet. Try again later or browse the directory.
                        </p>
                        <Link
                            href="/"
                            className="mt-4 inline-block rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
                        >
                            Back to home
                        </Link>
                    </div>
                ) : hotels.length > 0 ? (
                    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {hotels.map((h) => (
                            <li key={h.id}>
                                <HotelCard
                                    id={h.id}
                                    name={h.name}
                                    address={h.address}
                                    imageUrl={h.profile_image_url ?? h.images?.[0] ?? null}
                                    rating={h.average_rating > 0 ? h.average_rating : null}
                                    reviewCount={h.review_count}
                                    pricePerNight={(() => {
                                        const raw = h.min_price_night;
                                        if (raw == null) return null;
                                        const n = typeof raw === "number" ? raw : Number(raw);
                                        if (!Number.isFinite(n) || n <= 0) return null;
                                        return n;
                                    })()}
                                    currency="PHP"
                                />
                            </li>
                        ))}
                    </ul>
                ) : null}
            </div>
        </div>
    );
}
