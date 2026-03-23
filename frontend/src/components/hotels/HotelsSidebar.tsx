"use client";

import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export type HotelsSidebarSearchParams = {
    minPrice?: string;
    maxPrice?: string;
    amenities?: string;
    rating?: string;
};

function safeNumberInput(v: string) {
    const trimmed = v.trim();
    if (!trimmed) return "";
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? String(n) : "";
}

export function HotelsSidebar({
    searchParams,
    amenityOptions
}: {
    searchParams?: HotelsSidebarSearchParams;
    amenityOptions?: string[];
}) {
    const router = useRouter();

    const baseParams = useMemo(() => {
        const p = new URLSearchParams();
        if (searchParams?.minPrice) p.set("minPrice", searchParams.minPrice);
        if (searchParams?.maxPrice) p.set("maxPrice", searchParams.maxPrice);
        if (searchParams?.rating) p.set("rating", searchParams.rating);
        if (searchParams?.amenities) p.set("amenities", searchParams.amenities);
        return p;
    }, [
        searchParams?.amenities,
        searchParams?.maxPrice,
        searchParams?.minPrice,
        searchParams?.rating
    ]);

    const updateParam = useCallback(
        (key: string, value: string | null) => {
            const next = new URLSearchParams(baseParams.toString());
            if (value) next.set(key, value);
            else next.delete(key);
            const qs = next.toString();
            router.push(qs ? `/hotels?${qs}` : "/hotels", { scroll: false });
        },
        [router, baseParams]
    );

    const rating = searchParams?.rating ?? "";
    const amenities = new Set((searchParams?.amenities ?? "").split(",").filter(Boolean));

    const [minPriceDraft, setMinPriceDraft] = useState(searchParams?.minPrice ?? "");
    const [maxPriceDraft, setMaxPriceDraft] = useState(searchParams?.maxPrice ?? "");

    useEffect(() => setMinPriceDraft(searchParams?.minPrice ?? ""), [searchParams?.minPrice]);
    useEffect(() => setMaxPriceDraft(searchParams?.maxPrice ?? ""), [searchParams?.maxPrice]);

    const toggleAmenity = (value: string) => {
        const next = new Set(amenities);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        const str = [...next].filter(Boolean).join(",");
        const nextParams = new URLSearchParams(baseParams.toString());
        if (str) nextParams.set("amenities", str);
        else nextParams.delete("amenities");
        const qs = nextParams.toString();
        router.push(qs ? `/hotels?${qs}` : "/hotels", { scroll: false });
    };

    return (
        <aside className="w-full shrink-0 lg:w-60">
            <div className="space-y-8">
                <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Price Range
                    </h3>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Min</label>
                            <input
                                inputMode="numeric"
                                value={minPriceDraft}
                                onChange={(e) => setMinPriceDraft(e.target.value)}
                                onBlur={() =>
                                    updateParam("minPrice", safeNumberInput(minPriceDraft) || null)
                                }
                                placeholder="0"
                                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Max</label>
                            <input
                                inputMode="numeric"
                                value={maxPriceDraft}
                                onChange={(e) => setMaxPriceDraft(e.target.value)}
                                onBlur={() =>
                                    updateParam("maxPrice", safeNumberInput(maxPriceDraft) || null)
                                }
                                placeholder="Any"
                                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setMinPriceDraft("");
                            setMaxPriceDraft("");
                            const next = new URLSearchParams(baseParams.toString());
                            next.delete("minPrice");
                            next.delete("maxPrice");
                            const qs = next.toString();
                            router.push(qs ? `/hotels?${qs}` : "/hotels", { scroll: false });
                        }}
                        className="mt-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                        Clear range
                    </button>
                </div>
                <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Amenities
                    </h3>
                    <ul className="mt-3 space-y-2">
                        {(amenityOptions ?? []).length === 0 ? (
                            <li className="text-sm text-muted-foreground">
                                No amenities available.
                            </li>
                        ) : (
                            (amenityOptions ?? []).map((label) => (
                                <li key={label} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id={`amenity-${label}`}
                                        checked={amenities.has(label)}
                                        onChange={() => toggleAmenity(label)}
                                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary/20"
                                    />
                                    <label
                                        htmlFor={`amenity-${label}`}
                                        className="text-sm text-muted-foreground"
                                    >
                                        {label}
                                    </label>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
                <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Rating
                    </h3>
                    <div className="mt-3 flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((v) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() =>
                                    updateParam("rating", rating === String(v) ? null : String(v))
                                }
                                className="rounded-md p-1.5 hover:bg-muted"
                                aria-label={`Minimum ${v} star rating`}
                            >
                                <Star
                                    className={`h-5 w-5 ${
                                        Number(rating || 0) >= v
                                            ? "fill-amber-400 text-amber-500"
                                            : "text-muted-foreground"
                                    }`}
                                />
                            </button>
                        ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                            {rating ? `Showing ${rating}★ and up` : "Any rating"}
                        </p>
                        {rating ? (
                            <button
                                type="button"
                                onClick={() => updateParam("rating", null)}
                                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                            >
                                Clear
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
        </aside>
    );
}
