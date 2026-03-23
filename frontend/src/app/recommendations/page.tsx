"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { HotelCard } from "@/components/landing/HotelCard";
import { formatNumberCompact } from "@/lib/format";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("token");
    const supabaseToken = localStorage.getItem("supabase_access_token");
    return {
        Authorization: `Bearer ${token ?? ""}`,
        ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
    };
}

type PersonalizedCacheMeta = {
    hit?: boolean;
    expires_at?: string | null;
};

type PersonalizedHotel = {
    id: string;
    name: string;
    address: string | null;
    images?: string[] | null;
    profile_image_url?: string | null;
    average_rating: number;
    review_count: number;
    min_price_night?: number | null;
    ai_match_score?: number | null;
    ai_match_why?: string | null;
    ai_room_ideas?: string[] | null;
};

export default function ForYouRecommendationsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState("");
    const [aiEnabled, setAiEnabled] = useState(false);
    const [hotels, setHotels] = useState<PersonalizedHotel[]>([]);
    const [cacheMeta, setCacheMeta] = useState<PersonalizedCacheMeta | null>(null);

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
            setSummary(
                (data as { error?: string }).error ?? "Could not load personalized recommendations."
            );
            setHotels([]);
            setAiEnabled(false);
            setCacheMeta(null);
            setLoading(false);
            return;
        }

        const body = data as {
            summary?: string;
            ai_enabled?: boolean;
            hotels?: PersonalizedHotel[];
            cache?: PersonalizedCacheMeta;
        };
        setSummary(body.summary ?? "");
        setAiEnabled(Boolean(body.ai_enabled));
        setHotels(Array.isArray(body.hotels) ? body.hotels : []);
        setCacheMeta(body.cache ?? null);
        setLoading(false);
    }, [router]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading) {
        return (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 bg-background px-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Building your picks…</p>
            </div>
        );
    }

    return (
        <div className="bg-background px-4 py-10 pb-16">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="flex items-center gap-2 mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            <Sparkles className="h-7 w-7" />
                            Personalized stays
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Powered by your saved preferences and AI.
                        </p>
                    </div>
                    <Link
                        href="/profile?tab=preferences"
                        className="text-sm font-medium text-primary underline"
                    >
                        Edit preferences
                    </Link>
                </div>

                <div className="mb-10 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
                    <p className="text-sm leading-relaxed text-foreground">{summary}</p>
                    {cacheMeta?.hit === true && cacheMeta.expires_at ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                            Showing saved AI insights. Next refresh after{" "}
                            <time dateTime={cacheMeta.expires_at}>
                                {new Date(cacheMeta.expires_at).toLocaleString(undefined, {
                                    dateStyle: "medium",
                                    timeStyle: "short"
                                })}
                            </time>{" "}
                            (about every 12 hours) to save on model usage.
                        </p>
                    ) : null}
                    {!aiEnabled && (
                        <p className="mt-3 text-xs text-muted-foreground">
                            Tip: add <code className="rounded bg-muted px-1">GEMINI_API_KEY</code>{" "}
                            on the API server for full AI ranking. Standard catalog order is used
                            otherwise.
                        </p>
                    )}
                </div>

                {hotels.length === 0 ? (
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
                ) : (
                    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {hotels.map((h) => (
                            <li key={h.id} className="flex flex-col gap-2">
                                <HotelCard
                                    id={h.id}
                                    name={h.name}
                                    address={h.address}
                                    imageUrl={h.profile_image_url ?? h.images?.[0] ?? null}
                                    rating={h.average_rating > 0 ? h.average_rating : null}
                                    reviewCount={h.review_count}
                                    pricePerNight={
                                        h.min_price_night != null
                                            ? formatNumberCompact(h.min_price_night)
                                            : null
                                    }
                                    currency="PHP"
                                />
                                {(h.ai_match_why ||
                                    (h.ai_room_ideas && h.ai_room_ideas.length)) && (
                                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                                        {h.ai_match_score != null && (
                                            <span className="font-semibold text-foreground">
                                                Match {Math.round(h.ai_match_score)}% ·{" "}
                                            </span>
                                        )}
                                        {h.ai_match_why}
                                        {h.ai_room_ideas && h.ai_room_ideas.length > 0 && (
                                            <span className="mt-1 block text-[11px]">
                                                Rooms: {h.ai_room_ideas.join(" · ")}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
