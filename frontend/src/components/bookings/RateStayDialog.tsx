"use client";

import { useEffect, useId, useState } from "react";
import { Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type RateStayDialogProps = {
    open: boolean;
    onClose: () => void;
    bookingId: string | null;
    hotelName: string;
    apiBase: string;
    getAuthHeaders: () => HeadersInit;
    onSuccess: () => void;
};

export function RateStayDialog({
    open,
    onClose,
    bookingId,
    hotelName,
    apiBase,
    getAuthHeaders,
    onSuccess
}: RateStayDialogProps) {
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const titleId = useId();

    useEffect(() => {
        if (open) {
            setRating(5);
            setComment("");
        }
    }, [open, bookingId]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !submitting) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose, submitting]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!bookingId) return;
        setSubmitting(true);
        try {
            const res = await fetch(`${apiBase}/api/bookings/${bookingId}/review`, {
                method: "POST",
                headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    rating,
                    comment: comment.trim() || null
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error((data as { error?: string }).error ?? "Could not submit review.");
                return;
            }
            toast.success("Thanks for your feedback!");
            onSuccess();
            onClose();
        } finally {
            setSubmitting(false);
        }
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <button
                type="button"
                aria-label="Dismiss"
                disabled={submitting}
                className="absolute inset-0 bg-black/50 disabled:cursor-not-allowed"
                onClick={() => !submitting && onClose()}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative z-[101] w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg sm:p-8"
            >
                <div className="flex items-start justify-between gap-4">
                    <h2 id={titleId} className="text-lg font-bold text-foreground sm:text-xl">
                        Rate your stay
                    </h2>
                    <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                        disabled={submitting}
                        onClick={() => onClose()}
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-6">
                    <p className="text-center text-sm leading-relaxed text-muted-foreground sm:text-base">
                        How was your experience at{" "}
                        <span className="font-semibold text-foreground">{hotelName}</span>?
                    </p>

                    <div className="mt-8 flex justify-center gap-1 sm:gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setRating(n)}
                                disabled={submitting}
                                className={cn(
                                    "rounded-lg p-1.5 transition hover:bg-amber-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 disabled:opacity-50",
                                    n <= rating ? "text-amber-500" : "text-amber-400"
                                )}
                                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                            >
                                <Star
                                    className={cn(
                                        "h-9 w-9 sm:h-10 sm:w-10",
                                        n <= rating
                                            ? "fill-amber-400 text-amber-500"
                                            : "fill-transparent text-amber-400"
                                    )}
                                />
                            </button>
                        ))}
                    </div>

                    <label htmlFor="rate-stay-comment" className="sr-only">
                        Comments
                    </label>
                    <textarea
                        id="rate-stay-comment"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={5}
                        maxLength={2000}
                        disabled={submitting}
                        placeholder="Share your thoughts about your stay…"
                        className="mt-8 w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />

                    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full sm:w-auto"
                            disabled={submitting}
                            onClick={() => onClose()}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
                            {submitting ? "Submitting…" : "Submit review"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
