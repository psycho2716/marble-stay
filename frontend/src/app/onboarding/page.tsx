"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ArrowRight,
    Check,
    ChevronLeft,
    Compass,
    Heart,
    Sparkles,
    Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const STEPS = 5;

const TRIP_STYLES = [
    { id: "leisure", label: "Leisure & relax", hint: "Unwind and recharge" },
    { id: "business", label: "Business", hint: "Work trips & meetings" },
    { id: "family", label: "Family", hint: "Kids-friendly pace" },
    { id: "solo", label: "Solo", hint: "Independent travel" },
    { id: "couple", label: "Couple", hint: "Quiet, romantic vibe" },
    { id: "adventure", label: "Adventure", hint: "Active exploration" }
] as const;

const INTEREST_CHIPS = [
    { id: "pool", label: "Pool", amenity: "Pool" },
    { id: "wifi", label: "Fast Wi‑Fi", amenity: "WiFi" },
    { id: "quiet", label: "Quiet rooms", amenity: "Quiet area" },
    { id: "breakfast", label: "Breakfast", amenity: "Breakfast" },
    { id: "beach", label: "Near beach", amenity: "Beach access" },
    { id: "workspace", label: "Workspace", amenity: "Workspace" },
    { id: "pet", label: "Pet-friendly", amenity: "Pet-friendly" },
    { id: "hourly", label: "Hourly / micro-stay", amenity: "Hourly stay" },
    { id: "parking", label: "Parking", amenity: "Parking" },
    { id: "accessible", label: "Accessibility", amenity: "Accessibility" }
] as const;

function getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("token");
    const supabaseToken = localStorage.getItem("supabase_access_token");
    return {
        Authorization: `Bearer ${token ?? ""}`,
        ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
    };
}

export default function GuestOnboardingPage() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [tripIds, setTripIds] = useState<string[]>([]);
    const [budgetMin, setBudgetMin] = useState("");
    const [budgetMax, setBudgetMax] = useState("");
    const [interestIds, setInterestIds] = useState<string[]>([]);
    const [travelExtra, setTravelExtra] = useState("");
    const [hotelExtra, setHotelExtra] = useState("");

    const loadGate = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) {
            router.replace("/login");
            return;
        }
        const res = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
        if (!res.ok) {
            router.replace("/login");
            return;
        }
        const me = (await res.json()) as { role?: string; needs_onboarding?: boolean };
        if (me.role !== "guest") {
            router.replace(me.role === "hotel" ? "/hotel/dashboard" : "/");
            return;
        }
        if (!me.needs_onboarding) {
            router.replace("/recommendations");
            return;
        }
        setLoading(false);
    }, [router]);

    useEffect(() => {
        loadGate();
    }, [loadGate]);

    function toggleTrip(id: string) {
        setTripIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    function toggleInterest(id: string) {
        setInterestIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    function canAdvance(): boolean {
        if (step === 0) return true;
        if (step === 1) return tripIds.length > 0;
        if (step === 2) {
            const min = budgetMin.trim() === "" ? null : Number(budgetMin);
            const max = budgetMax.trim() === "" ? null : Number(budgetMax);
            if (min != null && Number.isNaN(min)) return false;
            if (max != null && Number.isNaN(max)) return false;
            if (min != null && max != null && min > max) return false;
            return true;
        }
        if (step === 3) return interestIds.length > 0;
        if (step === 4) return true;
        return true;
    }

    async function finish() {
        const minVal = budgetMin.trim() === "" ? null : Number(budgetMin);
        const maxVal = budgetMax.trim() === "" ? null : Number(budgetMax);
        if (minVal != null && maxVal != null && minVal > maxVal) {
            toast.error("Max budget should be greater than min budget.");
            return;
        }

        const tripLabels = TRIP_STYLES.filter((t) => tripIds.includes(t.id)).map((t) => t.label);
        const travelParts: string[] = [];
        if (tripLabels.length) travelParts.push(`Travel style: ${tripLabels.join(", ")}.`);
        if (travelExtra.trim()) travelParts.push(travelExtra.trim());
        const travel_needs = travelParts.length ? travelParts.join(" ") : null;

        const amenities = INTEREST_CHIPS.filter((c) => interestIds.includes(c.id)).map(
            (c) => c.amenity
        );

        const hotel_preferences = hotelExtra.trim() || null;

        setSubmitting(true);
        try {
            const prefRes = await fetch(`${API_BASE}/api/preferences`, {
                method: "PATCH",
                headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    budget_min: minVal,
                    budget_max: maxVal,
                    amenities,
                    travel_needs,
                    hotel_preferences
                })
            });
            const prefData = await prefRes.json().catch(() => ({}));
            if (!prefRes.ok) {
                toast.error((prefData as { error?: string }).error ?? "Could not save preferences.");
                return;
            }

            const doneRes = await fetch(`${API_BASE}/api/auth/guest/complete-onboarding`, {
                method: "POST",
                headers: getAuthHeaders()
            });
            const doneData = await doneRes.json().catch(() => ({}));
            if (!doneRes.ok) {
                toast.error(
                    (doneData as { error?: string }).error ?? "Could not finish onboarding."
                );
                return;
            }

            toast.success("You're all set!");
            router.replace("/recommendations");
            router.refresh();
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <div className="flex min-h-[70vh] items-center justify-center bg-background">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-b from-muted/40 via-background to-background px-4 py-10 pb-16">
            <div className="mx-auto max-w-2xl">
                <div className="mb-8 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Compass className="h-4 w-4 text-primary" />
                        <span>Step {step + 1} of {STEPS}</span>
                    </div>
                    <div className="flex gap-1.5">
                        {Array.from({ length: STEPS }).map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "h-1.5 flex-1 rounded-full transition",
                                    i <= step ? "bg-primary" : "bg-border"
                                )}
                                style={{ maxWidth: 48 }}
                            />
                        ))}
                    </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10">
                    {step === 0 && (
                        <div className="text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <Sparkles className="h-7 w-7" />
                            </div>
                            <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                                Welcome to Marble Stay
                            </h1>
                            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                                Tell us how you like to travel. We&apos;ll save your preferences and
                                use them with Google Gemini to suggest hotels, rooms, and vibes that
                                fit you — you can change this anytime in Profile → Preferences.
                            </p>
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                            >
                                Let&apos;s personalize
                                <ArrowRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    {step === 1 && (
                        <div>
                            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                                <Heart className="h-3.5 w-3.5" />
                                Travel style
                            </div>
                            <h2 className="mt-2 text-xl font-bold text-foreground">
                                How do you usually travel?
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Pick one or more — this helps our AI understand your priorities.
                            </p>
                            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                {TRIP_STYLES.map((t) => {
                                    const on = tripIds.includes(t.id);
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => toggleTrip(t.id)}
                                            className={cn(
                                                "flex flex-col rounded-xl border px-4 py-3 text-left text-sm transition",
                                                on
                                                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                                    : "border-border bg-background hover:border-primary/40"
                                            )}
                                        >
                                            <span className="font-semibold text-foreground">
                                                {t.label}
                                            </span>
                                            <span className="mt-0.5 text-xs text-muted-foreground">
                                                {t.hint}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div>
                            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                                <Wallet className="h-3.5 w-3.5" />
                                Budget
                            </div>
                            <h2 className="mt-2 text-xl font-bold text-foreground">
                                Nightly budget (₱)
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Optional ranges help us filter stays. Leave blank if you&apos;re open.
                            </p>
                            <div className="mt-6 grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Min per night
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        placeholder="e.g. 1500"
                                        value={budgetMin}
                                        onChange={(e) => setBudgetMin(e.target.value)}
                                        className="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none ring-primary/20 focus-visible:ring-2"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Max per night
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        placeholder="e.g. 8000"
                                        value={budgetMax}
                                        onChange={(e) => setBudgetMax(e.target.value)}
                                        className="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none ring-primary/20 focus-visible:ring-2"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div>
                            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                                <Sparkles className="h-3.5 w-3.5" />
                                Must-haves
                            </div>
                            <h2 className="mt-2 text-xl font-bold text-foreground">
                                What matters in a stay?
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Tap everything you care about — we map these to listings and AI
                                context.
                            </p>
                            <div className="mt-6 flex flex-wrap gap-2">
                                {INTEREST_CHIPS.map((c) => {
                                    const on = interestIds.includes(c.id);
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => toggleInterest(c.id)}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition",
                                                on
                                                    ? "border-primary bg-primary text-primary-foreground"
                                                    : "border-border bg-background text-foreground hover:border-primary/40"
                                            )}
                                        >
                                            {on && <Check className="h-3.5 w-3.5" />}
                                            {c.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div>
                            <h2 className="text-xl font-bold text-foreground">
                                Anything else we should know?
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Optional details make Gemini recommendations sharper (dietary needs,
                                accessibility, work hours, kids&apos; ages, etc.).
                            </p>
                            <div className="mt-6 space-y-4">
                                <div>
                                    <label className="text-sm font-semibold text-foreground">
                                        Travel needs
                                    </label>
                                    <textarea
                                        value={travelExtra}
                                        onChange={(e) => setTravelExtra(e.target.value)}
                                        placeholder="e.g. Need late check-in, traveling with toddler…"
                                        rows={3}
                                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-foreground">
                                        Hotel preferences
                                    </label>
                                    <textarea
                                        value={hotelExtra}
                                        onChange={(e) => setHotelExtra(e.target.value)}
                                        placeholder="e.g. Rooftop, quiet street, walkable to port…"
                                        rows={3}
                                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step > 0 && (
                        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
                            <button
                                type="button"
                                onClick={() => setStep((s) => Math.max(0, s - 1))}
                                disabled={submitting}
                                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Back
                            </button>
                            {step < STEPS - 1 ? (
                                <button
                                    type="button"
                                    disabled={!canAdvance() || submitting}
                                    onClick={() => setStep((s) => s + 1)}
                                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                                >
                                    Continue
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    disabled={submitting || !canAdvance()}
                                    onClick={() => void finish()}
                                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                                >
                                    {submitting ? "Saving…" : "See my picks"}
                                    <Sparkles className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <p className="mt-6 text-center text-xs text-muted-foreground">
                    Preferences are saved for recommendations. After setup, update anytime under{" "}
                    <span className="font-medium text-foreground">Profile → Preferences</span>.
                </p>
            </div>
        </div>
    );
}
