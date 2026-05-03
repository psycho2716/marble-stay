import Link from "next/link";
import { MapPin } from "lucide-react";
import { Star } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export type HotelCardProps = {
    id: string;
    name: string;
    address: string | null;
    imageUrl: string | null;
    rating: number | null;
    reviewCount: number;
    /** Raw amount or plain numeric string; avoid pre-grouped strings like "2,800" (now tolerated via format). */
    pricePerNight?: string | number | null;
    currency?: string | null;
};

export function HotelCard({
    id,
    name,
    address,
    imageUrl,
    rating,
    reviewCount,
    pricePerNight,
    currency
}: HotelCardProps) {
    return (
        <Link
            href={`/hotels/${id}`}
            className="group block overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:border-primary/30 hover:shadow-md"
        >
            <div className="aspect-[4/3] overflow-hidden bg-muted">
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        No image
                    </div>
                )}
            </div>
            <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-foreground group-hover:text-primary">
                        {name}
                    </h3>
                    {reviewCount > 0 && rating != null && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                            <Star className="h-3.5 w-3.5 fill-current" />
                            {Number(rating).toFixed(1)}
                        </span>
                    )}
                </div>
                {address && (
                    <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        {address}
                    </p>
                )}
                {pricePerNight != null && pricePerNight !== "" && (
                    <p className="mt-3 text-sm font-semibold text-foreground">
                        {formatCurrency(pricePerNight, currency)}
                        <span className="ml-1 font-normal text-muted-foreground">/ night</span>
                    </p>
                )}
            </div>
        </Link>
    );
}
