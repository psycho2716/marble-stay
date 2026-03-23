"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const AUTOPLAY_INTERVAL_MS = 5000;

export type MediaItem = { type: string; path: string; url: string };

export function RoomMediaCarousel({ media }: { media: MediaItem[] }) {
  const [index, setIndex] = useState(0);
  const current = media[index] ?? media[0];
  const hasMultiple = media.length > 1;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goPrev = () => {
    setIndex((i) => (i <= 0 ? media.length - 1 : i - 1));
    restartAutoplay();
  };
  const goNext = () => {
    setIndex((i) => (i >= media.length - 1 ? 0 : i + 1));
    restartAutoplay();
  };

  function restartAutoplay() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (media.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setIndex((i) => (i >= media.length - 1 ? 0 : i + 1));
    }, AUTOPLAY_INTERVAL_MS);
  }

  useEffect(() => {
    if (media.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setIndex((i) => (i >= media.length - 1 ? 0 : i + 1));
    }, AUTOPLAY_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [media.length]);

  if (media.length === 0) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
        No images or video
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
      <div className="aspect-video w-full">
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
              className="object-contain"
              sizes="(max-width: 896px) 100vw, 896px"
              unoptimized
              priority
            />
          </div>
        )}
      </div>

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Previous"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Next"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/50 px-2 py-1.5">
            {media.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setIndex(i);
                  restartAutoplay();
                }}
                className={`h-2 w-2 rounded-full transition ${
                  i === index ? "bg-white" : "bg-white/50 hover:bg-white/80"
                }`}
                aria-label={`Slide ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
