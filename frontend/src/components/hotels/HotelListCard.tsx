import Link from "next/link";
import { Star } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { Separator } from "../ui/separator";

export type HotelListCardProps = {
    id: string;
    name: string;
    address: string | null;
    imageUrl: string | null;
    rating?: number | null;
    reviewCount?: number;
    description?: string | null;
    pricePerNight?: string | null;
    /** ISO 4217 code (e.g. PHP, USD). Defaults to PHP. */
    currency?: string | null;
};

export function HotelListCard({
    id,
    name,
    address,
    imageUrl,
    rating,
    reviewCount = 0,
    description,
    pricePerNight,
    currency
}: HotelListCardProps) {
    return (
        <article className="overflow-hidden rounded border border-border bg-card">
            <div className="flex flex-col md:flex-row md:items-stretch">
                <div className="h-44 w-full shrink-0 bg-muted md:h-auto md:w-[320px]">
                    {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            No image
                        </div>
                    )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 p-6">
                    <div className="min-w-0">
                        <div className="flex items-start justify-between gap-4">
                            <h2 className="truncate text-base font-semibold text-foreground md:text-lg">
                                {name}
                            </h2>
                            <div className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-amber-500 text-end">
                                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                                <span>{rating == null ? "0" : Number(rating).toFixed(1)}</span>
                            </div>
                        </div>

                        {address && <p className="mt-1 text-sm text-muted-foreground">{address}</p>}

                        <Separator className="my-2 w-full h-[1px]" />

                        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                            {description?.trim() ||
                                "A comfortable stay with thoughtfully designed rooms and great service."}
                        </p>
                    </div>

                    <div className="flex items-end justify-between gap-6">
                        {pricePerNight != null && pricePerNight !== "" ? (
                            <div className="shrink-0">
                                <p className="text-2xl font-bold text-foreground">
                                    {formatCurrency(pricePerNight, currency)}
                                </p>
                                <p className="-mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    per night
                                </p>
                            </div>
                        ) : (
                            <div />
                        )}

                        <Link
                            href={`/hotels/${id}`}
                            className="inline-flex h-10 items-center justify-center rounded-md bg-foreground px-7 text-sm font-semibold text-background hover:opacity-90"
                        >
                            View Details
                        </Link>
                    </div>
                </div>
            </div>
        </article>
    );
}
