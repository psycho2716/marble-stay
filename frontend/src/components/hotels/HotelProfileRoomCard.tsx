import Link from "next/link";
import Image from "next/image";
import { formatCurrency } from "@/lib/format";

export type HotelProfileRoomCardProps = {
    id: string;
    name: string;
    description?: string | null;
    base_price_night: string;
    main_image_url?: string | null;
    currency?: string | null;
    /** Optional badge text (e.g. "MOST POPULAR", "LUXURY TIER") shown top-right on image */
    badge?: string | null;
};

export function HotelProfileRoomCard({
    id,
    name,
    description,
    base_price_night,
    main_image_url,
    currency,
    badge
}: HotelProfileRoomCardProps) {
    return (
        <article className="h-full flex flex-col overflow-hidden rounded border border-border bg-card">
            <Link
                href={`/rooms/${id}`}
                className="relative block aspect-[4/3] w-full shrink-0 bg-muted"
            >
                {main_image_url ? (
                    <Image
                        src={main_image_url}
                        alt={name}
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                        unoptimized
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        No image
                    </div>
                )}
                {badge && (
                    <span className="absolute right-2 top-2 rounded bg-card px-2 py-0.5 text-xs font-semibold text-foreground shadow border border-border">
                        {badge}
                    </span>
                )}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
                <h3 className="font-semibold text-foreground">{name}</h3>
                <div className="shrink-0">
                    <p className="text-xl font-bold text-foreground">
                        {formatCurrency(base_price_night, currency)}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        per night
                    </p>
                </div>
                {description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
                )}
                <Link
                    href={`/rooms/${id}`}
                    className="mt-auto inline-flex w-full items-center justify-center rounded-md border border-foreground bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
                >
                    View Details
                </Link>
            </div>
        </article>
    );
}
