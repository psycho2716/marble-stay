"use client";

import { useState } from "react";
import Image from "next/image";
import type { MediaItem } from "@/components/RoomMediaCarousel";

type RoomGalleryProps = {
    media: MediaItem[];
};

const VISIBLE_THUMBS = 3;

export function RoomGallery({ media }: RoomGalleryProps) {
    const [index, setIndex] = useState(0);
    const current = media[index] ?? media[0];
    const total = media.length;
    const hasMultiple = total > 1;

    if (total === 0) {
        return (
                            <div className="flex aspect-[16/9] w-full items-center justify-center rounded-xl border border-border bg-muted text-sm text-muted-foreground">
                No images or video
            </div>
        );
    }

    const goPrev = () => setIndex((i) => (i <= 0 ? total - 1 : i - 1));
    const goNext = () => setIndex((i) => (i >= total - 1 ? 0 : i + 1));

    return (
            <div className="space-y-3">
            {/* Hero image */}
            <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
                <div className="aspect-[16/9] w-full">
                    {current.type === "video" ? (
                        <div className="flex h-full w-full items-center justify-center bg-black">
                            <video
                                src={current.url}
                                controls
                                className="max-h-full w-full object-contain"
                                preload="metadata"
                            />
                        </div>
                    ) : (
                        <div className="relative h-full w-full">
                            <Image
                                src={current.url}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="(max-width: 1024px) 100vw, 1024px"
                                unoptimized
                                priority
                            />
                        </div>
                    )}
                </div>

                {/* Navigation is controlled via thumbnails (no arrow buttons to match design). */}
                <div className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                    {index + 1} / {total} Photo{total !== 1 ? "s" : ""}
                </div>
            </div>

            {/* Thumbnails */}
            {hasMultiple && total > 0 && (
                <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: total > VISIBLE_THUMBS ? VISIBLE_THUMBS + 1 : total }, (_, i) => {
                        const isMore = total > VISIBLE_THUMBS && i === VISIBLE_THUMBS;
                        const itemIndex = isMore ? VISIBLE_THUMBS : i;
                        const item = media[itemIndex];
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => setIndex(itemIndex)}
                                className={`relative aspect-[16/9] overflow-hidden rounded-lg border-2 transition ${
                                    index === itemIndex
                                        ? "border-primary ring-1 ring-primary"
                                        : "border-transparent hover:border-border"
                                }`}
                                aria-label={isMore ? `View ${total - VISIBLE_THUMBS} more photos` : `View photo ${i + 1}`}
                            >
                                {item && item.type !== "video" ? (
                                    <Image
                                        src={item.url}
                                        alt=""
                                        fill
                                        className="object-cover"
                                        sizes="200px"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                                        <span className="text-xs">Video</span>
                                    </div>
                                )}
                                {isMore && (
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium text-white">
                                        +{total - VISIBLE_THUMBS} More
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
